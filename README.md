# job tracker

**Live Site:** [https://job-tracker-neo.vercel.app/](https://job-tracker-neo.vercel.app/)

A minimalistic job application tracker.

## Features

- **Track Jobs by Status** - Saved, In Progress, Applied, Interview, Rejected.
- **Bulk Actions** - Select multiple jobs to move them to a new status or delete them.
- **Chrome Extension** - Instantly save jobs directly from LinkedIn, Greenhouse, Lever, Workday, and more.
- **Visual Board** - Drag-and-drop sticky notes and polaroid images directly onto your workspace.
- **Search & Filter** - Instantly filter jobs by title, company, or location.
- **CSV Import** - Bulk import jobs from a CSV file.

## 🧩 Installing the Chrome Extension
The included Chrome extension lets you click one button on any job board to automatically extract the Title, Company, and Location, and instantly save it to your Job Tracker.

1. Open Chrome and go to `chrome://extensions`
2. Turn on **Developer mode** (toggle in the top right corner)
3. Click **Load unpacked**
4. Select the `chrome-extension` folder located inside this project directory
5. _Optional:_ Pin the extension to your toolbar for easy access!

## Tech Stack
- **React** + **Vite**
- **Vanilla CSS** with modern frosted-glass UI
- **localStorage** for data persistence

## Local Development

```bash
# Install dependencies
npm install

# Start dev server
npm run dev
```

## Data Storage
All data (jobs, notes, images) is stored in your browser's localStorage. There's no login or database for now, your data stays on your device.