// The rules a listing has to meet. Everything that protects a family from a hostile or careless
// listing is code in this file rather than a sentence in a contributing guide, because a rule
// that is only written down is checked by whoever remembers it.
//
// No network, no side effects: give it text and bytes, get back a list of what is wrong.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';
import Ajv from 'ajv';

/** The permissions a key can have. Mirrors the service's closed list. */
export const SCOPES = ['state:read', 'timer:start', 'timer:extend', 'timer:stop', 'timer:cancel', 'requests:read'];

/** The only placeholders an installation step may use, and only inside a code block. */
export const PLACEHOLDERS = ['FMM_URL', 'API_KEY'];

/** A plugin's icon. */
export const ICON = { name: 'icon.png', minSide: 128, maxSide: 512, maxBytes: 100 * 1024 };

/** The files a listing folder may contain. Anything else is refused: nothing hides in a listing. */
export const LISTING_FILES = ['plugin.json', 'listing.json', 'icon.png'];

const here = (relative) => fileURLToPath(new URL(relative, import.meta.url));
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));

const ajv = new Ajv({ allErrors: true, strict: true });
const manifestSchema = ajv.compile(readJson(here('../../schema/plugin-manifest.schema.json')));
const listingSchema = ajv.compile(readJson(here('../../schema/listing.schema.json')));

const templateSchema = ajv.compile({
  type: 'object',
  additionalProperties: false,
  required: ['id', 'name', 'description', 'language', 'platform', 'repository', 'commit'],
  properties: {
    id: { type: 'string', pattern: '^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$' },
    name: { type: 'string', minLength: 2, maxLength: 60, pattern: '^[^\\u0000-\\u001f<>]+$' },
    description: { type: 'string', minLength: 10, maxLength: 300, pattern: '^[^\\u0000-\\u001f<>]+$' },
    language: { type: 'string', minLength: 2, maxLength: 30, pattern: '^[^\\u0000-\\u001f<>]+$' },
    platform: { type: 'string', minLength: 2, maxLength: 40, pattern: '^[^\\u0000-\\u001f<>]+$' },
    repository: { type: 'string', pattern: '^https://github\\.com/[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})/[A-Za-z0-9._-]{1,100}$' },
    commit: { type: 'string', pattern: '^[0-9a-f]{40}$' },
  },
});

/** "/steps/0/title must be shorter" style messages, readable by a person opening a pull request. */
function schemaErrors(validate, label) {
  return (validate.errors ?? []).map((e) => {
    const where = e.instancePath ? `${label}${e.instancePath.replaceAll('/', '.')}` : label;
    const extra = e.params?.additionalProperty ? ` ('${e.params.additionalProperty}')` : '';
    return `${where}: ${e.message}${extra}`;
  });
}

// --- pieces ------------------------------------------------------------------------------------

/** The host of an https address, lower case. */
export function hostOf(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
}

/**
 * A link may not point at an address on somebody's own network. The schema already insists on a
 * host name made of letters and dots; this catches the ones that still are not on the internet:
 * an IPv4 literal, localhost, and the local-only suffixes.
 */
export function hostProblem(url) {
  const host = hostOf(url);
  if (!host) return 'is not a valid address';
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return 'points at an IP address, not a host name';
  if (host === 'localhost' || /\.(local|localhost|internal|lan|home|corp|test|invalid)$/.test(host)) {
    return 'points at a host that is not on the internet';
  }
  if (/^\d+$/.test(host.split('.').pop())) return 'has a numeric top-level domain';
  return null;
}

function placeholdersIn(text) {
  return [...text.matchAll(/\{\{([^}]*)\}\}/g)].map((m) => m[1]);
}

/** Every link in a manifest, with where it came from. */
function linksOf(manifest) {
  const links = [];
  const add = (where, url) => {
    if (typeof url === 'string') links.push({ where, url });
  };

  add('documentation', manifest.documentation);
  add('homepage', manifest.homepage);
  add('issues', manifest.issues);
  add('author.url', manifest.author?.url);
  manifest.install?.steps?.forEach((step, i) => add(`install.steps.${i}.link.url`, step.link?.url));
  return links;
}

// --- a manifest --------------------------------------------------------------------------------

/**
 * What is wrong with a manifest, on its own. Empty when nothing is.
 *
 * The schema says what shape it is; this says what it is allowed to mean.
 */
export function checkManifest(manifest, label = 'manifest') {
  if (!manifestSchema(manifest)) {
    return schemaErrors(manifestSchema, label);
  }

  const errors = [];

  // Permissions: each once. The schema caps the count but cannot say "unique by scope".
  const scopes = manifest.permissions.map((p) => p.scope);
  for (const scope of new Set(scopes)) {
    if (scopes.filter((s) => s === scope).length > 1) {
      errors.push(`${label}.permissions: '${scope}' is listed more than once`);
    }
  }

  // Links: a real address on the internet, never one on somebody's network.
  for (const { where, url } of linksOf(manifest)) {
    const problem = hostProblem(url);
    if (problem) errors.push(`${label}.${where}: ${problem}`);
  }

  // Placeholders: only the two we fill in, and only in a code block. A key in prose or in a link
  // is a key in a screenshot, a referrer header and a browser history.
  manifest.install.steps.forEach((step, i) => {
    const where = `${label}.install.steps.${i}`;

    for (const name of placeholdersIn(step.text)) {
      errors.push(`${where}.text: '{{${name}}}' belongs in a code block, not in the text`);
    }

    for (const name of placeholdersIn(step.code ?? '')) {
      if (!PLACEHOLDERS.includes(name)) {
        errors.push(`${where}.code: '{{${name}}}' is not a placeholder (use ${PLACEHOLDERS.map((p) => `{{${p}}}`).join(' or ')})`);
      }
    }

    for (const field of [step.title, step.link?.label, step.link?.url]) {
      if (field && placeholdersIn(field).length > 0) {
        errors.push(`${where}: placeholders are only for code blocks`);
      }
    }
  });

  // Whatever the permissions say, the install steps must mention that a key is needed at all.
  const mentionsKey = manifest.install.steps.some((s) => (s.code ?? '').includes('{{API_KEY}}'));
  if (!mentionsKey) {
    errors.push(`${label}.install: no step uses {{API_KEY}}, so the plugin would have no key to use`);
  }

  return errors;
}

// --- an icon -----------------------------------------------------------------------------------

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PNG_END = Buffer.from([0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);

let crcTable;
function crc32(buffer) {
  crcTable ??= Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });

  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * What is wrong with an icon. It has to be a PNG - by its bytes, not its file name - of a
 * sensible size. SVG is refused outright because it can carry script.
 */
export function checkIcon(bytes, label = 'icon.png') {
  if (!Buffer.isBuffer(bytes)) return [`${label}: missing`];

  if (bytes.length > ICON.maxBytes) {
    return [`${label}: ${Math.ceil(bytes.length / 1024)} KB is over the ${ICON.maxBytes / 1024} KB limit`];
  }

  if (bytes.length < 33 || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)) {
    return [`${label}: is not a PNG (SVG and other formats are not accepted)`];
  }

  // The first chunk must be IHDR: 13 bytes, with a matching checksum.
  const length = bytes.readUInt32BE(8);
  const type = bytes.subarray(12, 16).toString('latin1');
  if (type !== 'IHDR' || length !== 13) return [`${label}: is not a valid PNG (no header)`];

  const header = bytes.subarray(12, 12 + 4 + 13);
  if (crc32(header) !== bytes.readUInt32BE(12 + 4 + 13)) return [`${label}: is not a valid PNG (damaged header)`];

  if (!bytes.subarray(bytes.length - 12).equals(PNG_END)) return [`${label}: is not a valid PNG (truncated)`];

  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  const errors = [];

  if (width !== height) errors.push(`${label}: is ${width}x${height}; it has to be square`);
  if (width < ICON.minSide || width > ICON.maxSide) {
    errors.push(`${label}: is ${width} pixels wide; it has to be between ${ICON.minSide} and ${ICON.maxSide}`);
  }

  // Nothing must be readable as an image-decoder bomb: the pixel data may not inflate past what
  // the declared size could hold.
  const idat = [];
  for (let offset = 8; offset + 12 <= bytes.length; ) {
    const size = bytes.readUInt32BE(offset);
    const kind = bytes.subarray(offset + 4, offset + 8).toString('latin1');
    if (kind === 'IDAT') idat.push(bytes.subarray(offset + 8, offset + 8 + size));
    offset += 12 + size;
  }

  try {
    const cap = width * height * 8 + height + 1024;
    if (idat.length > 0) inflateSync(Buffer.concat(idat), { maxOutputLength: cap });
  } catch {
    errors.push(`${label}: has image data that is damaged or larger than its size allows`);
  }

  return errors;
}

// --- a listing ---------------------------------------------------------------------------------

/**
 * What is wrong with a listing, given the manifest it accompanies.
 *
 * @param {object} listing        plugins/<id>/listing.json
 * @param {{ id: string, manifest: object, verifiedOwners: string[] }} context
 */
export function checkListing(listing, { id, manifest, verifiedOwners }) {
  if (!listingSchema(listing)) return schemaErrors(listingSchema, `${id}/listing.json`);

  const errors = [];

  if (listing.repository.toLowerCase() !== manifest.repository.toLowerCase()) {
    errors.push(`${id}: listing.json points at ${listing.repository} but the manifest says ${manifest.repository}`);
  }

  const owner = listing.repository.split('/')[3].toLowerCase();
  const isVerifiedOwner = verifiedOwners.map((o) => o.toLowerCase()).includes(owner);

  if (listing.verified === true && !isVerifiedOwner) {
    errors.push(`${id}: only plugins in a verified organisation can be marked verified (${owner} is not one)`);
  }

  // Names that imply the project is the project: only for those that are.
  const impersonates = /^fmm-/.test(id) || id.startsWith('five-more-minutes') || /official/i.test(manifest.name) || /official/.test(id);
  if (impersonates && listing.verified !== true) {
    errors.push(`${id}: names starting fmm- or five-more-minutes, or containing "official", are for verified plugins`);
  }

  const date = new Date(`${listing.listedAt}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== listing.listedAt) {
    errors.push(`${id}: listedAt '${listing.listedAt}' is not a real date`);
  }

  return errors;
}

// --- the whole registry ------------------------------------------------------------------------

/**
 * Reads and checks every listing under `root/plugins`.
 *
 * @returns {{ plugins: object[], errors: string[] }}
 */
export function loadRegistry(root) {
  const errors = [];
  const plugins = [];

  const ownersPath = join(root, 'verified-owners.json');
  const verifiedOwners = existsSync(ownersPath) ? readJson(ownersPath) : [];

  const pluginsDir = join(root, 'plugins');
  const folders = existsSync(pluginsDir)
    ? readdirSync(pluginsDir).filter((name) => statSync(join(pluginsDir, name)).isDirectory()).sort()
    : [];

  for (const id of folders) {
    const dir = join(pluginsDir, id);
    const found = readdirSync(dir).sort();

    for (const extra of found.filter((f) => !LISTING_FILES.includes(f))) {
      errors.push(`${id}: '${extra}' is not allowed in a listing (only ${LISTING_FILES.join(', ')})`);
    }

    const problems = [];
    let manifest;
    let listing;

    for (const [file, assign] of [['plugin.json', (v) => (manifest = v)], ['listing.json', (v) => (listing = v)]]) {
      if (!found.includes(file)) {
        problems.push(`${id}: ${file} is missing`);
        continue;
      }

      try {
        assign(readJson(join(dir, file)));
      } catch (e) {
        problems.push(`${id}/${file}: is not valid JSON (${e.message})`);
      }
    }

    const icon = found.includes('icon.png') ? readFileSync(join(dir, 'icon.png')) : null;
    problems.push(...checkIcon(icon, `${id}/icon.png`));

    if (manifest) {
      problems.push(...checkManifest(manifest, `${id}/plugin.json`));

      if (manifest.id !== id) {
        problems.push(`${id}: the manifest's id is '${manifest.id}' but the folder is '${id}'; they have to match`);
      }
    }

    if (manifest && listing && problems.every((p) => !p.startsWith(`${id}/plugin.json`))) {
      problems.push(...checkListing(listing, { id, manifest, verifiedOwners }));
    }

    errors.push(...problems);

    if (problems.length === 0) {
      plugins.push({ id, dir, manifest, listing, icon });
    }
  }

  // Across listings: nothing may be listed twice or pass for something else.
  const seen = { name: new Map(), repository: new Map() };
  for (const p of plugins) {
    for (const [kind, value] of [['name', p.manifest.name], ['repository', p.listing.repository]]) {
      const key = value.toLowerCase();
      if (seen[kind].has(key)) {
        errors.push(`${p.id}: has the same ${kind} as '${seen[kind].get(key)}' ('${value}')`);
      } else {
        seen[kind].set(key, p.id);
      }
    }
  }

  return { plugins, errors, verifiedOwners };
}

/** What is wrong with `templates/templates.json`. */
export function checkTemplates(templates) {
  if (!Array.isArray(templates)) return ['templates.json: must be a list'];

  const errors = [];
  const ids = new Set();

  templates.forEach((template, i) => {
    if (!templateSchema(template)) {
      errors.push(...schemaErrors(templateSchema, `templates.json[${i}]`));
      return;
    }

    if (ids.has(template.id)) errors.push(`templates.json: '${template.id}' is listed twice`);
    ids.add(template.id);
  });

  return errors;
}

/** The address a pinned repository's files can be downloaded from, by commit. */
export function archiveUrl(repository, commit) {
  return `${repository}/archive/${commit}.zip`;
}
