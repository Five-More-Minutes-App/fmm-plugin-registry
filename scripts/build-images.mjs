#!/usr/bin/env node
// Builds the container image the Home Hub runs for every plugin that needs it, from exactly the commit that was reviewed, and
// pushes it to our own registry (ADR 9 in fmm-app): the Hub never pulls a plugin from its author's own registry, and a
// reviewed listing and the code that runs are the same thing.
//
//   node scripts/build-images.mjs [--registry .] [--out images.json] [--push]
//
// For each listing with requiresHub: true it
//   1. looks for ghcr.io/five-more-minutes-app/plugins/<id>:<commit>. If it is there, that commit was already built: its
//      digest is used and nothing is rebuilt (a commit's image never changes);
//   2. otherwise fetches the plugin's repository at the pinned commit (and only that commit), builds its Dockerfile for
//      linux/amd64 and linux/arm64, and with --push pushes it under that tag;
//   3. writes { "<id>": "ghcr.io/five-more-minutes-app/plugins/<id>@sha256:<digest>" } to --out, for build-catalog.mjs.
//
// Without --push (pull requests) it builds and pushes nothing: a listing whose Dockerfile does not build fails the check
// before it is merged.

import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const IMAGE_REPOSITORY = 'ghcr.io/five-more-minutes-app/plugins';
const PLATFORMS = 'linux/amd64,linux/arm64';

/** Ours, for that plugin, by digest. The portal, the service and the Hub check the same rule. */
export function isReviewedImage(id, ref) {
  return typeof ref === 'string' && new RegExp(`^${IMAGE_REPOSITORY.replace(/[.]/g, '\\.')}/${id}@sha256:[0-9a-f]{64}$`).test(ref);
}

/** Which plugins get an image: the ones that say they need the hub, and nothing else. */
export function needingImages(plugins) {
  return plugins.filter(({ manifest }) => manifest.requiresHub === true);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...options });
  return { ok: result.status === 0, out: (result.stdout ?? '').trim(), err: (result.stderr ?? '').trim() };
}

function must(command, args, options) {
  const result = run(command, args, { ...options, stdio: ['ignore', 'inherit', 'inherit'] });
  if (!result.ok) throw new Error(`${command} ${args.join(' ')} failed`);
}

/** The digest of an image already in the registry, or null. */
function existingDigest(ref) {
  const result = run('docker', ['buildx', 'imagetools', 'inspect', ref, '--format', '{{json .Manifest}}']);
  if (!result.ok) return null;
  try {
    const digest = JSON.parse(result.out).digest;
    return /^sha256:[0-9a-f]{64}$/.test(digest) ? digest : null;
  } catch {
    return null;
  }
}

/** The plugin's repository at the pinned commit, and nothing else of its history. */
function checkout(repository, commit) {
  const dir = mkdtempSync(join(tmpdir(), 'fmm-plugin-'));
  must('git', ['init', '--quiet', dir]);
  must('git', ['-C', dir, 'remote', 'add', 'origin', repository]);
  must('git', ['-C', dir, 'fetch', '--quiet', '--depth', '1', 'origin', commit]);
  must('git', ['-C', dir, 'checkout', '--quiet', '--detach', 'FETCH_HEAD']);

  const head = run('git', ['-C', dir, 'rev-parse', 'HEAD']).out;
  if (head !== commit) throw new Error(`${repository} gave ${head}, not the pinned ${commit}`);
  return dir;
}

export function buildImages(plugins, { push }) {
  const images = {};
  const failures = [];

  for (const { id, manifest, listing } of needingImages(plugins)) {
    const tag = `${IMAGE_REPOSITORY}/${id}:${listing.commit}`;

    const already = push ? existingDigest(tag) : null;
    if (already) {
      images[id] = `${IMAGE_REPOSITORY}/${id}@${already}`;
      console.log(`${id}: ${listing.commit} was already built (${already}).`);
      continue;
    }

    let dir;
    try {
      dir = checkout(listing.repository, listing.commit);
      if (!existsSync(join(dir, 'Dockerfile'))) {
        throw new Error('it needs the Home Hub but has no Dockerfile at the root of its repository');
      }

      must('docker', [
        'buildx', 'build',
        '--platform', PLATFORMS,
        '--pull',
        '--provenance', 'false',
        '--label', `org.opencontainers.image.source=${manifest.repository}`,
        '--label', `org.opencontainers.image.revision=${listing.commit}`,
        '--label', `org.opencontainers.image.version=${manifest.version}`,
        '--label', `app.fivemoreminutes.plugin=${id}`,
        '--tag', tag,
        ...(push ? ['--push'] : []),
        dir,
      ]);

      if (push) {
        const digest = existingDigest(tag);
        if (!digest) throw new Error(`pushed ${tag} but could not read its digest back`);
        images[id] = `${IMAGE_REPOSITORY}/${id}@${digest}`;
        console.log(`${id}: built ${listing.commit} as ${digest}.`);
      } else {
        console.log(`${id}: ${listing.commit} builds.`);
      }
    } catch (error) {
      failures.push(`${id}: ${error.message}`);
    } finally {
      if (dir) rmSync(dir, { recursive: true, force: true });
    }
  }

  return { images, failures };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const { loadRegistry } = await import('./lib/registry.mjs');
  const argv = process.argv.slice(2);
  const opt = (name, fallback) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : fallback);

  const root = resolve(opt('--registry', resolve(dirname(fileURLToPath(import.meta.url)), '..')));
  const out = resolve(opt('--out', 'images.json'));
  const push = argv.includes('--push');

  const { plugins, errors } = loadRegistry(root);
  if (errors.length > 0) {
    console.error('The registry does not validate, so no images were built:\n');
    for (const error of errors) console.error(`  - ${error}`);
    process.exit(1);
  }

  const { images, failures } = buildImages(plugins, { push });
  writeFileSync(out, `${JSON.stringify(images, null, 2)}\n`);

  if (failures.length > 0) {
    // On a pull request that is a failed check: fix it before it is merged. On main the catalogue is still published,
    // without an image for those plugins (the portal then shows the steps for running them by hand), so one plugin that
    // stopped building does not hold back every other listing.
    for (const failure of failures) console.error(push ? `::warning::${failure}` : `  - ${failure}`);
    if (!push) process.exit(1);
  }
}
