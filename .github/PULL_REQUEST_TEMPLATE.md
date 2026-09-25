## Which plugin?

<!-- Its name, and whether this lists it for the first time or pins a new version. -->

## What does it do?

<!-- One or two sentences, for a parent. -->

## Permissions

<!-- Which of state:read / timer:start / timer:extend / timer:stop / timer:cancel it asks for, and why each is needed.
     If this pins a new version that asks for MORE than before, say what changed and why. -->

## Checklist

- [ ] `npm run validate` passes, and `npm run verify -- --only <id>` if you can reach GitHub
- [ ] `listing.json` pins a full 40-character commit hash, not a tag or a branch
- [ ] `plugin.json` and `icon.png` are copies of the repository's own at that commit
- [ ] The repository is public, has an open licence, and a README covering install, configuration, troubleshooting and permissions
- [ ] I have read the [review checklist](../docs/review-checklist.md)
- [ ] The plugin **lets go on failure** if it can make something worse for a child (cuts a connection, locks a device)
