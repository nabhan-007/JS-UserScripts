# AGENTS.md

## Rules

1. **AGENTS.md maintenance**: Be proactive in adding, improving, and updating this file as new conventions, lessons, or preferences emerge during work.
2. **Browser**: Use `playwright-chrome` (Chromium) for all browser tasks unless explicitly told to use another browser.
2. **Script installation**: The user will install the updated script in Violentmonkey manually. Do not attempt to install it yourself.
3. **Git**: Do not commit or push without explicit user approval. Ask first.
4. **Audit findings**: Audit findings are tracked in `Brototype-Student-Portal/Audit-Reports/RESOLUTIONS.md` as a unified checklist — one entry per unique finding, deduped across reviewers, with source tags, a checkbox, and a `Resolution:` line stating how it was dealt with (Implemented / False alarm / Declined / Accepted / Partial / Open, with commit or `file:line` evidence). Tick an item only with verified evidence; move entries to the matching Closed section and update the header counts as fixes land. New audit reports should emit findings in this checklist format from the start and be merged into the ledger.

## Project Notes

- `Brototype-Student-Portal/`: sources live in `modules/*.js` (build order in `build.js`); `script.user.js` is generated — never edit it directly, run `node build.js` after editing modules.
- `__SCRIPT_VERSION__` in modules is stamped from `header.txt`'s `@version` at build time; bump the version only in `header.txt`.
- Audit reports are stored in `Brototype-Student-Portal/Audit-Reports/`, one file per reviewer/model (e.g. `GLM.txt`, `ZCode.md`). They are the historical record — remediation status lives in `Audit-Reports/RESOLUTIONS.md` (see rule 4).
