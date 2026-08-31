# Audit — MNM Portal Companion for Brototype (v1.0.0)

**Scope:** `student.brototype.com` — Tampermonkey userscript, `@grant none`, no dependencies.
**Audited against the pasted source.** Severity: **Critical → High → Medium → Low/Nit.**

---

## Executive summary

This is a **well-written, thoughtfully engineered userscript**. The architecture is genuinely good for a userscript: a decoupled event bus, a shared busy-lock, an explicit teardown registry, graceful `localStorage` try/catch everywhere, safe `textContent`-only DOM writes (no `innerHTML` injection), and comments that explain the *why* behind each fix. Async batch timing accounts for background-tab throttling. That is above-average quality.

However, it carries **real fragility where it counts — the DOM coupling is heuristic-driven** (MUI hash classes, `cursor:pointer`, `offsetHeight`), and a few **logic bugs undermine the feature's own stated guarantees** (re-render survival, "last 5 exams" correctness, upload-tip lifecycle). None of these would corrupt the host page (the script fails soft), but several would silently make the feature stop working or compute the wrong answer.

**Top 5 things to fix:**
1. The `Watch` observer short-circuit that defeats re-render survival (High).
2. "Last 5 exams" uses unscoped DOM order — may be the *first* 5, not the *last* 5 (High).
3. State keyed by topic-title string → collisions on duplicate titles (High).
4. Cross-origin update-check + loading-image fetch under `@grant none` (supply-chain / CSP surface) (High).
5. Upload-tip click handler removed on navigation and never re-added (Medium).

---

## Findings by severity

### 🔴 HIGH

#### H1. The `Watch` observer defeats its own "survives re-renders" guarantee
`Watch.start()`'s MutationObserver callback begins with:

```js
const controlsExist = !!document.getElementById("brot-topic-controls");
const hasTopics = getContainers().length > 0;
if (controlsExist && hasTopics) return;   // ← early exit
```

The whole point of this observer is to re-run `addControls()` + `attach()` after React re-renders replace the topic container nodes. But when the header row (which holds the controls) survives while the *topic list* is re-rendered, both `controlsExist` **and** `hasTopics` are true — so the observer **returns and never re-attaches listeners**. The result: the per-topic `click` listeners stay bound to detached containers, new topic nodes get no listener, and the "remembers expanded/collapsed state" feature silently dies until the next full navigation.

The debounced body also re-checks `if (document.getElementById("brot-topic-controls")) return;`, so it's guarded again — belt and suspenders, but both guards have the same flaw. The Perf#5 optimization here trades a real correctness guarantee for a CPU saving.

**Recommendation:** track the *topic container nodes* you last bound to and compare, rather than "controls exist + topics exist." E.g. maintain a hashset of bound container elements; on mutation, if any current container is unbounded (no `[data-brot-listener]`), re-run `attach()`. Drop the early-return, or make it "return early only if **all** current containers already have the listener marker."

#### H2. "Last 5 exams" likely returns the *first* five, not the last five
`buildLast5Card()` does `findExamRows().slice(0, 5)` and `findExamRows()` returns rows **in DOM order**. Whether that's chronologically "most recent first" is an unverified assumption — it depends entirely on how the site orders the exam list. If the site's list puts the oldest at the top (common for logs/tables), the card labeled "Last 5 exams" is actually the **first 5 / oldest** exams, and the recomputed pass-rate % is wrong.

`parseExamRow()` *already extracts a parsed date string* — but it's **never called** (see Nit N1), so the date is available and unused.

**Recommendation:** parse each row's date, sort descending, then take the most recent 5. Or at minimum assert/document the site ordering; do not silently assume.

#### H3. State keyed by topic-title string → collisions and drift
`load()`/`save()` use `saved[title]` where `title = h6.textContent.trim()` (e.g. "Topic 4 – Arrays"). Two risks:
- **Duplicate titles** (two "Topic 4" headings) share one key — expanding one marks both, and the collapse/expand restore flips them together.
- **Title drift** — if the heading includes a live count, a "New" badge, or the site appends an ID, the key changes and the saved state for that topic is orphaned (also never cleaned up, so storage grows).

**Recommendation:** key by a stable per-topic attribute (data-index / position in the stable list / a known heading + ordinal), or key by list **index** of the container in the canonical `getContainers()` order, not by human-readable text.

#### H4. Cross-origin network dependency under `@grant none`
Two things reach a personal GitHub repo over the network on every load:
- `checkForUpdate()` → `fetch(UPDATE_URL)` (raw.githubusercontent.com)
- `showOverlay()`'s loading image (only when the setting is on) → `img.src` to the same repo.

Two concerns:
- **CSP / same-origin:** with `@grant none` the page's Content-Security-Policy applies to these requests. If the portal restricts `connect-src`/`img-src` (many do), `fetch` fails silently (caught) and the image is removed — the update check then never works and it's non-obvious. Worth documenting.
- **Supply chain / integrity:** a userscript that silently fetches and renders remote content *and* auto-prompts "Update now" pointing at a repo the author controls is a single-point compromise. If that repo is ever taken over, every user on the domain gets a prompt to install it. **Recommendation:** pin the fetch to a known version (or a commit SHA URL), don't auto-prompt on first load, and consider `@grant GM_xmlhttpRequest` won't help CSP; more importantly, gate the update modal behind a deliberate action rather than auto-modal.

---

### 🟠 MEDIUM

#### M1. `findAnchor()` is a chain of positional assumptions
Strategy 1 climbs to an ancestor with `classList.contains("custom-scrollbar")`, then uses `el.firstElementChild` and `overviewRow.children[1]` as the insertion anchor. If that child index is different, `anchor.inner` is `null`, and `insertBefore(panel, null)` appends the panel to the end — and since it also relies on `margin-left:auto` (a flex rule), a non-flex parent leaves the panel left-aligned. Also, `el` is assigned `parentElement` *before* the check, so the `p` itself ("Total Topics: N") is never considered. This is a synthetic, structure-coupling selector — acceptable, but it should degrade with a **visible fallback position** and should verify the anchor is actually inside the layout it expects.

#### M2. `getModuleId()` — fragile and collision-prone
It grabs `location.href.match(/id=([a-f0-9-]+)/i)`. If the module id is in a query param other than `id`, or is a different format, it falls back to a `pathname` hash (`h*31+charCode`). Two modules whose URLs differ only in a non-`id` param could hash identically. Also, since **state is keyed only by module id** (never by user), a shared/account-switch scenario can leak expansion state — minor, but worth a namespacing note.

#### M3. Upload-tip click handler is removed on navigation and never re-added
```js
document.addEventListener("click", onUploadAreaClick, true);   // added once at bootstrap
onPageTeardown(() => {
  document.removeEventListener("click", onUploadAreaClick, true);
  hideUploadTip();
});
```
On the **first** SPA navigation the teardown removes the handler. Nothing in `init()` or `onUrlChange()` re-registers it. The result: the "Add Attachments → tip" convenience only works before the first route change and is then dead for the rest of the session.

#### M4. `pagehide` empties the teardown arrays — bfcache restore leaks
`pagehide` runs `runTeardowns(navTeardowns)` and `runTeardowns(pageTeardowns)`, and `runTeardowns` clears the arrays (`list.length = 0`). If the tab is put into the **back/forward cache (bfcache)** and then restored, the arrays are empty, so the *next* real navigation (`onUrlChange`) has **nothing to tear down** — observers (settings popover, exams), the upload click listener (see M3), etc. are leaked and continue to run. Prefer not emptying, or re-register on `pageshow`.

#### M5. Last-5 clone: duplicate DOM ids + index-based button forwarding
`buildLast5Card` does `stats.cloneNode(true)` — this duplicates any `id` attributes in the stats card (breaking `getElementById` uniqueness on the page) and adds a second copy of inputs/selects. The forwarded buttons are matched **by array index** (`origBtns[i]`); if the clone's button order differs (after `b.remove()` calls), the indexes misalign and the wrong button is clicked. Fragile.

#### M6. Mutation observers watch the entire `<body>` on every page + `getComputedStyle` in hot paths
- Three separate observers (`Watch`, `watchSettingsPopover`, `startExamsObserver`) all observe `document.body` with `{childList:true, subtree:true}`.
- On the exams page, `applyExams()` (debounced 250ms) re-runs `querySelectorAll` + `getComputedStyle` on **any** body mutation — including the site's own ticking timers/progress updates. It's designed to be a no-op when nothing changed (good, no self-loop), but it's still a recurring layout-forcing cost on a busy page.
- `findContainerFromH6()` calls `getComputedStyle(el)` per ancestor per topic. `getComputedStyle` forces style recalc; in `getContainers()` this is N topics × depth const, invoked on many paths.

**Recommendation:** scope the observers (watch only the module/exams container, not `document.body`), cache computed cursor state per container, and debounce harder on non-target regions.

#### M7. No `@noframes` / `@run-at`
- If the portal renders module content in a nested `<iframe>`, `@match` only covers the top frame and the script won't run there. State clearly whether Brototype single-pages the content.
- `@run-at` isn't specified (defaults to `document-idle`), which is fine, but it's worth being explicit so behavior is documented and not dependent on a default.

#### M8. Overlay z-index vs. upload tip
`showOverlay` uses `z-index:99999`; the upload tip uses `z-index:100000`. During a batch Expand/Collapse (overlay showing), the tip can render above the overlay and its "Collapse all" button, competing with the overlay's `cursor:wait`. Minor UX inconsistency.

---

### 🟡 LOW / NIT

- **N1. Dead code** (all confirmed present but never referenced):
  - `COLORS.surfaceHover`, the whole **danger palette** (`dangerText`, `dangerBg`, `dangerBgHover`, `dangerBorder`, `dangerBorderHover`), `accentText`/`accentBg`, and the entire **dark-mode palette** (`dmBorder`, `dmSegmentBg`, `dmHover`, `dmAccentText`, `dmAccentBg`, `dmSpinner`). The `dm*` comment ("dark mode") is misleading — **there is no dark-mode implementation**; these are unused.
  - `STATUS_COLORS` (defined, unused).
  - `parseExamRow()` (defined, never called — and it's the code that would fix H2).
  - `bootStatusAbsent`? no. (Only the ones above.)
- **N2. Version is defined in 3+ places:** `LOCAL_VERSION`, two `"v1.0.0"` UI strings, and the `@version` header. Drift risk — the updater compares against `LOCAL_VERSION`, which can diverge from what Tampermonkey shows.
- **N3. Inconsistent accent/visual language:** the topic controls use hardcoded `#1976d2` (blue) accent + `color-mix(currentColor)`, while the settings modal active states use `COLORS.actionPrimary` (#111, near-black) and the whole settings/update/overlay UI uses fixed white surfaces (`COLORS.surface = #fff`) regardless of the site's theme. The `dm*` palette is never applied, so a student on dark mode gets a white overlay/modal. Contrast/a11y risk.
- **N4. Repeated `loadSettings()`/`load()`** — small localStorage JSON parse on many paths (per click, per `applyExams`, per overlay). Could cache in-memory and invalidate on save. Micro-perf, but the authors clearly care about perf.
- **N5. "Reset this module" semantics:** it removes the key, then immediately calls `toggleAll(false)`, which **re-saves a fresh all-collapsed state** for that module. So a "Reset" leaves the module persisted (all `false`), not cleared. Harmless but surprising; consider skipping the save on reset.
- **N6. Synthetic-click debounce can drop legitimate re-clicks:** the `!e.isTrusted && now-lastClick<200` guard in `attach()` can swallow a `verifyRepair` re-click that lands within 200ms of a batch click on the same container. The timing margins are probably OK (≥300ms stagger), but it's a silent-loss risk if the site renders more slowly.
- **N7. `window.confirm` for "Reset ALL"** is modal-blocking. Fine, but consider a non-blocking confirm to match the rest of the polished modal UI.
- **N8. Accessibility / semantics:** injected buttons use `<button>` (good), the counter has `aria-live` (good). The settings modal is focused into the DOM but doesn't trap focus and there's no `role="dialog"`/`aria-modal` on the update/settings backdrops — screen-reader users can tab into the page behind the modal.

---

## What's done well (worth keeping)

- **Modular, decoupled design**: CORE (config/bus/lock/overlay/DOM/state) → FEATURES → RUNTIME, all wired through the bus. One feature can't ripple sideways. Genuinely good.
- **Graceful degradation everywhere**: every `localStorage` read/write is wrapped in try/catch; overlay auto-hides after 30s; the loading image self-removes on `load` error; feature no-ops (never breaks the host page).
- **Throttling-aware batch timing**: the `Date.now()`-based stagger (`i*300 - (Date.now()-batchStart)`) correctly accounts for background-tab timer coalescing instead of naive `setTimeout(i*300)`. Same pattern in `restore()`.
- **Deterministic save ownership**: `Lock.busy` muting per-click writes during batch/restore avoids recording pre-hydration state — a genuinely subtle and correct synchronization design.
- **Re-render-resilient DOM re-resolution** via `liveContainer()` (re-find by title) and `usedFallback` heuristics — good defensive thinking (even though the *observer* that feeds it has H1).
- **Security hygiene** (given `@grant none`): all user/live text is set via `textContent`, never `innerHTML`; no `eval`; the only remote content is the two hardcoded author URLs. Low XSS surface.
- **Self-update version comparison** with a skip-version session flag — sensible.

---

## Recommended priority order

1. **Fix H1** (re-render survival) — rework the `Watch` guard to key off unbound containers, not "controls+topics exist".
2. **Fix H2** (last-5 ordering) — wire up `parseExamRow()` and sort by date.
3. **Address H3** (topic-title state keys) — switch to a stable per-topic key.
4. **Harden H4** (remote fetch) — pin to a SHA/known version and don't auto-open the update modal on first load.
5. **Fix M3 + M4** (upload-tip re-add, bfcache teardown leak).
6. **Trim dead code** (N1) and unify version + accent constants (N2, N3).

If you'd like, I can produce a **minimal-diff patch file** (or a full revised `@version 1.0.1`) that applies fixes #1–#5 while preserving your architecture — just say the word.
