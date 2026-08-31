# TODO

## Features to Implement

### 1. ~~Requests Default to Pending~~ ✅
- [x] On `/requests` page, auto-select the "Pending" filter tab instead of "All"
- [x] Pending is the most common view — saves a click every visit

### 2. ~~Esc = Collapse All → Refresh~~ ✅
- [x] On every page: Esc refreshes the page
- [x] On module pages: sets all topic states to collapsed before refreshing
- [x] Settings modal closes via Done button or backdrop click only

### 3. Copy Pendings Button
- [ ] Add a copy-to-clipboard button next to the "Previous Pendings" and "Current Pendings" buttons in the exam detail panel
- [ ] Scrapes the pending text block (task categories, topics, remarks) and copies it to clipboard
- [ ] Useful for sharing pending topics in study groups or saving locally

### 4. Disclaimer on First Install
- [ ] Show an agreement modal on fresh script install
- [ ] States the user assumes full responsibility for running the script; makers are not liable
- [ ] Professional tone: script is thoroughly tested but community-built
- [ ] Needs thorough discussion before implementation

### 5. Next Exam Countdown Chip
- [ ] Inject a countdown chip to the left of the FAQ button in the top banner (visible on most pages)
- [ ] Shows days/hours until next upcoming exam
- [ ] Cache exam date in localStorage when user visits exams page
- [ ] If no cached data, show a "Scan" button — clicking it shows a spinner, navigates to exams page, scrapes upcoming exam date, then navigates back

### 6. AI Description Generator
- [ ] Add a button to auto-generate topic descriptions using AI (e.g., Gemini API — generous free tier, or user-supplied custom key)
- [ ] Research: Chrome may be able to run a local model in-browser — needs investigation
- [ ] Each description must be 67+ words
- [ ] Craft clear prompts to get consistent, well-formatted output
- [ ] **Review flow**: Show all AI-generated descriptions first. Per topic: Retry (regenerate), Remove (discard), or Accept. Once only accepted descriptions remain, batch-upload them via Add attachments → Text → title + description → submit (with spinner to prevent interruption)
- [ ] Always label descriptions as "AI-generated" with a disclaimer about potential errors
- [ ] Needs thorough discussion before implementation
