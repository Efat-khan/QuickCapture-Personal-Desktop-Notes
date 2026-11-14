# QuickCapture — Personal Desktop Notes

Local-first desktop note capture app built with **Electron + React + SQLite**.

## Implemented MVP (v1.1 aligned)

- Floating always-on-top compact pill widget (draggable via frameless window)
- Quick capture popup with actions for:
  - Text note
  - Voice recording
  - Dashboard
- Text note capture with title/content + timestamped local persistence
- Voice recording flow (start, pause, resume, stop, save) using MediaRecorder
- SQLite storage for note metadata (`text` and `audio` notes)
- Local audio file saving under app user-data directory
- Date-wise dashboard timeline with search and note type filters
- System tray integration for fast actions and restore/hide behavior
- Secure Electron settings:
  - `contextIsolation: true`
  - `nodeIntegration: false`
  - IPC bridge through preload only

## Tech Stack

- Electron
- React + Vite
- SQLite (`better-sqlite3`)
- Lucide React icons

## Run

```bash
npm install
npm run dev
```

## Build renderer

```bash
npm run build
```
