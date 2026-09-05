# Findings Ledger — MNM Portal Companion

**Single source of truth for audit remediation.** Every finding from every report in this
folder is deduplicated into one checklist entry below. The original reports
(`MNM_Companion_AUDIT.md`, `GLM.txt`, `Claude.txt`, `Gemini.txt`, `ZCode.md`) are left
untouched as the historical record.

**Snapshot:** script v1.0.0 · commit `63f38b5` · reconciled 2026-09-05 from the full audit pass in `ZCode.md`.
**Last updated:** 2026-09-05 · all `modules/*.js` line refs pinned to `63f38b5`.

| Status | Count |
|--------|-------|
| Open: Low | 21 |
| Open: Medium | 11 |
| Closed: Implemented | 8 |
| Open: High | 5 |
| Closed: Accepted | 5 |
| Closed: Declined | 4 |
| Closed: False alarm | 2 |
| **Total** | **56** |

## Contents

- [Open: High (5)](#open-high)
- [Open: Medium (11)](#open-medium)
- [Open: Low (21)](#open-low)
- [Closed: Implemented (8)](#closed-implemented)
- [Closed: False alarm (2)](#closed-false-alarm)
- [Closed: Declined (4)](#closed-declined)
- [Closed: Accepted (5)](#closed-accepted)

**Legend:** `H` = High · `M` = Medium · `L` = Low · `C` = Implemented · `F` = False alarm ·
`D` = Declined · `A` = Accepted · `◐ Partial` = partly fixed, residual tracked in place.

## How to maintain this file

- Every entry has a checkbox and a `Resolution:` line stating **how it was dealt with** — not just whether code changed. Tick an entry **only with verified evidence** (commit hash or `file:line`).
- Statuses: **Implemented** (code changed — cite commit + location) · **False alarm** (finding was wrong — say why) · **Declined** (considered and rejected — say why) · **Accepted** (risk/trade-off consciously taken) · **Partial** (some landed, residual tracked — cross-reference the residual entry) · **Open** (no action yet).
- When a fix lands: move the entry to the matching Closed section, fill in the `Resolution:` with the commit and `file:line` evidence, and update the counts table above.
- New audit reports should emit findings in this format from the start (checkbox + `Resolution:`) and be merged here — see the rule in `AGENTS.md`. Narrative sections (executive summaries, "what's done well", priority lists) are not findings and are not tracked. Testable behavior lives in `../TEST-CHECKLIST.md`, not here.

**Source tags:** `MNM-#` = MNM_Companion_AUDIT.md · `GLM-#` = GLM.txt · `Claude-#` = Claude.txt · `Gemini:#` = Gemini.txt · `ZCode:A#` / `ZCode:B#` = ZCode.md sections.

---

## Open: High

- [ ] **H1 — Esc fires in inputs and site dialogs** · `ZCode:A1`
  - Problem: no editable-target or site-dialog guard (`runtime.js:108`). Esc while typing
    in any input, or while the site's own MUI dialogs are open, hard-reloads — and on
    module pages it first wipes **all** saved topic states to `false`. The update modal
    isn't excluded either (inconsistent with the settings-modal carve-out).
  - Fix: bail on `e.target.closest('input, textarea, select, [contenteditable="true"]')`,
    on `e.defaultPrevented`, and on open site dialogs.
  - Resolution: Open — no action yet.

- [ ] **H2 — Deferred restore after a batch is dead code** · `ZCode:A2`
  - Problem: `unlockAll()` clears `Lock.dirty` (`module-page.js:290`) *before*
    `finishBatch` checks it (`module-page.js:328`), so restore requests arriving mid-batch
    (user click, Watch re-init) are silently dropped. Side effect of the lock-wedge fix
    reshaped in `b9f98a8`.
  - Fix: capture the flag before unlocking.
  - Resolution: Open — no action yet.

- [ ] **H3 — "Last 5 exams" is actually the first 5 in DOM order** · `MNM-H2` · `ZCode:B#1`
  - Problem: `findExamRows().slice(0, 5)` (`exams.js:56`) assumes DOM order = newest
    first; unverified. The `parseExamRow` date parser that would have fixed this was
    deleted in `b9f98a8` instead of wired up.
  - Fix: parse "Completed on:" and sort descending before slicing.
  - Resolution: Open — no action yet.

- [ ] **H4 — State keyed by topic-title string** · `MNM-H3` · `GLM-#11` · `ZCode:B#2`
  - Problem: duplicate titles conflate topics (also breaks `liveContainer`'s
    first-match-by-title, `module-page.js:247`); badge/count changes orphan keys; keys
    accumulate with no cleanup. A title literally named `__proto__` would also misbehave
    (`Object.create(null)` or a `Map` removes that class too).
  - Fix: key by index within the canonical container order, or title + ordinal.
  - Resolution: Open — no action yet.

- [ ] **H5 — Remote fetch surface under `@grant none`** · `MNM-H4` · `GLM-#4` · `ZCode:B#3`
  - Problem: `fetch(UPDATE_URL)` on every full page load (`runtime.js:276`,
    CSP-dependent) + remote overlay `<img>` (`core.js:155`, error path leaves label-only
    with no spinner fallback).
  - Fix: add `@downloadURL`/`@updateURL` so the manager handles updates natively
    (retires the custom checker, ~150 lines); inline the image as a data URI / `@resource`.
  - Resolution: Open — no action yet.

## Open: Medium

- [ ] **M1 — Teardown registry is one-shot; bfcache kills the settings watcher** · `MNM-M4` · `ZCode:A3` · `ZCode:A4`
  - Problem: `runTeardowns` empties the arrays (`runtime.js:29`) and nothing re-registers
    them. After the **first** SPA nav, `Watch.disconnect()` / insert-observer / scroll-timer
    teardowns never run again; after the first `pagehide` (`runtime.js:361`), `pageshow`
    re-inits module/exams features (`runtime.js:369`) but never `watchSettingsPopover()`
    (bootstrap-only, `runtime.js:414`), so the settings row stops injecting until a full
    reload. The bfcache comment at `runtime.js:369` claims init re-registers — it doesn't.
  - Fix: make teardowns idempotent (drop `list.length = 0`) or re-register in
    `init()`/`pageshow`.
  - Resolution: Open — no action yet.

- [ ] **M2 — Last-5 card never rebuilds; comment contradicts code** · `ZCode:A5`
  - Problem: `if (oldCard) return;` (`exams.js:196`) claims "observer rebuilds after
    re-renders" but returns while the card exists. After a stats-card re-render the clone
    keeps stale numbers and its forwarded buttons click detached originals.
  - Fix: verify the original card is still connected where the shell expects it; otherwise
    remove and rebuild.
  - Resolution: Open — no action yet.

- [ ] **M3 — Blocking overlay for ~9s on zero-topic modules** · `ZCode:A6`
  - Problem: kickoff shows a blocking `inset:0; cursor:wait` overlay and waits 30x300ms
    for containers that never render (`runtime.js:437`). Every visit to a module with zero
    topics blocks the page ~9.5s.
  - Fix: don't render the overlay until the first container appears, or bail on a
    "Total Topics: 0" signal.
  - Resolution: Open — no action yet.

- [ ] **M4 — Shared lock has no ownership token** · `ZCode:A7`
  - Problem: `restore()`'s completion callback releases `Lock.busy` unconditionally
    (`module-page.js:524`). Combined with the 30s force-unlock (`core.js:198`, see C3), a
    late throttled restore timer can release a *batch's* lock mid-stagger.
  - Fix: generation/owner token on `Lock`; ops only release/assert if they still own it.
  - Resolution: Open — no action yet.

- [ ] **M5 — `finishBatch` steamrolls all containers** · `GLM-#5` · `ZCode:B#4`
  - Problem: writes `st[t] = expand` for **all** containers (`module-page.js:309`) while
    per-click saves are muted during the batch, so user toggles mid-batch are lost and
    DOM/storage desync until the next restore.
  - Fix: write only `toToggle` titles resolved via `liveContainer`.
  - Resolution: Open — no action yet.

- [ ] **M6 — Repair gives up but saves the intended state anyway** · `GLM-#12` · `ZCode:B#5`
  - Problem: after 3 failed `verifyRepair` rounds (`module-page.js:340`), `finishBatch`
    still writes the batch end-state as if it succeeded.
  - Fix: log a warning, or write the observed state instead of the intent.
  - Resolution: Open — no action yet.

- [ ] **M7 — 30s overlay cap vs long batches** · `GLM-#8` · `ZCode:B#6`
  - Problem: around ~95+ topics, `(N-1)*300 + 400` (`module-page.js:361`) plus repair
    rounds exceeds the 30s failsafe (`core.js:198`); the overlay disappears and the lock
    is force-released mid-batch (interacts with M4).
  - Fix: scale the cap with topic count or drop the fixed timeout.
  - Resolution: Open — no action yet.

- [ ] **M8 — `findAnchor()` positional fragility** · `MNM-M1` · `ZCode:B#8`
  - Problem: `overviewRow.children[1]` anchor (`module-page.js:61`) with
    `insertBefore(panel, null)` appending when missing (`module-page.js:230`);
    `margin-left:auto` misplaces the panel on non-flex parents.
  - Fix: verify the flex layout or add a visible fallback position.
  - Resolution: Open — no action yet.

- [ ] **M9 — CloneNode hazards: duplicate IDs + index-based button forwarding** · `MNM-M5` · `GLM:nit` · `ZCode:B#9`
  - Problem: last-5 clone duplicates site element IDs (`exams.js:59`) and forwards buttons
    by array index onto captured originals (`exams.js:93`); the settings-row clone can
    duplicate child `id`s too (`settings.js:21`).
  - Fix: strip `id`s in clones; match buttons by role/text, not index.
  - Resolution: Open — no action yet.

- [ ] **M10 — Body-wide observers + forced layout in hot paths** · `MNM-M6` · `GLM:nit` · `Gemini:Observer-overload` · `ZCode:B#10`
  - Problem: three `document.body` subtree observers (`settings.js:59`, `exams.js:211`,
    `runtime.js:97`); `getComputedStyle` per ancestor per topic (`core.js:271`);
    `offsetHeight` reads in `isExpanded` loops (`core.js:288`); `applyExams` re-scans all
    `p`/`div` per debounced mutation. Watch's unbound early-return already trims cost on
    clean pages.
  - Fix: scope observers, cache cursor state per container.
  - Resolution: Open — no action yet.

- [ ] **M11 — `getModuleId` residual: hash fallback collision** ◐ Partial · `MNM-M2` · `ZCode:A14`
  - Problem: the reported bug (any `*id` param matching) is fixed via `URLSearchParams` +
    strict hex test (`core.js:227`, see C4). Residual: an `id` that fails `^[a-f0-9-]+$`
    (e.g. contains `_`) makes **all** such modules share one state key — the fallback
    hashes only the identical pathname.
  - Fix: hash `pathname + search`.
  - Resolution: Partial — param bug fixed, fallback collision open.

## Open: Low

- [ ] **L1 — Missing `@noframes` / explicit `@run-at`** · `MNM-M7` · `ZCode:A14`
  - Problem: one-line header fix (`header.txt:4`); the script currently also runs in any
    same-origin iframe of the portal.
  - Fix: add `@noframes` and an explicit `@run-at`.
  - Resolution: Open — no action yet.

- [ ] **L2 — Upload tip renders above the batch overlay** · `MNM-M8`
  - Problem: tip z-index 100000 (`module-page.js:647`) vs overlay 99999 (`core.js:143`).
  - Fix: reorder.
  - Resolution: Open — no action yet.

- [ ] **L3 — 14 dead `COLORS` keys + hex duplicated in CSS strings** ◐ Partial · `MNM-N1` · `GLM:single-source` · `ZCode:A12`
  - Problem: `STATUS_COLORS` and `parseExamRow` removed in `b9f98a8` (see C7). Still
    unused: `surfaceHover`, 5x `danger*`, `accentText/Bg`, 6x `dm*` (`core.js:17`) — while
    `ensureBrotStyles` (`core.js:345`) and `injectControlTheme` (`module-page.js:116`)
    hardcode the same hexes.
  - Fix: delete the keys or route the CSS through them.
  - Resolution: Partial — dead code removed, unused keys open.

- [ ] **L4 — "Dark mode" palette is a myth; accent language inconsistent** · `MNM-N3`
  - Problem: cosmetic — no dark-mode implementation exists; controls use `#1976d2`
    (`module-page.js:114`) vs `COLORS.accentText` `#1a6ddb` (`core.js:17`); settings/update
    UI uses fixed white surfaces on dark pages.
  - Fix: decide — implement or delete.
  - Resolution: Open — no action yet.

- [ ] **L5 — Repeated `loadSettings()`/`load()` JSON parses** · `MNM-N4`
  - Problem: micro — parse per click/overlay/`applyExams` (`core.js:58`, `core.js:324`).
  - Fix: cache in memory, invalidate on save.
  - Resolution: Open — no action yet.

- [ ] **L6 — "Reset this module" re-persists an all-collapsed state** · `MNM-N5` · `GLM-#9`
  - Problem: `removeItem` then `toggleAll(false)` (`settings.js:253`) re-saves all-`false`
    via `finishBatch`. "Forgotten" is actually "persisted collapsed".
  - Fix: make the collapse DOM-only or skip the save.
  - Resolution: Open — no action yet.

- [ ] **L7 — Synthetic-click debounce can drop repair re-clicks** · `MNM-N6`
  - Problem: low risk — 200ms guard (`module-page.js:406`) vs 300ms stagger margins
    (`module-page.js:282`); silent loss if the site renders slowly.
  - Fix: widen the margin or drop the guard.
  - Resolution: Open — no action yet.

- [ ] **L8 — Modals lack role=dialog / aria-modal / focus trap** · `MNM-N8` · `GLM:nit` · `ZCode:B#11`
  - Problem: settings (`settings.js:78`) and update (`runtime.js:147`) modals; screen
    readers can tab behind them.
  - Fix: add `role="dialog"`, `aria-modal`, focus trap.
  - Resolution: Open — no action yet.

- [ ] **L9 — `clickReadMore` can follow real links** · `GLM-#7` · `ZCode:A9`
  - Problem: span/p/a loop has no href guard (`module-page.js:7`); a "read more" anchor
    navigates away mid-batch.
  - Fix: skip `a[href]:not([href^="#"])`.
  - Resolution: Open — no action yet.

- [ ] **L10 — `restore()` delegates hiding its overlay to `scrollToLast`** · `ZCode:A8`
  - Problem: the `pending === 0` path never calls `hideOverlay` (`module-page.js:476`);
    works only because the `restore:settled` listener (`module-page.js:560`) hides in every
    branch.
  - Fix: restore should own its overlay lifecycle.
  - Resolution: Open — no action yet.

- [ ] **L11 — `attach()` marks container bound before validating the title** · `ZCode:A10`
  - Problem: `dataset.brotListener = "1"` precedes the `if (!title) return`
    (`module-page.js:380`); unreachable today, latent trap.
  - Fix: reorder.
  - Resolution: Open — no action yet.

- [ ] **L12 — `findExamRows()` can double-count a row** · `ZCode:A11`
  - Problem: two "Completed on:" paragraphs in one row push it twice; the dedupe filter
    excludes `o === r` (`exams.js:32`).
  - Fix: Set-dedupe.
  - Resolution: Open — no action yet.

- [ ] **L13 — `console.log` noise in production paths** · `ZCode:A13`
  - Problem: per-click (`module-page.js:442`), re-init (`runtime.js:78`), init
    (`runtime.js:333`), batch done (`module-page.js:334`).
  - Fix: DEBUG flag or remove.
  - Resolution: Open — no action yet.

- [ ] **L14 — Stagger comment overstates the throttling guarantee** · `GLM-#6`
  - Problem: doc — comment claims delays can't collapse; the code only avoids adding
    lateness on top (`module-page.js:279`).
  - Fix: reword, or switch to a single target-time loop.
  - Resolution: Open — no action yet.

- [ ] **L15 — `batch:expanded` fires on collapse too** · `GLM-#10` · `ZCode:B#12`
  - Problem: naming — emitted unconditionally (`module-page.js:305`); harmless today
    (the empty-collapse path at `module-page.js:267` also emits).
  - Fix: gate on `expand` or rename.
  - Resolution: Open — no action yet.

- [ ] **L16 — `scrollToLast` offset math assumes the scroller is the offsetParent** · `GLM:nit` · `ZCode:B#12`
  - Problem: `c.offsetTop - scroller.offsetTop - 100` (`module-page.js:592`) lands wrong
    otherwise, and the `scrollIntoView` fallback is never reached in that case.
  - Fix: use `getBoundingClientRect()` deltas.
  - Resolution: Open — no action yet.

- [ ] **L17 — `autoSelectPendingTab` scans every div up to 20x** · `ZCode:A14`
  - Problem: `querySelectorAll("div")` + `textContent.trim()` per attempt (`runtime.js:304`,
    20 attempts at `runtime.js:298`).
  - Fix: scope to `[role="tablist"]`/MUI tabs.
  - Resolution: Open — no action yet.

- [ ] **L18 — "Skip this version" skips all versions for the session** · `ZCode:A14`
  - Problem: version-less `sessionStorage` flag (`runtime.js:262`); checked at
    `runtime.js:286`.
  - Fix: store the version string.
  - Resolution: Open — no action yet.

- [ ] **L19 — Strategy-3 decorative `for..of`** · `GLM:nit` · `Claude-#3` · `ZCode:A14`
  - Problem: returns on the first iteration (`module-page.js:77`); `toolbars[0]` is meant.
  - Fix: index directly.
  - Resolution: Open — no action yet.

- [ ] **L20 — `min-height:16px` on control buttons is a no-op** · `Claude-#4` · `ZCode:A14`
  - Problem: box is already ~24px tall (`module-page.js:135`).
  - Fix: delete.
  - Resolution: Open — no action yet.

- [ ] **L21 — `cmpVersions` returns NaN for prerelease tags** · `ZCode:A14`
  - Problem: trivia — `1.0.1-beta` compares as NaN, treated as equal (`runtime.js:136`).
  - Fix: comment or guard.
  - Resolution: Open — no action yet.

---

## Closed: Implemented

- [x] **C1 — Watch observer defeats re-render survival** · `MNM-H1` · `ZCode:B`
  - Fix landed: observer now keys off missing `data-brotListener` markers instead of
    "controls + topics exist" (`runtime.js:44`, check at `runtime.js:65`); TEST-CHECKLIST
    has the matching regression item.
  - Resolution: Implemented — verified fixed.

- [x] **C2 — Cross-module state corruption mid-batch** · `GLM-#1` · `ZCode:B`
  - Fix landed: `batchModuleId` captured at batch start (`module-page.js:274`); guards in
    `finishBatch`, `verifyRepair`, and all restore timers (`module-page.js:299`,
    `module-page.js:340`, `module-page.js:476`); TEST-CHECKLIST "P0 fix" items.
  - Resolution: Implemented — verified fixed.

- [x] **C3 — `Lock.busy` can wedge permanently** · `GLM-#2` · `ZCode:B`
  - Fix landed: 30s overlay timeout now force-unlocks `Lock.busy`/`Lock.dirty`
    (`core.js:198`, reshaped in `b9f98a8`); restore has try/catch (`module-page.js:460`).
    Residual (no ownership token) tracked as M4.
  - Resolution: Implemented — verified fixed.

- [x] **C4 — `getModuleId` regex matches any `*id` param** · `GLM-#3` · `MNM-M2`
  - Fix landed: `URLSearchParams` + strict `^[a-f0-9-]+$` test (`core.js:227`);
    TEST-CHECKLIST has the `?userid=` regression item. Residual tracked as M11.
  - Resolution: Implemented — verified fixed.

- [x] **C5 — Upload-tip handler lost after first SPA nav** · `MNM-M3` · `ZCode:B`
  - Fix landed: re-registered in `init()` (`runtime.js:341`); same function reference
    prevents duplicates.
  - Resolution: Implemented — verified fixed.

- [x] **C6 — Version defined in 3+ places (drift risk)** · `MNM-N2` · `Claude-#2` · `GLM:nit`
  - Fix landed: `__SCRIPT_VERSION__` in modules is stamped from `header.txt`'s `@version`
    at build time (`build.js:12`, injected at `build.js:19`; consumed in `runtime.js:129`,
    `settings.js:123`, `settings.js:306`). Build verified byte-for-byte in sync on `63f38b5`.
  - Resolution: Implemented — verified fixed.

- [x] **C7 — Dead code: `STATUS_COLORS`, `parseExamRow`** · `MNM-N1`
  - Fix landed: removed in `b9f98a8`. Residual (14 dead `COLORS` keys) tracked as L3.
    Note: deleting `parseExamRow` also removed the tool that would fix H3 — see that entry.
  - Resolution: Implemented — verified fixed.

- [x] **C8 — bfcache restore leaks (pagehide empties teardowns)** · `MNM-M4`
  - Fix landed: `pageshow(persisted)` re-runs `init()` + `startExams()` (`runtime.js:369`,
    teardown on `pagehide` at `runtime.js:361`), covering module/exams features. Residuals
    (one-shot registry, dead settings watcher) tracked as M1.
  - Resolution: Partial — module/exams covered, settings watcher residual open (see M1).

## Closed: False alarm

- [x] **F1 — `usedFallback` is "written, never read"** · `GLM:nit`
  - Fix landed: none needed — it is read in `init()` for the strategy log (`runtime.js:333`).
    The GLM audit worked from a truncated paste.
  - Resolution: False alarm — finding was wrong.

- [x] **F2 — "State hydration: listeners vanish silently on node recreation"** · `Gemini:#`
  - Fix landed: none needed — the `data-brotListener` marker + Watch unbound re-attach
    (`runtime.js:44`, see C1) plus `liveContainer()` re-resolution by title
    (`module-page.js:247`) cover node replacement; the Gemini report predated the C1 fix.
  - Resolution: False alarm — already handled.

## Closed: Declined

- [x] **D1 — Replace localStorage with IndexedDB** · `Gemini:#`
  - Fix landed: none — writes are tiny JSON strings at >=300ms intervals; async storage
    adds complexity for negligible gain on this page. Revisit only if batch ops ever
    stutter measurably.
  - Resolution: Declined — considered and rejected.

- [x] **D2 — Intercept network requests to spoof exam JSON instead of DOM rewriting** · `Gemini:#`
  - Fix landed: none — invasive and fragile for a purely cosmetic, opt-in local feature;
    the DOM-rewrite approach touches no traffic and is fully reversible.
  - Resolution: Declined — considered and rejected.

- [x] **D3 — Replace `window.confirm` on "Reset ALL" with a non-blocking dialog** · `MNM-N7`
  - Fix landed: none — native confirm is deliberate: unmissable for a destructive action,
    zero code, consistent with the portal's simplicity.
  - Resolution: Declined — considered and rejected.

- [x] **D4 — Harden state keys against `__proto__`/`constructor` titles** · `ZCode:A14`
  - Fix landed: none — purely theoretical (site titles are "Topic N …"); naturally resolved
    if H4's key redesign lands.
  - Resolution: Declined — considered and rejected.

## Closed: Accepted

- [x] **A1 — Text/DOM-structure-based selectors are inherently brittle** · `Claude-#5` · `Gemini:Brittle-selectors`
  - Fix landed: none — deliberate trade-off; with a CSS-in-JS site and no official hooks,
    stable-text strategies are the best available option. Documented as the script's top
    maintenance dependency.
  - Resolution: Accepted — risk consciously taken.

- [x] **A2 — `color-mix()` requires Chromium 111+ / Firefox 113+** · `GLM:nit` · `Claude-#1`
  - Fix landed: none — target browsers are current; older engines lose only borders/hover
    tints cosmetically.
  - Resolution: Accepted — risk consciously taken.

- [x] **A3 — `@grant none` lets page scripts read the `brot_*` keys** · `GLM:nit`
  - Fix landed: none — personal tool on the user's own portal; `GM.setValue` would add
    manager coupling for no real threat model.
  - Resolution: Accepted — risk consciously taken.

- [x] **A4 — Legacy `brot_topicN_` keys are orphaned, not migrated** · `GLM:nit`
  - Fix landed: none — "Reset ALL modules" already cleans every generation via
    `/^brot_topic\d+_/` (`settings.js:284`).
  - Resolution: Accepted — risk consciously taken.

- [x] **A5 — Delusion mode should be "deliberately labeled" as cosmetic** · `Claude:#`
  - Fix landed: none needed — it is opt-in, viewer-only, touch-free on traffic, and the
    README presents it as a stats trick. Noted for the future disclaimer feature (TODO #4).
  - Resolution: Accepted — no action needed.
