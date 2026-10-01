# Five More Minutes plugin registry

The list of plugins in the [Five More Minutes](https://fivemoreminutes.app)
marketplace. It is a git repository: a plugin is listed by a pull request, reviewed like any other change,
and published as a static `catalog.json` the marketplace website and the portal read.

**Free to list, free to use, nothing to sign up for.**

```
plugins/
  <id>/
    plugin.json    a copy of the plugin's own fmm-plugin.json, as reviewed
    icon.png       a copy of the plugin's own icon, as reviewed
    listing.json   where the plugin lives, and the exact commit that was reviewed
templates/
  templates.json   the example projects ("starters") people download to build a plugin
verified-owners.json   the GitHub organisations whose plugins may be marked "verified"
schema/            the JSON Schemas for a manifest and a listing
scripts/           validate, build the catalog, verify against the plugins' repositories
```

## What is listed is what was reviewed

A listing is **pinned to a commit**. `plugin.json` and `icon.png` here must be byte-for-byte the ones in the
plugin's repository at that commit (CI checks this on every pull request), and what a family sees, and the
steps they are told to follow, are those. A plugin cannot change what is shown by pushing to its own
repository: to ship a new version, its author opens another pull request with the new commit, and it is
reviewed again.

**Both halves are enforced by GitHub itself, not just asked for**, on every pull request - a brand-new
listing and a one-line re-pin alike:

- **Validation.** [`ci.yml`](.github/workflows/ci.yml) runs `npm run validate` (the manifest and listing
  against `schema/`), `npm run verify` (byte-for-byte against the pinned commit, over the network),
  `npm test` and `npm run build`, on every pull request and a weekly schedule that catches a listing going
  stale after the fact (a repository rewritten or deleted since it was pinned).
- **Approval.** [`.github/CODEOWNERS`](.github/CODEOWNERS) names who has to approve a change to
  `plugins/`, `templates/`, `schema/`, `scripts/` and `verified-owners.json`. Branch protection on `main`
  (set up once with [`scripts/setup-branch-protection.sh`](scripts/setup-branch-protection.sh)) requires
  that approval and a green check before anything merges - for repository admins too.

A pull request cannot bypass either half: it cannot merge with a failing check, and it cannot merge without
the review CODEOWNERS names, regardless of who opens it.

## Add a plugin

1. Build it. Start from a [starter project](templates/templates.json) if you like: the marketplace's **Build a plugin** page has them, with a key made for your own computer.
2. Give your repository an `fmm-plugin.json` and an `icon.png` (see [the manifest](docs/manifest.md)), a README with install and configuration instructions, and a licence.
3. Check it: `node scripts/validate.mjs --manifest path/to/fmm-plugin.json`.
4. Tag a release and note the full commit hash.
5. Open a pull request adding `plugins/<your-id>/` with the manifest, the icon and a `listing.json`:

   ```json
   {
     "repository": "https://github.com/you/fmm-plugin-your-thing",
     "commit": "0123456789abcdef0123456789abcdef01234567",
     "listedAt": "2026-09-25"
   }
   ```

6. A check runs and tells you what to fix. A reviewer then reads the plugin against the
   [review checklist](docs/review-checklist.md). When it is merged, it is in the marketplace within minutes.

Full details, including what makes a good listing, are in [CONTRIBUTING.md](CONTRIBUTING.md).

## Update a plugin

Open a pull request changing `commit` (and `plugin.json` / `icon.png` if they changed). It goes through the
same validation and the same CODEOWNERS approval as a first listing - there is no faster path for an update,
only a faster review: the reviewer reads the diff between the two commits rather than the whole plugin again.

## Remove a plugin

Open a pull request deleting `plugins/<id>/`, or, if there is a security problem, follow
[SECURITY.md](SECURITY.md): a listing can be removed at once without the author's agreement.

## The catalog

```bash
npm ci
npm run validate     # every listing and manifest against the rules
npm run build        # dist/catalog.json and dist/icons/
npm run verify       # every listing against its repository at the pinned commit (needs the network)
npm test
```

`dist/catalog.json` is what the marketplace and the portal fetch. CI builds it and publishes it (with the
icons) to GitHub Pages on every merge to `main`.

## The plugins made by Five More Minutes

Marked **verified**, because they are made and maintained by the project itself (the
`Five-More-Minutes-App` organisation, listed in `verified-owners.json`):

- [`unifi`](https://github.com/Five-More-Minutes-App/fmm-plugin-unifi): block chosen devices while the computer is locked.
- [`homey`](https://github.com/Five-More-Minutes-App/fmm-plugin-homey): control the timer, and use it in flows.
- [`home-assistant`](https://github.com/Five-More-Minutes-App/fmm-plugin-home-assistant): sensors, events, buttons and actions.

"Verified" means *made by the project*; it is not a security audit, and no plugin is trusted with more
than the permissions its key was given. See [docs/review-checklist.md](docs/review-checklist.md).

## Licence

MIT. See [LICENSE](LICENSE). Each plugin has its own licence, which the reviewer checks is an open one.
