# Review checklist

What a reviewer checks before a plugin is listed, and before a new commit is pinned. It exists so that a
review is the same for everyone, and so an author can see in advance what will be asked. Automated checks
already cover the manifest's shape and that the registry matches the repository; a person reads the rest.

A reviewer is not auditing the plugin's code line by line. They are asking: *would I be comfortable if a
family I know added this?*

## The listing

- [ ] The pull request touches **one plugin**: `plugins/<id>/` only.
- [ ] `listing.json` pins a **full commit hash** that exists in the repository, and `listedAt` is today.
- [ ] `plugin.json` and `icon.png` are the repository's own at that commit (CI confirms).
- [ ] The name is not confusingly like another plugin's, or like the project's own, and does not imitate a brand or a person.
- [ ] The icon is the author's own artwork, or freely licensed; it does not use someone else's logo.
- [ ] The repository is **public**, has an **open licence** matching `license`, and has a README.

## Honesty

- [ ] The **description** says what the plugin does, and nothing it does not.
- [ ] Every **permission** is needed, and the `reason` is true. *A plugin that shows a timer has no reason to start one.*
- [ ] The README's account of permissions matches the manifest.
- [ ] Nothing in the text pretends to be from Five More Minutes, or asks a parent to trust it because of who it says made it.
- [ ] `verified` appears only for plugins of the `five-more-minutes` organisation.

## The installation steps

- [ ] They work for someone who has never seen the repository, in order.
- [ ] The key is only ever placed with `{{API_KEY}}` in a **code** block, in a place a person will keep it safe (an environment file, a secret store, an integration's own credentials field): not in a URL, not in a public place, not in a shared spreadsheet.
- [ ] Nothing asks a parent to **turn off** a security setting, disable certificate checking, open a port to the internet, or run something as an administrator without saying why.
- [ ] Every link goes where its label says, and is `https`.
- [ ] Downloads (a script, an app) come from the repository at a tagged release, not from a third party.

## The plugin's behaviour (read the README, then skim the code)

- [ ] It talks to Five More Minutes **only on the local network**, and to nothing else the parent has not been told about. Anything that leaves the home (analytics, a cloud service) is described, optional, and off by default.
- [ ] The key is **not logged**, not put in a URL, not shown in a settings page or an error message, and not sent anywhere but to Five More Minutes.
- [ ] It does not **follow redirects** with the key.
- [ ] It does not act on the computer **except when the person using it asked it to** (a button, a flow that person wrote). Nothing starts or extends time by itself, for instance on a timer of its own.
- [ ] If it can make something worse for a child (cut the internet, lock a device), it **lets go on failure**: when it cannot reach Five More Minutes, when it is stopped, when it is uninstalled.
- [ ] Anything it exposes on the network (a settings page) is protected, and does not listen on the internet by default.
- [ ] It handles a revoked key kindly: says so, and stops asking.
- [ ] Dependencies are few, well known, and pinned by a lockfile.
- [ ] No obfuscated code, no minified code without its source, no downloading and running code at run time.

## When a new commit is pinned

- [ ] Read the diff between the old commit and the new one, not the whole plugin again.
- [ ] Have the **permissions** grown? A plugin that starts asking for more must say why, and the reviewer treats it as a new listing for that part.
- [ ] Have the **install steps** changed? Are they still correct?
- [ ] Are there new places the plugin sends data to?

## Outcomes

A reviewer **approves**, **asks for changes** (say what and why, kindly: authors are volunteers), or
**declines** with a reason. A decline is not permanent; fix it and open a new pull request. A plugin that
was fine and later is not (a compromised repository, a change of behaviour) is delisted at once: see
[SECURITY.md](../SECURITY.md).
