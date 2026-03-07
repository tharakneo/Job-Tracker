# Job Tracker

A minimalistic job application tracker.

## Features

- **Track Jobs by Status** - Saved, In Progress, Applied, Interview, Rejected
- **Auto-fetch Job Details** - Paste a job URL and it pulls the title, company, and location
- **CSV Import** - Bulk import jobs from a CSV file
- **Sticky Notes** - Draggable notes with customizable frosted-glass colors
- **Polaroid Images** - Drag-and-drop photo frames on your board
- **Search** - Filter jobs by title, company, or location

## Tech Stack

- **React** + **Vite**
- **Vanilla CSS** with CSS variables
- **localStorage** for data persistence (no backend required)

## Getting Started

```bash
# Install dependencies
npm install

# Start dev server
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

## Build for Production

```bash
npm run build
```

The output will be in the `dist/` folder, ready to deploy to Vercel, Netlify, or any static host.

## Data Storage

All data (jobs, notes, images) is stored in your browser's `localStorage`. There's no login or database for now, your data stays on your device.
