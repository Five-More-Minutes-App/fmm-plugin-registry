# Security

## What the marketplace does, and does not, promise

Being listed means a person read the plugin against the [review checklist](docs/review-checklist.md) **at a
specific commit**, and that the manifest and icon shown are the repository's own at that commit. It is not
an audit, and it does not vouch for what a plugin does after that commit.

What limits the harm a plugin can do is not trust but design:

- A plugin's key opens **one computer**, from the **local network only**. It cannot reach other computers, the household, other keys, or the PIN.
- It can do only what its **permissions** allow, and a parent sees them, with reasons, before they add it. A key's permissions cannot be widened afterwards.
- A parent can **revoke** a key at any time, and can see what it has done for thirty days.
- Everything the marketplace shows is **plain text**: a listing cannot carry script or markup, and links are `https` to real host names.

## Reporting a problem

**A plugin that is misbehaving, has been compromised, or asks for something it should not:** report it
privately, by GitHub's private vulnerability reporting on this repository (Security → Report a
vulnerability), or by email to the address on the maintainers' GitHub profile. Please do not open a public
issue for something that could hurt families before it is fixed.

Say which plugin, which commit, and what you saw.

## What happens

- A listing that is being used to hurt people can be **delisted at once**, by the maintainers, without waiting for the author. Delisting stops the marketplace offering it; a parent who already added it still has a key they can revoke in the portal, and the portal says so.
- The author is told, and is welcome to fix it and be listed again.
- Where a plugin needs a warning for people who already use it, the listing's page carries one.

## A vulnerability in the registry itself

(the scripts, the schema, the catalog): report it the same way. The catalog is static JSON built by a
script from the files in this repository, served over https, with the icons; there is no server here to
attack, but a bug in the validator that lets something through would matter, and we would like to hear of it.

## For plugin authors

Please see the notes in [CONTRIBUTING.md](CONTRIBUTING.md) on keys and failing safe. If you find a
vulnerability in a plugin you did not write, tell its author and, if it is listed here, us.
