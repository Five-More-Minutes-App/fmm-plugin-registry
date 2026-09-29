#!/usr/bin/env bash
# Turns "every listing is validated, and a person approves it before it's live" from something
# CONTRIBUTING.md asks for into something GitHub itself enforces on `main` - for a brand-new
# plugin and for a one-line re-pin alike, since both arrive as a pull request touching a path
# CODEOWNERS covers.
#
# Needs: `gh auth login` as someone with admin rights on the real repository, and CODEOWNERS
# (.github/CODEOWNERS) already merged with real team handles - a code-owner review can't be
# required from a team GitHub can't resolve.
#
# Safe to re-run: it replaces the same protection rule with the same settings.

set -euo pipefail
: "${FMM_REGISTRY_REPO:?export FMM_REGISTRY_REPO=owner/repo, e.g. five-more-minutes/fmm-plugin-registry}"

# The exact name GitHub shows for ci.yml's job in the PR checks list. It is "check" for a single
# workflow with no other job of that name; if another workflow is added later with a job that
# also happens to be called "check", GitHub will ask you to disambiguate in Settings -> Branches
# and this needs updating to match. Confirm it once after ci.yml's first real run:
#   gh api "repos/${FMM_REGISTRY_REPO}/commits/main/check-runs" --jq '.check_runs[].name'
FMM_REQUIRED_CHECK="${FMM_REQUIRED_CHECK:-check}"

gh api \
  --method PUT \
  -H "Accept: application/vnd.github+json" \
  "repos/${FMM_REGISTRY_REPO}/branches/main/protection" \
  --input - <<JSON
{
  "required_status_checks": {
    "strict": true,
    "checks": [{ "context": "${FMM_REQUIRED_CHECK}" }]
  },
  "enforce_admins": true,
  "required_pull_request_reviews": {
    "required_approving_review_count": 1,
    "require_code_owner_reviews": true,
    "dismiss_stale_reviews": true
  },
  "restrictions": null,
  "required_conversation_resolution": true,
  "required_linear_history": true,
  "allow_force_pushes": false,
  "allow_deletions": false
}
JSON

echo
echo "main is now protected. From here, every pull request - a new listing, an update to one"
echo "already listed, or a change to the schema or scripts - needs:"
echo "  - the '${FMM_REQUIRED_CHECK}' workflow green (validate, verify-pinned, test, build)"
echo "  - an approval from whoever CODEOWNERS names for the paths it touches"
echo "  - every review comment resolved"
echo "before it can merge, and enforce_admins means that applies to repository admins too."
