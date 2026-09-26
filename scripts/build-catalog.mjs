#!/usr/bin/env node
// Builds what the marketplace site and the portal read: dist/catalog.json, and the icons it
// points at. Refuses to build from a registry that does not validate, so a bad listing can never
// reach a family by way of a build that was not looked at.
//
//   node scripts/build-catalog.mjs [--out dist] [--registry .] [--now 2026-09-25T00:00:00Z]

import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { archiveUrl, checkTemplates, loadRegistry } from './lib/registry.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Reads `--name value` pairs. */
function options(argv) {
  const found = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (!argv[i].startsWith('--')) throw new Error(`Unexpected argument '${argv[i]}'`);
    found[argv[i].slice(2)] = argv[i + 1];
  }
  return found;
}

/**
 * The catalogue as data. Separate from writing it so a test can look at it without a disk.
 *
 * Deterministic: the same registry always makes the same bytes, apart from the time it says it
 * was made, so a change to the catalogue shows up in review as exactly the change it is.
 */
export function buildCatalog({ plugins, templates }, now) {
  const listed = plugins
    .map(({ id, manifest, listing }) => ({
      id,
      name: manifest.name,
      description: manifest.description,
      version: manifest.version,
      author: manifest.author,
      license: manifest.license,
      repository: manifest.repository,
      documentation: manifest.documentation,
      ...(manifest.homepage ? { homepage: manifest.homepage } : {}),
      ...(manifest.issues ? { issues: manifest.issues } : {}),
      categories: manifest.categories,
      platform: manifest.platform,
      requiresHub: manifest.requiresHub === true,
      permissions: manifest.permissions,
      install: manifest.install,
      compatibility: manifest.compatibility,
      commit: listing.commit,
      listedAt: listing.listedAt,
      verified: listing.verified === true,
      // Relative to the catalogue, so it works wherever the two are hosted together.
      icon: `icons/${id}.png`,
    }))
    // Ones made by Five More Minutes first, then by name. Stable and unsurprising.
    .sort((a, b) => Number(b.verified) - Number(a.verified) || a.name.localeCompare(b.name, 'en'));

  return {
    schemaVersion: 1,
    generatedAt: now,
    plugins: listed,
    templates: templates.map((t) => ({ ...t, archive: archiveUrl(t.repository, t.commit) })),
  };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const opts = options(process.argv.slice(2));
  const registry = resolve(opts.registry ?? root);
  const out = resolve(opts.out ?? join(root, 'dist'));

  const { plugins, errors } = loadRegistry(registry);

  const templatesPath = join(registry, 'templates', 'templates.json');
  const templates = existsSync(templatesPath) ? JSON.parse(readFileSync(templatesPath, 'utf8')) : [];
  errors.push(...checkTemplates(templates));

  if (errors.length > 0) {
    console.error('The registry does not validate, so no catalogue was built:\n');
    for (const error of errors) console.error(`  - ${error}`);
    process.exit(1);
  }

  rmSync(out, { recursive: true, force: true });
  mkdirSync(join(out, 'icons'), { recursive: true });

  for (const { id, dir } of plugins) cpSync(join(dir, 'icon.png'), join(out, 'icons', `${id}.png`));

  const catalog = buildCatalog({ plugins, templates }, opts.now ?? new Date().toISOString());
  writeFileSync(join(out, 'catalog.json'), `${JSON.stringify(catalog, null, 2)}\n`);

  console.log(`Built ${catalog.plugins.length} plugins and ${catalog.templates.length} example projects into ${out}`);
}
