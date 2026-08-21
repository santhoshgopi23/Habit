# Foundation — Personal Growth System Tracker

A private, mobile-first system tracker. Instead of tracking one flat list of habits, you build **Main Goals** (e.g. "Get Fit", "Save Money") and break each one into independently-trackable **Sub-Goals** (e.g. "Exercise daily for 30 minutes", "No junk food", "No sugar"). Each day you mark every sub-goal green (done) or red (not done), and the app rolls that up into a consistency percentage per goal and for your whole system.

## How it works

- **Today page** — your overall Consistency Rate, Current Streak, and Best Streak sit at the top. Below that, each Main Goal appears as its own expandable section showing its sub-goals and its own consistency %.
- **Add** (the `+` button) — choose "New Main Goal" or "New Sub-Goal". You can also tap the small `+` on any goal's header to add a sub-goal straight into that goal.
- **Tap a sub-goal's status circle** to mark it done (green) or not done (red) for today. Tap the sub-goal's name to see its streak history and details.
- **Progress page** — a 7-day completion chart and every sub-goal's current streak, across your whole system.
- **Goals page** — an overview of all Main Goals with an all-time completions breakdown.

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

All habits and settings are stored only on the device you use — there's no server, no account, no tracking. Use **More → Export backup** to save a `.json` copy, and **Import backup** to restore it on another device.
