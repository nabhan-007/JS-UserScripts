# TEST-CHECKLIST

Run through every item before each release. Check only what you verified.

---

## Module Page

### Expand / Collapse All
- [ ] Expand All from fully collapsed → all topics open, counter shows N/N
- [ ] Collapse All from fully expanded → all topics closed, counter shows 0/N
- [ ] Expand All when already fully expanded → Read More buttons get clicked
- [ ] Collapse All when already fully collapsed → no errors, no overlay
- [ ] Expand All from mixed state (some open, some closed) → only closed ones open
- [ ] Staggered — topics open one by one with delay, not all at once
- [ ] Overlay visible during batch, disappears after finish

### Counter
- [ ] Counter shows 0/N on fresh load (all collapsed)
- [ ] Counter updates live when expanding/collapsing individual topics
- [ ] Counter matches actual expanded count after Expand All
- [ ] Counter matches actual expanded count after Collapse All
- [ ] Counter persists correct value after page reload

### State Memory
- [ ] Expand a topic → reload → still expanded
- [ ] Collapse a topic → reload → still collapsed
- [ ] Mixed state persists across reload
- [ ] State saved per-module (different modules have independent state)

### Auto-Scroll
- [ ] Expand a topic, collapse it, expand a different one → reload → scrolls to the last expanded topic
- [ ] When all or none expanded → no scroll happens
- [ ] Scroll works on both DOM styles (content as child vs. next sibling)

### Read More
- [ ] Topic with truncated content → "Read more" link visible
- [ ] Click Read More → content expands
- [ ] Expand All → Read More auto-clicked on all expanded topics
- [ ] Expand All when already expanded → Read More still triggered (bug #5 fix)

### Controls Position & Design
- [ ] Controls appear in Task Overview (next to "Total Topics: N"), not in the banner
- [ ] Counter shows correct count on first load (not 0/0 when topics exist)
- [ ] Button divider line visible between Expand and Collapse
- [ ] Buttons react to hover (subtle background tint)
- [ ] Focus ring visible on keyboard navigation, hidden on mouse click

### Upload Tip Toast
- [ ] Open 2+ topics, click "Add Attachments" → toast appears at top
- [ ] Toast auto-dismisses after ~10s
- [ ] Toast close button (×) works
- [ ] "Collapse all" button closes site dialog first, then collapses all topics
- [ ] Toast slides in with animation
- [ ] Upload tip handler re-registered after SPA navigation (not lost on nav)

### Keyboard
- [ ] Esc closes settings modal (if open)
- [ ] Esc does NOT trigger collapse when settings modal is open

---

## Exams Page

### Delusion Mode
- [ ] Enable "Delusion" in settings → go to exams page
- [ ] "Pass Rate" shows 100%, "Fail Rate" shows 0%
- [ ] Failed/Absent tiles show "0 Exams"
- [ ] Green bar fills 100%, red bar fills 0%
- [ ] Switch to "Normal" → original stats restored
- [ ] Switch to "Last 5" → last-5 card appears

### Last 5 Mode
- [ ] Card shows 5 most recent exams with correct pass/fail/absent counts
- [ ] Card recomputes stats (not copy of main card)
- [ ] Green outline if pass rate >= 50%, red if below
- [ ] Card removed when switching to Normal mode

### Normal Mode
- [ ] All original stats shown, no modifications

---

## Settings

### Modal
- [ ] Opens from profile popover → "MNM Script Settings" row
- [ ] "aniya nill" toggle switches between image and spinner overlay
- [ ] Exam stats segmented control (Delusion / Normal / Last 5) saves to localStorage
- [ ] "Reset this module" → removes current module's state
- [ ] "Reset ALL modules" → confirm dialog → removes all `brot_topic*` keys
- [ ] "Contact us" → opens Gmail compose
- [ ] Done button closes modal
- [ ] Esc key closes modal
- [ ] Clicking backdrop closes modal

### Profile Injection
- [ ] Settings row appears in profile popover
- [ ] Gear icon visible
- [ ] Row does NOT duplicate on re-renders

---

## SPA Navigation

- [ ] Module → Exams → Dashboard → back to Module → controls still work
- [ ] Exams page → Module page → topics expand/collapse
- [ ] No console errors during navigation
- [ ] Overlay hidden after navigation
- [ ] Teardown runs on page leave (no stale listeners)
- [ ] No duplicate controls after SPA re-render
- [ ] Upload tip click handler re-registered on re-init (not duplicated)

---

## Console Errors

- [ ] Dashboard — 0 errors
- [ ] Module page — 0 errors
- [ ] Exams page — 0 errors
- [ ] Sessions page — 0 errors
- [ ] Daily Tasks page — 0 errors
- [ ] Requests page — 0 errors
- [ ] Settings modal open/close — 0 errors
- [ ] Expand All + Collapse All cycle — 0 errors

---

## Edge Cases

- [ ] Window loses focus during Expand All → topics still expand (bug #6)
- [ ] Rapid double-click on Expand/Collapse → no duplicates, no errors
- [ ] Module with 0 topics → no controls injected, no errors
- [ ] Module with 1 topic → counter shows 0/1, expand/collapse works
- [ ] Module with 10+ topics → staggered timing correct, no race conditions
- [ ] React re-renders during batch → verify-and-repair handles duplicates
- [ ] localStorage disabled/ quota exceeded → graceful fallback, no crash
- [ ] First install (no localStorage data) → defaults applied, no errors
- [ ] Cross-module navigation during Expand All → batch aborts, no state corruption (P0 fix)
- [ ] Cross-module navigation during Restore → restore aborts cleanly (P0 fix)
- [ ] Lock stuck (error during restore) → try/finally ensures unlock, no permanent overlay (P0 fix)
- [ ] bfcache restore (back/forward cache) → pageshow re-runs init, script works (P2 fix)
- [ ] Watch observer re-attaches after React re-renders — check `data-brotListener` markers (P1 fix)
- [ ] getModuleId uses URLSearchParams — `?userid=abc&id=xyz` returns correct ID, not `abc` (P1 fix)
- [ ] 9-topic module — state restore correct, not inverted (outermost cursor:pointer fix)

---

## Documentation

- [ ] README matches current features — no missing or outdated items

---

## Requests Page

### Pending Auto-Select
- [ ] Navigate to `/requests` → Pending tab is auto-selected (white text, other tabs gray)
- [ ] SPA navigate away and back → Pending re-selected
- [ ] Full page reload → Pending still auto-selected
