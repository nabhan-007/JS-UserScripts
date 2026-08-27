# MNM Portal Companion for Brototype

A userscript that enhances the [Brototype student portal](https://student.brototype.com) with persistent topic state memory, exam stats overlays, and a settings panel.

**Install**: [GreasyFork](#) · **Version**: 1.0.0 · **License**: MIT

---

## Features

### Module Pages (`/tasks/module/details?id=...`)
- **Topic state memory** — expand/collapse state survives page reloads, SPA navigation, and React re-renders
- **Expand All / Collapse All** — batch toggle with translucent overlay + live counter
- **Auto-scroll** — returns to the last expanded topic on reload
- **Read-more auto-expand** — opens collapsed "Read more" links after Expand All
- **Upload tip toast** — warns when auto-scroll won't work (>1 topic open) with a one-tap "Collapse all" button
- **Loading overlay** — animated image (aniya nil) or CSS spinner, toggleable in settings

### Exams Page (`/exams?id=...`)
- **Normal mode** — unmodified portal stats
- **Delusion mode** — rewrites pass rate to 100%, zeroes failed/absent tiles
- **Last 5 exams** — deep-clones the stats card with recomputed numbers over the 5 most recent exams; green/red outline at 50% threshold

### Settings (profile popover → MNM Script Settings)
- **aniya nill** toggle — image vs spinner on loading overlays
- **Exam stats** segmented control — Delusion / Normal / Last 5 exams
- **Reset this module** — clears expand/collapse state for the current module
- **Reset ALL modules** — wipes every saved topic state (with confirmation)
- **Contact us** — opens a Gmail compose window

---

## File Structure

```
Brototype-Student-Portal/
├── build.js                 # Concatenation build script
├── header.txt               # UserScript metadata block + IIFE opening
├── footer.txt               # IIFE closing
├── modules/
│   ├── core.js              # Config, event bus, lock, overlay, DOM finder, state store
│   ├── settings.js          # Settings modal, toggles, segmented control, resets
│   ├── module-page.js       # Batch controls, state memory, read-more, auto-scroll, toast
│   ├── exams.js             # Delusion mode, last-5 card, stats observer
│   └── runtime.js           # Teardown registry, DOM watch, SPA hooks, init
├── script.user.js           # Built output (install this)
├── assets/
│   └── aniya-nil.png        # Loading overlay image
├── design/
│   ├── modal-mocks.html     # Settings modal design mockups
│   ├── modal-mocks-minimal.html
│   └── toast-mocks-minimal.html
└── Archive/                 # Previous versions
```

### Module Responsibilities

| Module | Lines | Depends on | Provides |
|--------|-------|------------|----------|
| `core.js` | ~286 | nothing | `bus`, `Lock`, `loadSettings`, `saveSettings`, `isModulePage`, `isExamsPage`, `showOverlay`, `hideOverlay`, `getContainers`, `isExpanded`, `getTitle`, `load`, `save`, `moduleKey`, `lastKey` |
| `settings.js` | ~388 | core | `ensureBrotStyles`, `openSettingsModal`, `closeSettingsModal`, `watchSettingsPopover`, `destroySettingsWatcher` |
| `module-page.js` | ~633 | core, settings | `toggleAll`, `updateCounter`, `attach`, `restore`, `addControls`, `initReadMore`, `initAutoScroll`, `initUploadTip` |
| `exams.js` | ~271 | core | `startExams`, `stopExams`, `applyExams` |
| `runtime.js` | ~202 | all above | `init`, `onUrlChange`, `Watch`, teardown registry, SPA hooks, kickoff |

### Build Order

```
core → settings → module-page → exams → runtime
```

Settings loads before module-page because `ensureBrotStyles()` (defined in settings) is called by the upload-tip code in module-page at runtime.

---

## Development

### Prerequisites
- [Node.js](https://nodejs.org/) (any recent version)
- A userscript manager ([Violentmonkey](https://violentmonkey.github.io/) or [Tampermonkey](https://www.tampermonkey.net/))

### Build

```bash
node build.js
```

This concatenates `header.txt` + all modules (in build order) + `footer.txt` into `script.user.js`.

### Edit a Feature

1. Open the relevant module file in `modules/`
2. Make your changes
3. Run `node build.js`
4. Reload the Brototype portal page — the userscript manager picks up file changes automatically

### Disable a Feature

1. Delete or rename the module file (e.g., rename `exams.js` to `exams.js.bak`)
2. Remove it from the `modules` array in `build.js`
3. Rebuild: `node build.js`

### Add a New Feature

1. Create a new file in `modules/` (e.g., `new-feature.js`)
2. Add it to the `modules` array in `build.js`
3. Rebuild: `node build.js`

---

## Architecture

The script runs as a single IIFE inside the userscript manager's sandbox (with `@grant none`, so it shares the page's JS context). All modules share the same function scope — there are no imports/exports, just concatenated files.

### Communication Pattern

Modules communicate through an **event bus** (`bus`), not by calling each other's functions directly:

```
bus.on("batch:expanded", () => { ... });   // listen
bus.emit("restore:settled");                // broadcast
```

Events:
| Event | Emitter | Listeners |
|-------|---------|-----------|
| `batch:expanded` | module-page | module-page (read-more) |
| `restore:done` | module-page | — |
| `restore:settled` | module-page | module-page (auto-scroll) |
| `upload:area-click` | module-page | module-page (toast) |
| `settings:changed` | settings | exams |

### SPA Awareness

The script hooks `history.pushState`, `history.replaceState`, and `popstate` to detect client-side navigation. On URL change:
1. Run teardown functions (disconnect observers, clear timeouts)
2. If entering a module page → wait for DOM → `init()`
3. If entering the exams page → `startExams()`
4. If leaving both → stay idle

A `MutationObserver` (`Watch`) survives React re-renders and re-initializes controls if the DOM is replaced.

---

## Testing

The script has been verified with Playwright automated tests on both Chrome and Firefox:

- Module pages: expand/collapse/restore/counter/read-more/overlay/re-render
- Exams page: Normal/Delusion/Last5 modes, clone card, SPA navigation
- Settings modal: toggles, segmented control, resets, Contact us
- Toast behavior, module isolation, console error checks

See the test logs in the project conversation history for full results.

---

## Previous Versions

Older builds are in `Archive/`. The current modular architecture (v1.0.0) replaced the monolithic single-file approach used in v5.2.x.
