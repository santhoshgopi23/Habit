# Foundation — Personal Growth System Tracker

A private, mobile-first goal tracker. You add simple, daily-trackable **Goals** (e.g. "Exercise daily for 30 minutes", "No junk food", "Read 20 pages"). Each day you mark every goal green (done) or red (not done), and the app rolls that up into a consistency percentage per goal and for your whole system.

## How it works

- **Today page** — your overall Consistency Rate, Current Streak, and Best Streak sit at the top. Below that, every goal appears in a single flat list with its own streak and consistency %.
- **Add** (the `+` button) — creates a new Goal with a name, icon, color, and optional notes.
- **Tap a goal's status circle** to mark it done (green) or not done (red) for today. Tap the goal's name to see its full streak history, charts, and details.
- **Progress page** — a 7-day completion chart and every goal's current streak, across your whole system.
- **Goals page** — an overview of all your goals with an all-time completions breakdown.

## What's in this folder

```
index.html              → the app itself
assets/css/style.css    → all styling
assets/js/app.js        → all app logic
assets/icons/           → app icons (72–512px) + apple touch icon
manifest.json           → PWA manifest (lets you "Add to Home Screen")
favicon.svg / .png      → browser tab icon
```

## How to use it

**Quickest:** just double-click `index.html` to open it in your browser. It works fully offline after the first load (only the Google Fonts stylesheet needs internet — everything else runs locally).

**To host it** (so you can open it from your phone anywhere):
1. Upload this whole folder to any static host — GitHub Pages, Netlify, Vercel, or even a plain web server.
2. Keep the folder structure exactly as-is (`index.html` at the root, `assets/` beside it).

**To install it like an app on your phone:**
1. Open the hosted site in Chrome (Android) or Safari (iPhone).
2. Tap the browser menu → "Add to Home Screen".
3. It'll open full-screen, no address bar, with its own icon.

## Your data

All goals and settings are stored only on this device, in this browser's local storage — there's no server, no account, no tracking. That means:
- Data is tied to **this specific browser** on **this specific device**. Opening the site in a different browser (or a private/incognito window) starts fresh.
- Clearing your browser's site data/cookies for this page will erase it.
- Use **More → Export backup** regularly to save a `.json` copy, and **Import backup** to restore it — this is also how you move your data to another device or browser.

If you're upgrading from an earlier version of Foundation that had Main Goals and Sub-Goals, your existing data is automatically flattened into simple Goals the first time you open the app — nothing is lost.

If you open `index.html` straight from your file system in a browser that restricts local storage on `file://` pages, saving may not work — in that case, host the folder (see above) and use the hosted URL instead.
