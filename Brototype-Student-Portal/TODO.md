# TODO

## Features to Implement

### 1. Copy Pendings Button
- [ ] Add a copy-to-clipboard button next to the "Previous Pendings" and "Current Pendings" buttons in the exam detail panel
- [ ] Scrapes the pending text block (task categories, topics, remarks) and copies it to clipboard
- [ ] Useful for sharing pending topics in study groups or saving locally

### 2. Next Exam Countdown Chip
- [ ] Inject a countdown chip to the left of the FAQ button in the top banner (visible on most pages)
- [ ] Shows days/hours until next upcoming exam
- [ ] Cache exam date in localStorage when user visits exams page
- [ ] If no cached data, show a "Scan" button — clicking it shows a spinner, navigates to exams page, scrapes upcoming exam date, then navigates back

### 3. Esc = Collapse All → Refresh
- [ ] On every page: Esc first collapses all expanded topics, then refreshes the page
- [ ] Acts as a quick reset for any script-related glitch

### 4. Requests Default to Pending
- [ ] On `/requests` page, auto-select the "Pending" filter tab instead of "All"
- [ ] Pending is the most common view — saves a click every visit

### 5. AI Description Generator
- [ ] Add a button to auto-generate topic descriptions using AI (e.g., Gemini API — generous free tier, or user-supplied custom key)
- [ ] Research: Chrome may be able to run a local model in-browser — needs investigation
- [ ] Each description must be 67+ words
- [ ] Craft clear prompts to get consistent, well-formatted output
- [ ] **Review flow**: Show all AI-generated descriptions first. Per topic: Retry (regenerate), Remove (discard), or Accept. Once only accepted descriptions remain, batch-upload them via Add attachments → Text → title + description → submit (with spinner to prevent interruption)
- [ ] Always label descriptions as "AI-generated" with a disclaimer about potential errors
- [ ] Needs thorough discussion before implementation

### 6. Disclaimer on First Install
- [ ] Show an agreement modal on fresh script install
- [ ] States the user assumes full responsibility for running the script; makers are not liable
- [ ] Professional tone: script is thoroughly tested but community-built
- [ ] Needs thorough discussion before implementation
