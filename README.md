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

## Keyboard shortcuts (work from any app)

| Shortcut | Action |
| --- | --- |
| `Ctrl+Alt+N` | New text note |
| `Ctrl+Alt+R` | Start recording / stop and save |
| `Ctrl+Alt+T` | Today's to-do list |
| `Ctrl+Alt+L` | Notes & recordings |
| `Ctrl+Alt+Space` | Show / hide the widget |

Shortcuts can be turned off from the tray menu (**Keyboard Shortcuts**). If another app already
uses one of them, QuickCapture skips it and shows a notification.

**Start with Windows** (tray menu) launches QuickCapture hidden in the tray when you sign in.
When running from source, it starts the production build, so run `npm run build` first.

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

## Build the Windows installer

```bash
npm run dist
```

Creates, in `release/`:

- `QuickCapture-Setup-<version>.exe`: installer (Start menu + desktop shortcuts, uninstaller,
  shows the licence in `build/license.txt`). Installs per user, no admin rights needed.
- `QuickCapture-Portable-<version>.exe`: runs without installing.

Copy either file to another Windows PC; nothing else (Node, npm, Visual Studio) is needed there.
User data lives in `%APPDATA%\QuickCapture` and is kept when uninstalling.

The installers are not code-signed yet, so Windows SmartScreen shows "Windows protected your PC"
on other machines (click **More info -> Run anyway**). Signing removes that warning.

- Version: `version` in `package.json`. Publisher: `author` / `build.copyright`.
- Icons: edit the design in `scripts/generate-icons.cjs`, then run `npm run icons`.
- `npm run dist:dir` builds an unpacked app in `release/win-unpacked` (quicker, for testing).
