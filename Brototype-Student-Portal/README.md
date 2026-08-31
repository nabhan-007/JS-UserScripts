# MNM Portal Companion for Brototype

A userscript that makes the [Brototype student portal](https://student.brototype.com) easier to use. It remembers which topics you've opened, adds expand/collapse all buttons, and gives you some exam stats tricks.

**Version**: 1.0.0 · **License**: MIT

---

## What It Does

### On Module Pages
- **Remembers your topics** — what you expanded or collapsed stays that way, even after you reload or navigate away
- **Expand All / Collapse All** — two buttons with a counter showing how many are open
- **Scrolls to your last topic** — when you come back, it takes you right there
- **Opens "Read more" links** — after Expand All, it clicks every "Read more" so you see full content
- **Upload helper** — shows a tip when you attach files, so auto-scroll works on your next visit
- **Loading overlay** — shows during batch operations and restore (art image or spinner, toggled in settings)

### On the Exams Page
- **Normal mode** — shows your real stats
- **Delusion mode** — makes it look like you passed everything (100% pass rate)
- **Last 5 exams** — shows a separate card with stats from only your 5 most recent exams

### On the Requests Page
- **Auto-selects Pending** — opens on the Pending tab instead of All, since that's what you check most

### Everywhere
- **Update checker** — quietly checks for newer versions and shows a small popup when one is available
- **Esc key** — closes the settings modal

### Settings (click your profile → MNM Script Settings)
- **Loading image** toggle — choose between an art image or a spinner
- **Exam stats** — pick Normal, Delusion, or Last 5 exams
- **Reset this module** — forget the saved state for the current page
- **Reset ALL modules** — forget everything (asks for confirmation)
- **Contact us** — opens a pre-filled email

---

## How It's Built

The script is one file (`script.user.js`) built from 5 smaller files:

```
core.js         → Config, colors, event bus, overlay, DOM helpers, state save/load
settings.js     → Settings popup, toggles, reset buttons
module-page.js  → Expand/collapse buttons, topic memory, read-more, auto-scroll, upload tip
exams.js        → Delusion mode, last-5 card
runtime.js      → Page detection, SPA navigation hooks, startup
```

### Build

```bash
node build.js
```

This joins all files into `script.user.js`. Then copy-paste it into your userscript manager (Violentmonkey or Tampermonkey).

### Edit a Feature

1. Open the relevant file in `modules/`
2. Make changes
3. Run `node build.js`
4. Reload the portal page — the userscript picks up changes automatically

### Add a New Feature

1. Create a new file in `modules/`
2. Add it to the `modules` array in `build.js`
3. Rebuild: `node build.js`

---

## How It Works

The script runs alongside the Brototype website without modifying it. It:

- **Watches for page changes** — a MutationObserver detects when React updates the page, so the script re-initializes when needed
- **Hooks into navigation** — catches browser back/forward and in-app navigation to clean up and restart
- **Uses an event bus** — modules talk to each other through events instead of calling each other directly
- **Safe across navigation** — if you leave a page mid-operation, the script cleanly stops instead of breaking anything

---

## Browser Support

Works on any browser with a userscript manager:
- Chrome / Edge / Brave (Violentmonkey or Tampermonkey)
- Firefox (Violentmonkey or Tampermonkey)

No special permissions needed (`@grant none`).
