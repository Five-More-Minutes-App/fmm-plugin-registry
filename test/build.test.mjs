// The catalogue that families' screens are drawn from, and the check that it says what was reviewed.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildCatalog } from '../scripts/build-catalog.mjs';
import { loadRegistry } from '../scripts/lib/registry.mjs';
import { canonical, verifyListing, verifyTemplate } from '../scripts/verify-pinned.mjs';
import { COMMIT, listing, makePng, makeRegistry, manifest } from './helpers.mjs';

const scripts = fileURLToPath(new URL('../scripts/', import.meta.url));
const cleanup = [];
const registry = (...args) => {
  const made = makeRegistry(...args);
  cleanup.push(made.remove);
  return made;
};
after(() => cleanup.forEach((remove) => remove()));

const template = { id: 'node', name: 'Node.js starter', description: 'A starting point in TypeScript.', language: 'TypeScript', platform: 'Node.js', repository: 'https://github.com/five-more-minutes/fmm-plugin-template-node', commit: COMMIT };
const NOW = '2026-09-25T12:00:00.000Z';

describe('building the catalogue', () => {
  const official = (id) => ({
    manifest: manifest(id, { repository: `https://github.com/five-more-minutes/fmm-${id}`, name: `Zeta ${id}` }),
    listing: listing(id, { repository: `https://github.com/five-more-minutes/fmm-${id}`, verified: true }),
  });

  it('says what each plugin is, where it is pinned, and where its icon is', () => {
    const { root } = registry({ alpha: {} }, { templates: [template] });
    const catalog = buildCatalog({ plugins: loadRegistry(root).plugins, templates: [template] }, NOW);

    assert.equal(catalog.schemaVersion, 1);
    assert.equal(catalog.generatedAt, NOW);

    const [alpha] = catalog.plugins;
    assert.equal(alpha.id, 'alpha');
    assert.equal(alpha.commit, COMMIT);
    assert.equal(alpha.icon, 'icons/alpha.png');
    assert.equal(alpha.verified, false);
    assert.deepEqual(alpha.permissions.map((p) => p.scope), ['state:read', 'timer:start']);
    assert.ok(alpha.install.steps.length > 0);
  });

  it('puts the ones Five More Minutes makes first, then the rest by name', () => {
    const { root } = registry(
      { yankee: { manifest: manifest('yankee', { name: 'Aardvark' }) }, ...{ 'fmm-b': official('fmm-b'), 'fmm-a': official('fmm-a') } },
    );
    const { plugins, errors } = loadRegistry(root);
    assert.deepEqual(errors, []);

    const names = buildCatalog({ plugins, templates: [] }, NOW).plugins.map((p) => p.name);
    assert.deepEqual(names, ['Zeta fmm-a', 'Zeta fmm-b', 'Aardvark']);
  });

  it('gives an example project its download address, pinned to the commit', () => {
    const catalog = buildCatalog({ plugins: [], templates: [template] }, NOW);

    assert.equal(catalog.templates[0].archive, `${template.repository}/archive/${COMMIT}.zip`);
  });

  it('is the same bytes every time for the same registry', () => {
    const { root } = registry({ alpha: {}, beta: {} });
    const { plugins } = loadRegistry(root);

    assert.equal(
      JSON.stringify(buildCatalog({ plugins, templates: [] }, NOW)),
      JSON.stringify(buildCatalog({ plugins, templates: [] }, NOW)),
    );
  });

  it('carries only what a page needs, never a path on the builder’s disk', () => {
    const { root } = registry({ alpha: {} });
    const catalog = buildCatalog({ plugins: loadRegistry(root).plugins, templates: [] }, NOW);
    const text = JSON.stringify(catalog);

    assert.ok(!text.includes(root.replaceAll('\\', '\\\\')), 'a local path leaked into the catalogue');
    assert.ok(!('dir' in catalog.plugins[0]) && !('icon_bytes' in catalog.plugins[0]));
  });
});

describe('the build command', () => {
  const run = (args) => spawnSync(process.execPath, [join(scripts, 'build-catalog.mjs'), ...args], { encoding: 'utf8' });

  it('writes the catalogue and the icons it points at', () => {
    const { root } = registry({ alpha: {}, beta: {} }, { templates: [template] });
    const out = mkdtempSync(join(tmpdir(), 'fmm-dist-'));

    const result = run(['--registry', root, '--out', out, '--now', NOW]);

    assert.equal(result.status, 0, result.stderr);
    const catalog = JSON.parse(readFileSync(join(out, 'catalog.json'), 'utf8'));
    assert.equal(catalog.plugins.length, 2);
    assert.equal(catalog.generatedAt, NOW);
    assert.ok(existsSync(join(out, 'icons', 'alpha.png')));
    assert.ok(existsSync(join(out, 'icons', 'beta.png')));
    assert.deepEqual(readFileSync(join(out, 'icons', 'alpha.png')), makePng());
  });

  it('refuses to build from a registry that does not validate', () => {
    const { root } = registry({ good: {}, bad: { icon: Buffer.from('<svg/>') } });
    const out = join(mkdtempSync(join(tmpdir(), 'fmm-dist-')), 'never');

    const result = run(['--registry', root, '--out', out]);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /does not validate/);
    assert.ok(!existsSync(out), 'nothing should be written for a bad registry');
  });

  it('refuses a bad example project too', () => {
    const { root } = registry({ alpha: {} }, { templates: [{ ...template, commit: 'main' }] });
    const result = run(['--registry', root, '--out', join(mkdtempSync(join(tmpdir(), 'fmm-dist-')), 'never')]);

    assert.equal(result.status, 1);
  });
});

describe('the validate command', () => {
  const run = (args) => spawnSync(process.execPath, [join(scripts, 'validate.mjs'), ...args], { encoding: 'utf8' });

  it('says a registry is fine, or what is not', () => {
    const good = registry({ alpha: {} });
    const ok = run([good.root]);
    assert.equal(ok.status, 0);
    assert.match(ok.stdout, /1 plugin listed/);

    const bad = registry({ alpha: { icon: null } });
    const fail = run([bad.root]);
    assert.equal(fail.status, 1);
    assert.match(fail.stderr, /alpha\/icon\.png: missing/);
  });

  it('checks one plugin’s own manifest and the icon beside it, for authors', () => {
    const { root } = registry({ alpha: {} });
    const file = join(root, 'plugins', 'alpha', 'plugin.json');

    const ok = run(['--manifest', file]);
    assert.equal(ok.status, 0, ok.stderr);

    const missing = run(['--manifest', join(root, 'nope.json')]);
    assert.equal(missing.status, 2);
  });
});

describe('checking a listing against its repository', () => {
  /** A stand-in for raw.githubusercontent.com serving whatever the test puts in `files`. */
  async function serve(files) {
    const server = createServer((request, response) => {
      const body = files[request.url];
      response.writeHead(body ? 200 : 404).end(body);
    });

    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    cleanup.push(() => server.close());
    return `http://127.0.0.1:${server.address().port}`;
  }

  const plugin = (m = manifest('alpha'), icon = makePng()) => ({ id: 'alpha', manifest: m, listing: listing('alpha'), icon });
  const path = (file) => `/sample-author/fmm-alpha/${COMMIT}/${file}`;

  it('is satisfied when the listing is exactly what is at the commit', async () => {
    const m = manifest('alpha');
    const base = await serve({ [path('fmm-plugin.json')]: JSON.stringify(m), [path('icon.png')]: makePng() });

    assert.deepEqual(await verifyListing(plugin(m), base), []);
  });

  it('does not mind the order of keys or how the file is spaced', async () => {
    const m = manifest('alpha');
    const reordered = Object.fromEntries(Object.entries(m).reverse());
    const base = await serve({ [path('fmm-plugin.json')]: JSON.stringify(reordered, null, 8), [path('icon.png')]: makePng() });

    assert.deepEqual(await verifyListing(plugin(m), base), []);
  });

  it('notices a manifest that differs even slightly', async () => {
    const m = manifest('alpha');
    const changed = { ...m, permissions: [...m.permissions, { scope: 'timer:stop', reason: 'Added after it was reviewed.' }] };
    const base = await serve({ [path('fmm-plugin.json')]: JSON.stringify(changed), [path('icon.png')]: makePng() });

    const problems = await verifyListing(plugin(m), base);
    assert.equal(problems.length, 1);
    assert.match(problems[0], /plugin\.json is not the same/);
  });

  it('notices an icon that differs', async () => {
    const m = manifest('alpha');
    const base = await serve({ [path('fmm-plugin.json')]: JSON.stringify(m), [path('icon.png')]: makePng(300) });

    const problems = await verifyListing(plugin(m), base);
    assert.match(problems.join('\n'), /icon\.png is not the same/);
  });

  it('notices a commit that is not there', async () => {
    const base = await serve({});

    const problems = await verifyListing(plugin(), base);
    assert.equal(problems.length, 2);
    assert.match(problems[0], /could not read fmm-plugin\.json/);
  });

  it('checks an example project’s pinned commit exists', async () => {
    const base = await serve({ [`/five-more-minutes/fmm-plugin-template-node/${COMMIT}/README.md`]: '# starter' });

    assert.deepEqual(await verifyTemplate(template, base), []);
    assert.equal((await verifyTemplate({ ...template, commit: 'b'.repeat(40) }, base)).length, 1);
  });

  it('compares manifests by meaning, not by spelling', () => {
    assert.equal(canonical({ b: 1, a: [2, { d: 1, c: 2 }] }), canonical({ a: [2, { c: 2, d: 1 }], b: 1 }));
    assert.notEqual(canonical({ a: 1 }), canonical({ a: '1' }));
    assert.notEqual(canonical([1, 2]), canonical([2, 1]));
  });
});
