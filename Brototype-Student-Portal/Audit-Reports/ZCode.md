# Audit — MNM Portal Companion for Brototype v1.0.0

**Reviewer:** ZCode · **Date:** 2026-09-05 · **Commit:** `63f38b5` (main, clean tree)
**Scope:** `script.user.js` (2,205 lines) audited as the deliverable; `modules/*.js`, `build.js`, `header.txt`, `footer.txt`, `README.md`, `TEST-CHECKLIST.md` cross-checked. Cross-referenced against the four prior reports in this folder (`MNM_Companion_AUDIT.md`, `GLM.txt`, `Claude.txt`, `Gemini.txt`).
**Build verification:** rebuilt from sources in-memory and compared — **byte-for-byte in sync**, including `__SCRIPT_VERSION__` stamping from `header.txt` → `LOCAL_VERSION`, contact-email body, and modal footer. The version-drift finding (prior N2) is properly fixed.

---

## Verdict

This is a careful, above-average userscript. The fixes that landed after the 2026-08-30 audit round are real and correct (Watch observer re-attach logic, cross-module batch guards, `URLSearchParams` module ID, upload-tip re-registration, version stamping). Security hygiene remains excellent: `textContent`-only DOM writes, no `eval`, the only `innerHTML` is a `""` clear, `noopener` on external links, and the sole network calls are two hardcoded author-controlled URLs.

However, this pass found **two genuinely new bugs** — one introduced as a side effect of the lock-wedge fix, one in the recently shipped Esc feature — plus a **structural lifecycle flaw in the teardown registry** that silently voids cleanup guarantees after the first SPA navigation. Several prior findings remain open, most notably the unverified "last 5 exams" DOM-order assumption and the title-keyed state store.

**Top 5 to fix now:**
1. **A1 — Esc hard-reloads the page from any Escape keypress**, including inside inputs and the site's own dialogs (data-destroying on module pages).
2. **A2 — The deferred-restore path is dead code**: `unlockAll()` clears `Lock.dirty` before `finishBatch` ever checks it.
3. **A3 — The teardown registry is one-shot**; after the first SPA navigation, `Watch`/insert-observer/scroll-timer teardowns never run again.
4. **A5 — The last-5 card never rebuilds** after a stats-card re-render, and its comment claims the opposite.
5. **B-open: "Last 5 exams" is actually "first 5 in DOM order"** — the ordering assumption is still unverified, and the date parser that would have fixed it was deleted in `b9f98a8` rather than wired up.

---

## A. New findings this pass

### A1 · HIGH — Esc hard-refresh fires on every Escape, with no target guard
`script.user.js:1860-1873`

```js
document.addEventListener("keydown", function (e) {
  if (e.key !== "Escape") return;
  if (document.getElementById("brot-settings-backdrop")) return;
  if (isModulePage()) { /* wipe all saved topic states to false */ }
  location.reload();
});
```

The only exclusion is the script's own settings modal. There is no check for:
- **Editable targets** — pressing Esc while typing in any input/textarea/contentEditable (site search, exam remarks, upload-dialog description fields) hard-reloads and destroys the form.
- **The site's own dialogs** — MUI Dialogs close on Esc natively; the user gets the dialog closing *and* a full page reload. The upload dialog is the exact place this feature's sibling (upload tip) operates.
- **The script's update modal** — excluded from the settings check, so Esc while it's open reloads too (inconsistent with the settings-modal carve-out).

On module pages this is worse than a reload: it force-writes **every saved topic state to `false`** before reloading. An ambient keypress destroys persisted data. This shipped in `22f00df` and TEST-CHECKLIST lists the intended behavior, but the editable-target gap looks unintended.

**Fix:** bail when `e.target.closest('input, textarea, select, [contenteditable="true"]')`, when `e.defaultPrevented`, and ideally when a `[role="dialog"]` other than your own is open; also consider `e.repeat`.

### A2 · HIGH — Deferred restore after a batch is dead code (`Lock.dirty` cleared before it is read)
`script.user.js:1034-1038` and `script.user.js:1069-1076`

```js
function unlockAll() {
  Lock.busy = false;
  Lock.dirty = false;   // ← clears the flag...
  hideOverlay();
}
...
      updateCounter();
      unlockAll();

      // Deferred restore (requested while this batch ran)
      if (Lock.dirty) {     // ← ...so this can never be true
        Lock.dirty = false;
        restore();
      }
```

`unlockAll()` was introduced/reshaped in `b9f98a8` (the overlay-timeout force-unlock fix needs *it* to clear `dirty`, to avoid a wedged re-restore). Side effect: in `finishBatch`, the check now sits *after* the clear, so any restore request that arrives while a batch runs — a user click, or the `Watch` observer re-initializing replaced topic nodes — is silently dropped. `restore()`'s own completion path does it correctly (`Lock.busy = false` at `:1268` without clearing `dirty`), so the two paths are now inconsistent.

The practical loss is contained by `finishBatch` writing the batch end-state for all topics, but it compounds the "steamroll" issue (B-open #7): re-bound nodes never get re-restored, and any pre-batch state not covered by the batch intent is lost.

**Fix:** capture the flag before unlocking —
```js
const deferred = Lock.dirty;
updateCounter();
unlockAll();
if (deferred) restore();
```

### A3 · MEDIUM — Teardown registry is one-shot; cleanup guarantees lapse after the first navigation
`script.user.js:1757-1790`, `:2113-2131`

`runTeardowns(list)` ends with `list.length = 0`, and **nothing ever re-registers** the teardowns:

- Registrations happen exactly once, at bootstrap (`:1760-1771`).
- `onUrlChange()` runs `runTeardowns(navTeardowns)` on **every** SPA navigation (`:2130`). After the first one, the array is empty forever → `Watch.disconnect()`, `disconnectInsertObserver()`, and `clearScrollTimeout()` never run on subsequent navigations.
- `pagehide` empties both arrays (`:2113-2116`). The bfcache comment at `:2120` claims *"Re-run init to re-register all listeners and observers"*, but `init()` does **not** re-register any teardowns — it only re-adds the upload-click listener.

Concrete consequences:
1. After the first SPA nav, `Watch` keeps observing `document.body` on every page for the rest of the session. Its callback early-returns cheaply when there are no topic containers, but it still runs two full-document `querySelectorAll` passes per React mutation batch — the exact cost the observer was supposed to be switched off for off-module pages.
2. A pending 600ms `scrollTimeout` can fire after navigation; the "clear on nav" guarantee (the L3 fix) silently lapses.
3. The `addControlsObserver` (insert-wait observer) is never force-disconnected on nav; it relies on self-disconnection the next time `tryInsert()` succeeds, and otherwise persists.

**Fix:** make teardowns idempotent and stop clearing (`list.length = 0` removal), or re-register the standard set inside `init()`/`pageshow`.

### A4 · MEDIUM — bfcache restore permanently kills the settings-popover watcher
`script.user.js:2166`, `:1767-1770`, `:2121-2127`

`watchSettingsPopover()` is called exactly once, at bootstrap. `pagehide` (which fires on bfcache entry) runs `destroySettingsWatcher()`. `pageshow(persisted)` re-runs `init()` (module pages only) and `startExams()` (exams page only) — but never `watchSettingsPopover()`. So after one back/forward-cache round-trip, the profile-popover "MNM Script Settings" row is never injected again until a full reload. Same root cause as A3; listed separately because it's a user-visible feature death.

**Fix:** call `watchSettingsPopover()` from the `pageshow` handler (it is self-guarding via `if (settingsObserver) return`).

### A5 · MEDIUM — Last-5 card never rebuilds; the comment contradicts the code
`script.user.js:1700-1702`

```js
if (oldCard) return; // already in place; observer rebuilds after re-renders
```

The observer does **not** rebuild — the guard returns while the card exists. If React re-renders/replaces the live stats card (data refresh, tab switches within exams), the clone keeps stale numbers and its forwarded buttons click **detached** original nodes (`origBtns[i]` captured at build time → dead buttons). If the original card is removed from the DOM, the clone can outlive it.

**Fix:** when `oldCard` exists, verify `oldCard.nextElementSibling` is still a connected stats card (or that `findStatsCard()` still returns the node the buttons reference); otherwise remove and rebuild.

### A6 · MEDIUM — Full-screen blocking overlay for up to 9s on module pages with zero topics
`script.user.js:2186-2203`

Kickoff: module page + `getContainers().length === 0` → `showOverlay("Loading…")` → 30 × 300ms wait. A module with **zero topics never renders a container**, so every visit to such a module holds an `inset:0`, `cursor:wait`, z-index-99999 overlay over the whole page for ~9.5 seconds. TEST-CHECKLIST asserts "Module with 0 topics → no controls injected, no errors" — true, but it misses the overlay block. The same wait also blocks slow renders, which is legitimate feedback; the zero-topic case is not.

**Fix:** don't render the overlay until the first topic container actually appears (it's already re-checked in the loop), or make the wait overlay `pointer-events:none`, or bail early on a "Total Topics: 0" signal.

### A7 · LOW/MEDIUM — No lock ownership token; a late restore timer can release a batch's lock
`script.user.js:1268` vs `:219-228`

`restore()`'s completion callback sets `Lock.busy = false` unconditionally. Scenario: a background-tab-throttled restore outlives the 30s overlay failsafe (which force-unlocks), the user starts Expand All (`Lock.busy = true`), then restore's eventually-delivered completion timer fires and releases the *batch's* lock mid-stagger. Per-click saves unmute for the remainder of the batch. The written values happen to be correct in most interleavings, which is why this is not HIGH, but the shared-lock design has no notion of "who owns the lock."

**Fix:** add a monotonically increasing generation/owner token to `Lock`; each op captures it and only releases/asserts if it still owns the lock.

### A8 · LOW — `restore()` delegates hiding its own overlay to an unrelated feature
`script.user.js:1220-1225`, `:1354`

In the `pending.length === 0` path (the common case on every load), `restore()` returns without `hideOverlay()`; the overlay is only removed because the `restore:settled` listener `scrollToLast` happens to call `hideOverlay()` in every branch. It works today (verified all branches), but the overlay's lifecycle is owned by the auto-scroll feature — any future change to `scrollToLast`'s early returns can leave a 30s overlay stuck. `restore()` should hide its own overlay on every exit path.

### A9 · LOW — `clickReadMore` can follow real links
`script.user.js:758-777` (prior GLM #7, still open)

The span/p/a loop clicks any element whose text contains "read more", with no href guard. An `<a href="...">Read more</a>` would navigate away mid-batch. Guard: skip `a[href]:not([href^="#"])`.

### A10 · LOW — `attach()` sets the bound-marker before validating the title
`script.user.js:1125-1130`

`c.dataset.brotListener = "1"` runs before `if (!title) return;`, so a container with an empty title is marked bound but receives **no** listener — and the Watch observer's `hasUnbound` check will never re-attach it. Currently unreachable (`getContainers` requires a "Topic N" h6), but it's a latent ordering trap. Move the marker assignment below the title check.

### A11 · LOW — `findExamRows()` can count the same row twice
`script.user.js:1538-1555`

Two "Completed on:" paragraphs inside one exam row both climb to the same ancestor and push it twice. The dedupe filter (`:1552-1554`) only removes ancestor-wrappers and explicitly excludes `o === r`, so exact duplicates survive → inflated `rows.length` → wrong last-5 percentages. Add a `Set` dedupe.

### A12 · LOW — 14 dead `COLORS` keys; the "dark mode" palette is a myth
`script.user.js:46`, `:52-56`, `:61-62`, `:71-76`

Verified zero usages for: `surfaceHover`, all 5 `danger*` keys, `accentText`, `accentBg`, and all 6 `dm*` keys. The `// dark mode` comment is misleading — there is no dark-mode implementation, and the settings CSS (`ensureBrotStyles`) hardcodes the same hex values the keys were meant to centralize, so the "single source of truth" is violated in both directions. Delete the keys or actually route the CSS through them.

### A13 · LOW — `console.log` noise in production paths
`:1186` (every topic click), `:1830` (every re-init), `:2085`, `:1078`. Consider a `DEBUG` flag or removing the per-click log.

### A14 · Nits
- `for (const bar of toolbars) { return … }` (`:824-826`) — decorative loop, `toolbars[0]` is meant.
- `min-height:16px` on the control buttons (`:879`) is a no-op (box is ~24px tall) — delete to avoid confusing future readers.
- No `@noframes` — the script runs in any same-origin iframe of the portal (duplicate overlays/controls possible). Prior M7, still open; one-line fix.
- `autoSelectPendingTab` scans **every** `div` on the page, up to 20 times (`:2055-2074`). Scope to `[role="tablist"]`/MUI tab classes, or at least break the loop after clicking.
- `getModuleId()` hash fallback (`:248-254`): if an `id` param exists but fails `^[a-f0-9-]+$` (e.g. contains `_`), **all** such modules share one state key (the hash covers only the identical pathname). Consider falling back to hashing `pathname + search` instead.
- "Skip this version" (`:2014-2017`) stores a version-less flag — it skips *all* updates for the session, not "this version."
- State keys from DOM text (`saved[title]`) would misbehave for a title literally named `__proto__`/`constructor` — purely theoretical; `Object.create(null)` or a `Map` removes the class of bug.
- `cmpVersions` returns `NaN` for prerelease tags (`1.0.1-beta`) — falsy, so treated as "equal"; harmless with current versioning, worth a comment.
- The custom update-checker (`fetch` full script + parse `@version`) is redundant machinery: adding `@downloadURL`/`@updateURL` pointing at the raw GitHub URL lets Violentmonkey/Tampermonkey handle updates natively, deleting ~150 lines and one page-load network request. (Supply-chain/CSP notes from prior H4 still apply either way.)

---

## B. Prior-audit scorecard (2026-08-30 reports)

### Verified fixed
| Prior finding | Status |
|---|---|
| H1: Watch observer defeats re-render survival | ✅ Now keys off missing `data-brotListener` markers (`:1811-1848`) |
| M3: upload-tip handler lost after nav | ✅ Re-registered in `init()` (`:2093`) |
| M4: bfcache leak | ⚠️ Partial — `pageshow` re-inits module/exams features, but settings watcher dies (A4) and teardown arrays stay empty (A3) |
| GLM#1: cross-module batch corruption | ✅ `batchModuleId` guards in `finishBatch`/`verifyRepair`/restore timers |
| GLM#2: permanent lock wedge | ✅ Overlay timeout force-unlocks (`:219-228`) — but see A2/A7 side effects |
| GLM#3: loose `getModuleId` regex | ✅ `URLSearchParams` + strict hex/uuid test (`:248-254`) |
| N1: dead code | ⚠️ Partial — `STATUS_COLORS`, `parseExamRow` removed; 14 `COLORS` keys remain dead (A12) |
| N2: version drift | ✅ `__SCRIPT_VERSION__` stamped from `header.txt` at build time; build verified in sync |

### Still open (re-confirmed in today's source)
1. **Last-5 ordering (prior H2, HIGH)** — `findExamRows().slice(0, 5)` (`:1561-1563`) assumes DOM order = newest first. Unverified assumption; the `parseExamRow` date parser that would have fixed it was deleted in `b9f98a8` instead of being wired up. If the exams list is oldest-first, the card is wrong and mislabeled. Parse "Completed on:" and sort desc — 10 lines.
2. **Title-keyed state (prior H3, HIGH)** — `saved[title]` (`:1175`); duplicate titles conflate topics (also breaks `liveContainer`'s first-match-by-title at `:991-995`); badge/count changes orphan state; keys accumulate forever. Key by index within the canonical container order, or title+ordinal.
3. **Remote fetch surface (prior H4, HIGH)** — `fetch(UPDATE_URL)` on every full page load (`:2029`) + per-overlay `<img>` from the same repo (`:176-177`, with a no-spinner fallback on error — GLM#4's note also still applies). CSP-dependent, single-point-of-compromise prompt. Prefer `@downloadURL` (native manager updates) and a data-URI/@resource image.
4. **`finishBatch` steamroll (GLM#5)** — writes `st[t] = expand` for **all** containers (`:1053-1058`) while per-click saves are muted during the batch, so user toggles mid-batch are lost and DOM/storage desync until next restore.
5. **Repair gives up but saves the lie (GLM#12)** — after 3 failed `verifyRepair` rounds, `finishBatch` still writes the intended end-state (`:1092-1103` → `:1053-1058`). Log a warning or write observed state.
6. **30s overlay cap vs long batches (GLM#8)** — `(N-1)*300 + 400` + up to 3 repair rounds exceeds 30s around ~95 topics; force-unlock then fires mid-batch (overlay gone, lock released, timers continue).
7. **Reset re-persists (prior N5/GLM#9)** — "Reset this module" removes the key then `toggleAll(false)` → `finishBatch` re-saves an all-`false` state (`:677-694`). "Forgotten" is actually "all collapsed, persisted."
8. **`findAnchor` positional fragility (prior M1)** — `insertBefore(panel, null)` appends when `children[1]` is missing (`:804-806`, `:974`); non-flex parents misplace the `margin-left:auto` panel.
9. **Clone hazards (prior M5)** — `stats.cloneNode(true)` duplicates site element IDs (`:1565`); button forwarding by array index (`:1599-1610`); settings-row clone can duplicate child `id`s too (`:445-462`).
10. **Body-wide observers + layout reads in hot paths (prior M6)** — three `document.body` subtree observers (`:483`, `:1717`, `:1849`); `getComputedStyle` per ancestor per topic in `findContainerFromH6` (`:292-302`); `isExpanded`'s `offsetHeight` reads in loops; `applyExams` re-scanning all `p`/`div` per debounced mutation.
11. **A11y (prior N8)** — settings/update modals lack `role="dialog"`, `aria-modal`, focus trap/restore.
12. **Cosmetic** — `batch:expanded` fires on collapse too (`:1049`); stagger comment overstates the guarantee (`:1023-1032`); `scrollToLast`'s `offsetTop` math assumes the scroller is the offset parent (`:1338-1345`); `color-mix()` needs Chromium 111+/FF 113+ (`:864-917`); synthetic-click 200ms debounce can swallow a fast repair re-click (prior N6).

---

## C. Verified done well (this pass)

- **Build integrity**: `script.user.js` is byte-identical to a fresh `build.js` output; `__SCRIPT_VERSION__` flows from the single `@version` header into `LOCAL_VERSION`, the update modal, the contact email, and the footer. No drift possible without editing the built file directly.
- **Security posture**: `textContent`-only construction throughout; single `innerHTML` usage is a `""` clear; no `eval`/`document.write`; `noopener` on both external windows; remote content limited to two author-owned URLs and parsed (not injected) as text.
- **Correctness rails**: every `localStorage` access try/caught; bus listener errors isolated (`:124-130`); throttling-aware stagger math in both batch and restore; cross-module guards in all three async phases (stagger, verify, finish); bounded retries everywhere (max 30 attempts / 2 restore retries / 3 repair rounds / 40 exam waits).
- **Esc-then-restore and bfcache re-init cover the main flows** — the gaps found (A3/A4) are the second-order ones.
- **Metadata**: ASCII-only code body (post-`63f38b5`), UTF-8-safe header, `@license MIT`, working `@icon`.

---

## D. Recommended priority order

1. **A1** — Esc editable-target/dialog guard (ship-blocker UX; also protects saved state).
2. **A2** — one-line `Lock.dirty` capture-before-unlock in `finishBatch`.
3. **A3 + A4** — stop clearing teardown arrays (or re-register in `init()`/`pageshow`), add `watchSettingsPopover()` to `pageshow`.
4. **B#1** — wire date parsing + sort into `findExamRows()` (or restore `parseExamRow`) so "Last 5" means last 5.
5. **A5** — last-5 card rebuild check; **A6** — no overlay until first container (or zero-topic bail).
6. **B#4/B#5** — write only `toToggle` titles in `finishBatch` (with `liveContainer`), and don't save a state the repair loop failed to reach.
7. **B#2/B#3** — index-based state keys; `@downloadURL` + data-URI image to retire the custom updater and remote img.
8. Housekeeping: A12 dead keys, A13 logs, A14 nits, `@noframes`.
