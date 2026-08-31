# TODO

## Features to Implement

### 1. Copy Button for Current & Previous Pending
- [ ] Add copy button for current and previous pending tasks

### 2. Next Exam Countdown Chip
- [ ] Show countdown near FAQ, notifications, and Profile chip (visible on most pages)
- [ ] Cache exam date when user visits exams page
- [ ] If data unavailable, show a button, clicking that button will put up the spinner so, user doesn't interrupt, then will go to exams section, scrape data and come back to page from where the button was clicked.

### 3. Esc = Collapse All → Refresh
- [ ] Esc should collapse all topics first, then refresh the page
- [ ] Should fix most script-related bugs by resetting state

### 4. Requests Default to Pending
- [ ] `/requests` page: Filter tab auto-selects "Pending" instead of "All"
- [ ] Most relevant view for users

### 5. A button to add description to all topics
- [ ] Need to discuss on how to achieve this. I am thinking of asking for their GEMINI API key which gives a generous free tier. Or an option to add their custom ones. Need to discuss. On chrome I heard the chrome downloads a model to the browser, don't know much about it, needs research.
- [ ] The descriptions should be over 67 words.
- [ ] Clear prompts for the ai are to be crafted to gain consistency and acceptable format of response.
- [ ] First we will show all the descriptions the ai created. They will have an option to retry button that sends the description to the ai and says needs improvement and the user didn't like it. Another button is remove which when clicked will remove the description for that topic. And finally when there are only descriptions the user has agreed we will upload/add them. The process is: Click `Add attachments` -> Click `Text` -> Add title and description -> submit. Will show the spinner so, the user don't mess it up.
- [ ] We will clearly show that the description as ai generated and it might make mistakes.
- [ ] will discuss thoroughly before implementing.

### 6. Disclaimer
- [ ] Discuss the need to add: user take full responsibility for running the script and the makers are not liable for anything. An agree button to show at the fresh install of the script. We will say that the script is thoroughly tested but, vibe-coded. Not exact words. Need to be more professional.
- [ ] will discuss thoroughly before implementing.
