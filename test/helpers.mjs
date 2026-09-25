// Builders for tests: real PNG bytes, a valid manifest, and a registry on disk. Real bytes rather
// than mocks, because the icon check is about what a decoder would see.

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

let table;
function crc32(buffer) {
  table ??= Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  let crc = 0xffffffff;
  for (const byte of buffer) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** A valid, solid-colour PNG. `height` defaults to `width`; `pad` adds bytes of ignorable text. */
export function makePng(width = 256, height = width, { pad = 0 } = {}) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // RGB

  const rows = Buffer.alloc(height * (1 + width * 3));
  const chunks = [chunk('IHDR', header)];
  if (pad > 0) chunks.push(chunk('tEXt', Buffer.alloc(pad, 0x61)));
  chunks.push(chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0)));

  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), ...chunks]);
}

/** A manifest that passes every rule. Override what a test wants to break. */
export function manifest(id = 'sample', overrides = {}) {
  return {
    schemaVersion: 1,
    id,
    name: `Sample ${id}`,
    description: 'Starts and watches the timer on a child computer from somewhere else in the house.',
    version: '1.2.3',
    author: { name: 'Sample Author', url: 'https://example.com/author' },
    license: 'MIT',
    repository: `https://github.com/sample-author/fmm-${id}`,
    documentation: `https://github.com/sample-author/fmm-${id}#readme`,
    icon: 'icon.png',
    categories: ['automation'],
    platform: 'Docker',
    permissions: [
      { scope: 'state:read', reason: 'Shows how much time is left.' },
      { scope: 'timer:start', reason: 'Lets a button start the timer.' },
    ],
    install: {
      steps: [
        { title: 'Run it', text: 'Start the container with your details.', code: 'FMM_URL={{FMM_URL}}\nFMM_API_KEY={{API_KEY}}' },
      ],
    },
    compatibility: { apiVersion: 1 },
    ...overrides,
  };
}

export const COMMIT = 'a'.repeat(40);

export function listing(id = 'sample', overrides = {}) {
  return {
    repository: `https://github.com/sample-author/fmm-${id}`,
    commit: COMMIT,
    listedAt: '2026-09-25',
    ...overrides,
  };
}

/**
 * A registry on disk. `plugins` maps a folder name to { manifest, listing, icon, extra } where
 * anything left out gets a valid default and `null` leaves the file out altogether.
 */
export function makeRegistry(plugins = {}, { templates, verifiedOwners = ['five-more-minutes'] } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'fmm-registry-'));
  mkdirSync(join(root, 'plugins'), { recursive: true });
  writeFileSync(join(root, 'verified-owners.json'), JSON.stringify(verifiedOwners));

  for (const [id, parts] of Object.entries(plugins)) {
    const dir = join(root, 'plugins', id);
    mkdirSync(dir, { recursive: true });

    const files = {
      'plugin.json': parts.manifest === undefined ? manifest(id) : parts.manifest,
      'listing.json': parts.listing === undefined ? listing(id) : parts.listing,
    };

    for (const [name, value] of Object.entries(files)) {
      if (value !== null) writeFileSync(join(dir, name), typeof value === 'string' ? value : JSON.stringify(value, null, 2));
    }

    const icon = parts.icon === undefined ? makePng() : parts.icon;
    if (icon !== null) writeFileSync(join(dir, 'icon.png'), icon);

    for (const [name, value] of Object.entries(parts.extra ?? {})) writeFileSync(join(dir, name), value);
  }

  if (templates) {
    mkdirSync(join(root, 'templates'), { recursive: true });
    writeFileSync(join(root, 'templates', 'templates.json'), JSON.stringify(templates));
  }

  return { root, remove: () => rmSync(root, { recursive: true, force: true }) };
}
