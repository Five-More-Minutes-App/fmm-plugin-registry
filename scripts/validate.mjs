#!/usr/bin/env node
// Checks the registry, or a single manifest, and says what is wrong in words a person opening a
// pull request can act on. Exits 1 if anything is.
//
//   node scripts/validate.mjs                       the whole registry (what CI runs)
//   node scripts/validate.mjs --manifest <file>     one plugin's fmm-plugin.json, and the icon.png beside it
//
// The second form is for plugin authors: run it in your own checkout before opening a pull request.

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkIcon, checkManifest, checkTemplates, loadRegistry } from './lib/registry.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);

function report(errors, ok) {
  if (errors.length === 0) {
    console.log(ok);
    return 0;
  }

  console.error(`\n${errors.length} problem${errors.length === 1 ? '' : 's'}:\n`);
  for (const error of errors) console.error(`  - ${error}`);
  console.error('');
  return 1;
}

if (args[0] === '--manifest') {
  const file = args[1];
  if (!file || !existsSync(file)) {
    console.error('Usage: node scripts/validate.mjs --manifest path/to/fmm-plugin.json');
    process.exit(2);
  }

  const errors = [];
  let manifest;

  try {
    manifest = JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    errors.push(`${file}: is not valid JSON (${e.message})`);
  }

  if (manifest) errors.push(...checkManifest(manifest, 'fmm-plugin.json'));

  const iconPath = join(dirname(resolve(file)), 'icon.png');
  errors.push(...checkIcon(existsSync(iconPath) ? readFileSync(iconPath) : null, 'icon.png'));

  process.exit(report(errors, `${file} is valid, and so is its icon.`));
}

const target = resolve(args[0] ?? root);
const { plugins, errors } = loadRegistry(target);

const templatesPath = join(target, 'templates', 'templates.json');
if (existsSync(templatesPath)) {
  try {
    errors.push(...checkTemplates(JSON.parse(readFileSync(templatesPath, 'utf8'))));
  } catch (e) {
    errors.push(`templates/templates.json: is not valid JSON (${e.message})`);
  }
}

process.exit(report(errors, `${plugins.length} plugin${plugins.length === 1 ? '' : 's'} listed, and every listing is valid.`));
