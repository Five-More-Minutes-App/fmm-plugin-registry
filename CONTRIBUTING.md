# Contributing a plugin

Thank you. Anyone can list a plugin, it is free, and there is no account to make: a pull request is all it
takes. This page is the whole process. The [README](README.md) is the overview.

## Before you start

- A plugin talks to **one computer's** Five More Minutes over its **local** plugin API, with a key a parent made. Read the API documentation in the Five More Minutes repository (`docs/plugins/api-v1.md`) and its security notes.
- Start from a starter: the marketplace's **Build a plugin** page gives you a **Node.js** or **Python** project with a working client, an event helper and tests, and can make a key for your own computer so you can try it.
- Keep it small, and ask for as little as you need. The smallest plugin that does something useful is the easiest to review, and the easiest for a family to trust.

## What a listing needs

In your own repository, at the root:

| File | |
|---|---|
| `fmm-plugin.json` | The [manifest](docs/manifest.md): name, description, permissions with reasons, installation steps |
| `icon.png` | A square PNG, 128–512 px, under 100 KB |
| `README.md` | What it does, how to install it, how to configure it, what to do when it does not work, and **which permissions it uses and why** |
| `LICENSE` | An open licence |

Good listings also have: a changelog, tests, a lockfile, and a note in the README on how to remove the
plugin completely (including revoking its key).

## Steps

1. **Check the manifest.** `git clone` this repository, `npm ci`, then:

   ```bash
   node scripts/validate.mjs --manifest ../your-plugin/fmm-plugin.json
   ```

   It tells you what to fix, in words.
2. **Tag a release** in your repository and copy its full commit hash (`git rev-parse HEAD`).
3. **Fork this repository** and add `plugins/<your-id>/` with three files:
   - `plugin.json`: a copy of your `fmm-plugin.json` at that commit
   - `icon.png`: a copy of your `icon.png` at that commit
   - `listing.json`:

     ```json
     { "repository": "https://github.com/you/fmm-plugin-your-thing", "commit": "<full 40-character hash>", "listedAt": "<today, YYYY-MM-DD>" }
     ```
4. **Run** `npm run validate` and (with the network) `npm run verify -- --only <your-id>`.
5. **Open a pull request.** Fill in the template. A check runs; fix what it says.
6. **A reviewer reads your plugin** against the [review checklist](docs/review-checklist.md): it is short, and worth reading first. Expect questions, mostly about permissions. You will get an answer within a few days.

When it is merged, your plugin is in the marketplace within minutes, and a parent can add it with one click.

## Shipping a new version

Tag it, and open a pull request that changes `commit` (and `plugin.json` / `icon.png` if they changed). The
reviewer reads the difference between the two commits. **If you ask for a new permission, say why in the
pull request.**

## Rules that will save you a round trip

- **Names.** Do not use `fmm-`, `five-more-minutes` or "official" in your `id` or name: those are for the project's own plugins. Do not imitate another plugin, a brand, or a person.
- **Permissions.** A plugin that shows a countdown asks for `state:read`. A plugin that never starts time does not ask for `timer:start`. The `reason` for each is read by a parent.
- **The key.** It is a password. Keep it in an environment file or a secret store; never in a URL, a log line, or an error message. Do not follow redirects with it. Handle a revoked key kindly.
- **Do what you say.** Do not start, extend or stop time except when the person using your plugin asked. Parents can see what a key has done, for thirty days.
- **Let go on failure.** If your plugin can make something worse for a child (cut their internet, lock a device), it must undo that when it cannot reach Five More Minutes, when it is stopped, and when it is removed.
- **Nothing leaves the home** unless you say so plainly, it is optional, and it is off by default.
- **Links** are `https` with a real host name. Text has no HTML in it.

## Being reviewed

Reviewers are volunteers, and the aim is to say yes. A comment is about the plugin, never the author. If you
disagree, say so; a reviewer can be wrong. If a plugin is declined, you will be told why, and you can try
again when it is fixed.

## Conduct

Be kind. Assume good faith. Keep the families who will use what you build in mind: they are trusting you with
their children's time and, sometimes, their network.
