# The plugin manifest

Every plugin has an `fmm-plugin.json` at the root of its repository, and a copy of it as
`plugins/<id>/plugin.json` in this registry. It is what the marketplace shows, and what the portal reads
to add the plugin for a parent. The rules are in
[`schema/plugin-manifest.schema.json`](../schema/plugin-manifest.schema.json); this page says what they
are for. Check yours with:

```bash
node scripts/validate.mjs --manifest path/to/fmm-plugin.json
```

It reads the icon next to the manifest as well.

## Example

```json
{
  "schemaVersion": 1,
  "id": "unifi",
  "name": "UniFi Internet Blocker",
  "description": "Cuts the internet for the devices you choose on your UniFi network ...",
  "version": "1.0.0",
  "author": { "name": "Five More Minutes", "url": "https://github.com/five-more-minutes" },
  "license": "MIT",
  "repository": "https://github.com/five-more-minutes/fmm-plugin-unifi",
  "documentation": "https://github.com/five-more-minutes/fmm-plugin-unifi#readme",
  "icon": "icon.png",
  "categories": ["network"],
  "platform": "Docker",
  "permissions": [
    { "scope": "state:read", "reason": "Sees when the computer is locked, so it knows when to block." }
  ],
  "install": {
    "steps": [
      { "title": "Get the plugin", "text": "Clone the repository.", "code": "git clone https://github.com/..." },
      { "title": "Configure it", "text": "Put these in .env.", "code": "FMM_URL={{FMM_URL}}\nFMM_API_KEY={{API_KEY}}" }
    ]
  },
  "compatibility": { "apiVersion": 1 }
}
```

## Fields

| Field | Rule |
|---|---|
| `schemaVersion` | `1` |
| `id` | Lowercase letters, digits and hyphens, up to 64. Unique in the registry; it is the folder name of the listing. Names starting `fmm-` or `five-more-minutes`, or containing "official", are for verified plugins only |
| `name` | 2–40 characters, plain text (no `<` or `>`). Unique in the registry |
| `description` | 20–600 characters of plain text: what it does, for a parent. Blank lines separate paragraphs |
| `version` | Semantic version, e.g. `1.2.0` |
| `author` | `name` (required) and an optional `url` |
| `license` | An SPDX identifier such as `MIT` or `Apache-2.0`. An open licence |
| `repository` | `https://github.com/<owner>/<repo>`. GitHub only, for now. Unique in the registry |
| `documentation` | An https link to the full documentation, usually the README |
| `homepage`, `issues` | Optional https links |
| `icon` | Always `"icon.png"`, at the root of the repository. See below |
| `categories` | 1–3 of `smart-home`, `network`, `automation`, `notifications`, `developer`, `other` |
| `platform` | Where it runs, so a family knows what they need: `Home Assistant`, `Homey Pro`, `Docker`, `Node.js` |
| `permissions` | 1–5 of the scopes below, each with a `reason`. See below |
| `install.steps` | 1–12 steps, each with a `title` and `text`, optionally a `code` block and a `link`. See below |
| `compatibility.apiVersion` | `1`, the version of the plugin API the plugin uses (`/api/integrations/v1`) |

Links must be `https` with a real host name: not an IP address, not `localhost`, not a `.local`,
`.lan` or `.home` name, and no credentials in them. Text must not contain `<` or `>`: everything is shown
as plain text, and a listing can never carry markup.

## The icon

`icon.png`, a **square PNG between 128 and 512 pixels, under 100 KB**. SVG is not accepted, because it can
carry script. It should say what the plugin does; do not use somebody else's logo to suggest who made it.

## Permissions

A key gives a plugin access to **one computer**, from the **local network only**, and only for the scopes
ticked. Ask for as little as you need. The parent sees your list, with your reasons, before they agree,
and the service refuses anything outside it.

| Scope | Lets the plugin |
|---|---|
| `state:read` | See whether a timer is running and how much is left, and whether the computer is locked or online |
| `timer:start` | Start time |
| `timer:extend` | Add time to a running timer |
| `timer:stop` | End the time now (the computer locks, as if time ran out) |
| `timer:cancel` | Cancel a running timer, without locking |

The `reason` (10–160 characters) is a sentence a parent can weigh: *why does this need to start time?* A
plugin that only shows a countdown asks for `state:read` and nothing else, and a reviewer will ask why
if it asks for more.

No scope reaches other computers, the household, other keys, or the PIN, and none is being added.

## Installation steps

Steps are shown in order, on the plugin's page and again in the portal after the parent adds it. They
should be enough for someone who has never seen your repository. Two placeholders are filled in by the
portal, and only inside `code`:

| Placeholder | Becomes |
|---|---|
| `{{FMM_URL}}` | The address the parent's Five More Minutes can be reached at |
| `{{API_KEY}}` | The key made for this plugin, shown once |

At least one step must use `{{API_KEY}}`, or the plugin would have no key to use. Never put a placeholder in
`text`: the text is shown before a key exists.

Good steps say what to do, in the order to do it, and what to expect: *"Run this. You should see the
computer's name."*

## Keep it in sync

`plugins/<id>/plugin.json` and `icon.png` in this registry must be byte-for-byte the ones in your repository
**at the pinned commit**. CI checks that on every pull request. To change what is shown, change your
repository, tag a release, and open a pull request with the new commit.
