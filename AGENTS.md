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
- Script buttons must never show a focus outline: the global rule in `#brot-styles` (`core.js`) covers every `button` inside `[id^="brot-"]` containers plus `button[id^="brot-"]` itself. Keep the `brot-` id convention on all current/future script containers and buttons — no per-button fix needed.
- Shared classes in `#brot-styles` (`.brot-card`, `.brot-done`, …) are scoped to `#brot-settings-backdrop` — they do NOT apply inside other backdrops. New modals must either extend those selectors or (preferred, update-modal pattern) style everything inline.
- Live verification caveat: a portal tab runs the script copy loaded at its last (hard) refresh. After any Violentmonkey update, hard-refresh portal tabs before testing, or you will be testing the old build.
- Test-profile caveat: the MCP Chrome profile has the last *released* build installed in Violentmonkey. It wins first-come races (settings row — the popover DOM persists, so the first injector owns the row forever) and races restores with injected test copies. New-UI verification needs either a row owned by the new copy (rare) or user-side confirmation on a clean single-copy install. Also: `page.addInitScript` is page-bound, not context-wide — fresh tabs need their own injection.
