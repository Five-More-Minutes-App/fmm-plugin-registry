#!/usr/bin/env node
// Confirms that what the registry shows is what is really at the pinned commit: that the manifest
// and icon in each listing are byte-for-byte the ones in the plugin's own repository at the commit
// named in listing.json.
//
// This is what makes "listed" mean "reviewed at this commit". Without it a listing could describe
// one thing while the repository held another, and nobody would see the difference until a family
// had already added it. Runs in CI on every pull request; needs the network.
//
//   node scripts/verify-pinned.mjs [--only <id>] [--registry .]
//
// RAW_BASE overrides where files are fetched from (default https://raw.githubusercontent.com).

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRegistry } from './lib/registry.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** JSON with its keys in a fixed order, so two spellings of the same manifest compare equal. */
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

async function fetchBytes(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000), redirect: 'follow' });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return Buffer.from(await response.arrayBuffer());
}

/**
 * Checks one listing against its repository.
 *
 * @returns {Promise<string[]>} what did not match; empty when it all does
 */
export async function verifyListing({ id, manifest, listing, icon }, base) {
  const [, , , owner, repo] = listing.repository.split('/');
  const at = `${base}/${owner}/${repo}/${listing.commit}`;
  const problems = [];

  try {
    const remote = JSON.parse((await fetchBytes(`${at}/fmm-plugin.json`)).toString('utf8'));
    if (canonical(remote) !== canonical(manifest)) {
      problems.push(`${id}: plugin.json is not the same as fmm-plugin.json at commit ${listing.commit.slice(0, 10)}`);
    }
  } catch (e) {
    problems.push(`${id}: could not read fmm-plugin.json at ${listing.repository} @ ${listing.commit.slice(0, 10)} (${e.message})`);
  }

  try {
    const remote = await fetchBytes(`${at}/icon.png`);
    if (!remote.equals(icon)) {
      problems.push(`${id}: icon.png is not the same as icon.png at commit ${listing.commit.slice(0, 10)}`);
    }
  } catch (e) {
    problems.push(`${id}: could not read icon.png at ${listing.repository} @ ${listing.commit.slice(0, 10)} (${e.message})`);
  }

  return problems;
}

/** Checks that a template's repository really has the commit that is pinned. */
export async function verifyTemplate(template, base) {
  const [, , , owner, repo] = template.repository.split('/');

  try {
    await fetchBytes(`${base}/${owner}/${repo}/${template.commit}/README.md`);
    return [];
  } catch (e) {
    return [`template ${template.id}: could not read ${template.repository} @ ${template.commit.slice(0, 10)} (${e.message})`];
  }
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const argv = process.argv.slice(2);
  const opt = (name) => (argv.includes(`--${name}`) ? argv[argv.indexOf(`--${name}`) + 1] : undefined);

  const registry = resolve(opt('registry') ?? root);
  const only = opt('only');
  const base = (process.env.RAW_BASE ?? 'https://raw.githubusercontent.com').replace(/\/$/, '');

  const { plugins, errors } = loadRegistry(registry);
  if (errors.length > 0) {
    console.error('The registry does not validate; fix that first (npm run validate).');
    process.exit(1);
  }

  const chosen = only ? plugins.filter((p) => p.id === only) : plugins;
  if (only && chosen.length === 0) {
    console.error(`No plugin '${only}' in the registry.`);
    process.exit(2);
  }

  const problems = [];
  for (const plugin of chosen) {
    const found = await verifyListing(plugin, base);
    problems.push(...found);
    console.log(`${found.length === 0 ? 'ok      ' : 'MISMATCH'} ${plugin.id} @ ${plugin.listing.commit.slice(0, 10)}`);
  }

  const templatesPath = join(registry, 'templates', 'templates.json');
  if (!only && existsSync(templatesPath)) {
    for (const template of JSON.parse(readFileSync(templatesPath, 'utf8'))) {
      const found = await verifyTemplate(template, base);
      problems.push(...found);
      console.log(`${found.length === 0 ? 'ok      ' : 'MISMATCH'} template ${template.id} @ ${template.commit.slice(0, 10)}`);
    }
  }

  if (problems.length > 0) {
    console.error(`\n${problems.length} problem${problems.length === 1 ? '' : 's'}:\n`);
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exit(1);
  }
}
