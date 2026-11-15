const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  Tray,
  Menu,
  nativeImage,
  protocol,
  net,
  screen,
  session,
  shell,
} = require('electron');
const { runMigrations } = require('./database/migrations.cjs');
const { closeDb } = require('./database/connection.cjs');
const notes = require('./database/noteRepository.cjs');
const todos = require('./database/todoRepository.cjs');
const audio = require('./services/audioService.cjs');
const { getSetting, setSetting } = require('./services/settings.cjs');
const { isLaunchAtLoginEnabled, setLaunchAtLogin } = require('./services/startup.cjs');

const DEV_SERVER_URL = 'http://localhost:5173';
const isDev = process.argv.includes('--dev');
// Set when Windows starts the app at login: stay in the tray until the user needs it.
let startHidden = process.argv.includes('--hidden');
const AUDIO_SCHEME = 'qc-audio';
// Must match "appId" in package.json: Windows uses it for notifications and taskbar pinning.
const APP_USER_MODEL_ID = 'com.efatkhan.quickcapture';
const ASSETS_DIR = path.join(__dirname, 'assets');

const MAX_TITLE_LENGTH = 200;
const MAX_CONTENT_LENGTH = 1_000_000;
const MAX_SEARCH_LENGTH = 200;
const MAX_AUDIO_BYTES = 512 * 1024 * 1024;
const MAX_TODO_LENGTH = 500;
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const windowModes = {
  pill: { width: 232, height: 44, resizable: false, alwaysOnTop: true },
  todo: { width: 420, height: 560, resizable: false, alwaysOnTop: true },
  popup: { width: 460, height: 300, resizable: false, alwaysOnTop: true },
  editor: { width: 520, height: 420, resizable: false, alwaysOnTop: true },
  voice: { width: 520, height: 420, resizable: false, alwaysOnTop: true },
  library: { width: 460, height: 560, resizable: false, alwaysOnTop: true },
  // The dashboard is a normal window: pinning a 1080x760 window above everything else gets in the way.
  dashboard: { width: 1080, height: 760, resizable: true, alwaysOnTop: false },
};

// Must run before the app is ready. Serves recordings to the renderer (file:// is blocked from the dev server origin).
protocol.registerSchemesAsPrivileged([
  { scheme: AUDIO_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

let mainWindow = null;
let tray = null;
let isQuitting = false;
let currentMode = 'pill';
let compactPosition = null; // where the user put the widget; every compact window opens from here
let applyingBounds = false; // true while the app itself moves/resizes the window
let saveStateTimer = null;

// System-wide shortcuts. Ctrl+Alt combinations avoid clashing with everyday app shortcuts
// such as Ctrl+Shift+N/T/R in browsers and editors.
const SHORTCUTS = [
  { action: 'open-text', accelerator: 'CommandOrControl+Alt+N', label: 'New Text Note' },
  { action: 'toggle-recording', accelerator: 'CommandOrControl+Alt+R', label: 'Start / Stop Recording', focus: false },
  { action: 'open-todo', accelerator: 'CommandOrControl+Alt+T', label: "Today's To-do List" },
  { action: 'open-library', accelerator: 'CommandOrControl+Alt+L', label: 'Notes & Recordings' },
  { action: 'toggle-widget', accelerator: 'CommandOrControl+Alt+Space', label: 'Show / Hide Widget' },
];
let failedShortcuts = [];

// The widget bar is only 44px tall, so to show a message *under* it the (transparent) window is
// briefly made taller. If there is no room below, it grows upwards and the message goes above.
const PILL_TOAST_SPACE = 44;
let pillToast = null; // { placement: 'below' | 'above' } while the widget window is enlarged

/* ---------- window state ---------- */

function getStateFilePath() {
  return path.join(app.getPath('userData'), 'window-state.json');
}

function isPositionOnScreen(x, y) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  return screen.getAllDisplays().some(({ workArea: a }) => x >= a.x && y >= a.y && x < a.x + a.width - 40 && y < a.y + a.height - 20);
}

function readWindowState() {
  try {
    const { x, y } = JSON.parse(fs.readFileSync(getStateFilePath(), 'utf8'));
    // A saved position on a monitor that is no longer connected would put the widget off-screen.
    return isPositionOnScreen(x, y) ? { x, y } : {};
  } catch {
    return {};
  }
}

function writeWindowState() {
  clearTimeout(saveStateTimer);
  saveStateTimer = null;
  if (!compactPosition) return;
  try {
    fs.writeFileSync(getStateFilePath(), JSON.stringify(compactPosition));
  } catch (error) {
    console.error('Failed to save window state', error);
  }
}

function rememberCompactPosition() {
  // Only the user dragging the window counts. Moves made by the app (e.g. nudging the editor up so
  // it fits on screen) must not change where the widget goes back to.
  if (applyingBounds || !mainWindow || mainWindow.isDestroyed() || currentMode === 'dashboard') return;
  const [x, y] = mainWindow.getPosition();
  // While enlarged upwards for a message, the bar sits PILL_TOAST_SPACE below the window's top.
  compactPosition = { x, y: y + (pillToast?.placement === 'above' ? PILL_TOAST_SPACE : 0) };
  // 'move' fires continuously while dragging; write once the window settles.
  clearTimeout(saveStateTimer);
  saveStateTimer = setTimeout(writeWindowState, 500);
}

/* ---------- window modes ---------- */

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

/** Enlarges (show=true) or restores (show=false) the widget window around a message. */
/** Moves/resizes the window without it counting as a user move. */
function applyBounds(bounds) {
  applyingBounds = true;
  try {
    // Windows resizes non-resizable windows fine, and toggling resizable there adds rounding
    // errors at fractional display scaling (e.g. 125%). Other platforms need the toggle.
    const toggle = process.platform !== 'win32' && !mainWindow.isResizable();
    if (toggle) mainWindow.setResizable(true);
    mainWindow.setBounds(bounds);
    if (toggle) mainWindow.setResizable(false);
  } finally {
    applyingBounds = false;
  }
}

function setPillToastSpace(show) {
  if (!mainWindow || mainWindow.isDestroyed() || currentMode !== 'pill') return { placement: null };
  if (show === Boolean(pillToast)) return { placement: pillToast?.placement ?? null };

  const { width, height } = windowModes.pill;
  const bounds = mainWindow.getBounds();
  let y;
  if (show) {
    const { workArea } = screen.getDisplayMatching(bounds);
    const fitsBelow = bounds.y + height + PILL_TOAST_SPACE <= workArea.y + workArea.height;
    // Set before moving: the 'move' handler uses it to keep remembering the bar's own position.
    pillToast = { placement: fitsBelow ? 'below' : 'above' };
    y = fitsBelow ? bounds.y : bounds.y - PILL_TOAST_SPACE;
  } else {
    y = pillToast.placement === 'above' ? bounds.y + PILL_TOAST_SPACE : bounds.y;
    pillToast = null;
  }

  applyBounds({ x: bounds.x, y, width, height: show ? height + PILL_TOAST_SPACE : height });
  return { placement: pillToast?.placement ?? null };
}

function setWindowMode(mode) {
  const config = windowModes[mode];
  if (!config || !mainWindow || mainWindow.isDestroyed()) return false;
  // Leaving the widget while it shows a message: put the bar back first so positions stay right.
  if (pillToast) setPillToastSpace(false);

  const previousMode = currentMode;
  const current = mainWindow.getBounds();
  const { workArea } = screen.getDisplayMatching(current);
  const width = Math.min(config.width, workArea.width);
  const height = Math.min(config.height, workArea.height);

  let { x, y } = current;
  if (mode === 'dashboard') {
    if (previousMode !== 'dashboard') {
      x = workArea.x + Math.round((workArea.width - width) / 2);
      y = workArea.y + Math.round((workArea.height - height) / 2);
    }
  } else if (compactPosition) {
    // Every compact window (widget, editor, to-do, ...) opens from where the user put the widget,
    // so closing a panel that had to be nudged to fit on screen puts the widget back in its spot.
    ({ x, y } = compactPosition);
  }

  // Keep the whole window visible, e.g. when the pill sits at the bottom edge and expands.
  x = clamp(x, workArea.x, workArea.x + workArea.width - width);
  y = clamp(y, workArea.y, workArea.y + workArea.height - height);

  currentMode = mode;
  if (config.resizable) mainWindow.setResizable(true);
  applyBounds({ x, y, width, height });
  if (!config.resizable) mainWindow.setResizable(false);
  mainWindow.setAlwaysOnTop(config.alwaysOnTop);
  return true;
}

function showWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createMainWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

/** Shows the widget without taking keyboard focus away from the app the user is working in. */
function showWindowInactive() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createMainWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  if (!mainWindow.isVisible()) mainWindow.showInactive();
}

/** Runs a tray/shortcut action: bring the window up, then tell the UI what to open. */
function runAction(action, { focus = true } = {}) {
  if (action === 'toggle-widget') {
    if (mainWindow?.isVisible() && !mainWindow.isMinimized()) mainWindow.hide();
    else showWindow();
    return;
  }
  if (focus) showWindow();
  else showWindowInactive();
  sendToRenderer('tray:action', action);
}

function sendToRenderer(channel, payload) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send(channel, payload);
}

function createMainWindow() {
  const state = readWindowState();
  if (Number.isFinite(state.x)) compactPosition = { x: state.x, y: state.y };
  currentMode = 'pill';

  mainWindow = new BrowserWindow({
    width: windowModes.pill.width,
    height: windowModes.pill.height,
    x: state.x,
    y: state.y,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    resizable: false,
    fullscreenable: false,
    maximizable: false,
    skipTaskbar: false,
    icon: path.join(ASSETS_DIR, 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
    },
  });

  if (!compactPosition) {
    const [x, y] = mainWindow.getPosition();
    compactPosition = { x, y };
  }

  mainWindow.once('ready-to-show', () => {
    if (startHidden) {
      startHidden = false; // only the very first window starts hidden
      return;
    }
    mainWindow?.show();
  });

  // This app never needs to open new windows or leave its own page.
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== mainWindow.webContents.getURL()) event.preventDefault();
  });

  if (isDev) {
    mainWindow.loadURL(DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  mainWindow.on('move', rememberCompactPosition);
  mainWindow.on('close', (event) => {
    writeWindowState();
    // Alt+F4 / taskbar close would destroy the only window and leave the tray pointing at nothing.
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

/* ---------- tray ---------- */


function shortcutFor(action) {
  if (!getSetting('shortcutsEnabled')) return undefined;
  const shortcut = SHORTCUTS.find((item) => item.action === action);
  return shortcut && !failedShortcuts.includes(shortcut.accelerator) ? shortcut.accelerator : undefined;
}

function buildTrayMenu() {
  // `registerAccelerator: false`: the menu only *displays* the shortcut; globalShortcut handles it.
  const item = (label, action, options = {}) => ({
    label,
    accelerator: shortcutFor(action),
    registerAccelerator: false,
    click: () => runAction(action, options),
  });

  return Menu.buildFromTemplate([
    { label: 'Open Dashboard', click: () => runAction('open-dashboard') },
    { type: 'separator' },
    item('New Text Note', 'open-text'),
    item('Start / Stop Recording', 'toggle-recording', { focus: false }),
    { label: 'Voice Recorder…', click: () => runAction('open-voice') },
    item("Today's To-do List", 'open-todo'),
    item('Notes && Recordings', 'open-library'),
    { type: 'separator' },
    item('Show / Hide Widget', 'toggle-widget'),
    { type: 'separator' },
    {
      label: process.platform === 'darwin' ? 'Open at Login' : 'Start with Windows',
      type: 'checkbox',
      checked: isLaunchAtLoginEnabled(),
      click: (menuItem) => {
        setLaunchAtLogin(menuItem.checked);
        refreshTrayMenu();
      },
    },
    {
      label: 'Keyboard Shortcuts',
      type: 'checkbox',
      checked: getSetting('shortcutsEnabled'),
      click: (menuItem) => {
        setSetting('shortcutsEnabled', menuItem.checked);
        registerShortcuts();
        refreshTrayMenu();
      },
    },
    { type: 'separator' },
    { label: 'Exit Application', click: () => app.quit() },
  ]);
}

function refreshTrayMenu() {
  tray?.setContextMenu(buildTrayMenu());
}

function createTray() {
  // tray.png is picked for normal displays, tray@2x.png automatically for high-DPI ones.
  tray = new Tray(nativeImage.createFromPath(path.join(ASSETS_DIR, 'tray.png')));
  tray.setToolTip('QuickCapture');
  refreshTrayMenu();
  // Just bring the window back; don't throw away whatever the user was doing in it.
  tray.on('click', showWindow);
}

/* ---------- global shortcuts ---------- */

function registerShortcuts() {
  globalShortcut.unregisterAll();
  failedShortcuts = [];
  if (!getSetting('shortcutsEnabled')) return;

  for (const { action, accelerator, focus } of SHORTCUTS) {
    let registered = false;
    try {
      registered = globalShortcut.register(accelerator, () => runAction(action, { focus: focus !== false }));
    } catch (error) {
      console.error(`Could not register ${accelerator}`, error);
    }
    if (!registered) failedShortcuts.push(accelerator);
  }

  if (failedShortcuts.length > 0) {
    // Usually means another app already owns the combination.
    const list = failedShortcuts.map(displayAccelerator).join(', ');
    console.warn(`Shortcuts already in use by another app: ${list}`);
    if (process.platform === 'win32' && tray) {
      tray.displayBalloon({
        title: 'QuickCapture',
        content: `These shortcuts are used by another app and were skipped: ${list}`,
      });
    }
  }
}

function displayAccelerator(accelerator) {
  return accelerator.replace('CommandOrControl', process.platform === 'darwin' ? 'Cmd' : 'Ctrl');
}

/* ---------- IPC ---------- */

function parseId(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new Error('Invalid note id');
  return id;
}

function optionalString(value, maxLength, field) {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') throw new Error(`Invalid ${field}`);
  if (value.length > maxLength) throw new Error(`${field} is too long`);
  return value;
}

function parseDay(value) {
  if (typeof value !== 'string' || !DAY_PATTERN.test(value)) throw new Error('Invalid day');
  return value;
}

function parseTodoText(value) {
  if (typeof value !== 'string') throw new Error('Invalid task');
  const text = value.trim();
  if (!text) throw new Error('Task is empty');
  if (text.length > MAX_TODO_LENGTH) throw new Error('Task is too long');
  return text;
}

function toBuffer(data) {
  if (data instanceof ArrayBuffer) return Buffer.from(data);
  if (ArrayBuffer.isView(data)) return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  return null;
}

function registerIpcHandlers() {
  ipcMain.handle('app:set-mode', (_event, mode) => ({ ok: setWindowMode(mode) }));

  // Active shortcuts, for showing them in tooltips: { [action]: 'Ctrl+Alt+N' }
  ipcMain.handle('app:get-shortcuts', () =>
    Object.fromEntries(
      SHORTCUTS.filter(({ action }) => shortcutFor(action)).map(({ action, accelerator }) => [action, displayAccelerator(accelerator)])
    )
  );

  ipcMain.handle('app:hide-widget', () => {
    mainWindow?.hide();
    return { ok: true };
  });

  // Minimize to the taskbar (restored from the taskbar or by clicking the tray icon).
  ipcMain.handle('app:pill-toast', (_event, show) => setPillToastSpace(Boolean(show)));

  ipcMain.handle('app:minimize', () => {
    mainWindow?.minimize();
    return { ok: true };
  });

  // Open File Explorer with a recording selected.
  ipcMain.handle('files:show-in-folder', async (_event, relativePath) => {
    const absolutePath = audio.resolveRecordingPath(relativePath);
    if (!absolutePath) return { ok: false, error: 'Invalid file' };
    try {
      await fs.promises.access(absolutePath);
    } catch {
      return { ok: false, error: 'Recording file not found' };
    }
    shell.showItemInFolder(absolutePath);
    return { ok: true };
  });

  // Open the recordings folder (created if no recording has been saved yet).
  ipcMain.handle('files:open-recordings-folder', async () => {
    const folder = audio.getRecordingsDir();
    await fs.promises.mkdir(folder, { recursive: true });
    const error = await shell.openPath(folder);
    return error ? { ok: false, error } : { ok: true };
  });

  // Open the folder that holds the database and the recordings.
  ipcMain.handle('files:open-data-folder', async () => {
    const error = await shell.openPath(app.getPath('userData'));
    return error ? { ok: false, error } : { ok: true };
  });

  ipcMain.handle('notes:list', (_event, filters) => {
    const search = typeof filters?.search === 'string' ? filters.search.slice(0, MAX_SEARCH_LENGTH) : undefined;
    return notes.listNotes({ search, note_type: filters?.note_type });
  });

  // Only text notes can be created directly; audio notes are created by audio:save with a path we generated.
  ipcMain.handle('notes:create', (_event, payload) => {
    if (payload?.note_type !== 'text') throw new Error('Invalid note type');
    return notes.createNote({
      note_type: 'text',
      title: optionalString(payload.title, MAX_TITLE_LENGTH, 'title'),
      content: optionalString(payload.content, MAX_CONTENT_LENGTH, 'content'),
      is_favorite: Boolean(payload.is_favorite),
    });
  });

  ipcMain.handle('notes:update', (_event, id, payload) => {
    const updates = {
      title: optionalString(payload?.title, MAX_TITLE_LENGTH, 'title'),
      content: payload?.content === null ? null : optionalString(payload?.content, MAX_CONTENT_LENGTH, 'content'),
      is_favorite: payload?.is_favorite === undefined ? undefined : Boolean(payload.is_favorite),
    };
    return notes.updateNote(parseId(id), updates);
  });

  ipcMain.handle('notes:delete', async (_event, id) => {
    const deleted = notes.deleteNote(parseId(id));
    // Previously the recording stayed on disk forever after its note was deleted.
    if (deleted?.file_path) {
      await audio.deleteRecording(deleted.file_path).catch((error) => console.error('Failed to delete recording', error));
    }
    return deleted;
  });

  /* daily to-do lists */
  ipcMain.handle('todos:list', (_event, day) => todos.listTodos(parseDay(day)));
  ipcMain.handle('todos:create', (_event, day, text) => todos.createTodo(parseDay(day), parseTodoText(text)));
  ipcMain.handle('todos:update', (_event, id, patch) =>
    todos.updateTodo(parseId(id), {
      text: patch?.text === undefined ? undefined : parseTodoText(patch.text),
      done: patch?.done === undefined ? undefined : Boolean(patch.done),
    })
  );
  ipcMain.handle('todos:delete', (_event, id) => todos.deleteTodo(parseId(id)));
  ipcMain.handle('todos:clear-done', (_event, day) => todos.clearDone(parseDay(day)));
  ipcMain.handle('todos:open-before', (_event, day) => todos.countOpenBefore(parseDay(day)));
  ipcMain.handle('todos:carry-over', (_event, day) => todos.carryOver(parseDay(day)));

  ipcMain.handle('audio:save', async (_event, data, title, durationSeconds) => {
    const buffer = toBuffer(data);
    if (!buffer || buffer.length === 0) throw new Error('Invalid audio payload');
    if (buffer.length > MAX_AUDIO_BYTES) throw new Error('Recording is too large');
    const safeTitle = optionalString(title, MAX_TITLE_LENGTH, 'title');

    const saved = await audio.saveAudioBuffer(buffer);
    try {
      return notes.createNote({
        title: safeTitle?.trim() || 'Voice Note',
        note_type: 'audio',
        file_path: saved.relativePath,
        duration_seconds: Number.isFinite(durationSeconds) ? durationSeconds : 0,
        content: null,
      });
    } catch (error) {
      await audio.deleteRecording(saved.relativePath).catch(() => {});
      throw error;
    }
  });
}

function registerAudioProtocol() {
  protocol.handle(AUDIO_SCHEME, async (request) => {
    const { pathname } = new URL(request.url);
    const absolutePath = audio.resolveRecordingPath(decodeURIComponent(pathname));
    if (!absolutePath) return new Response('Forbidden', { status: 403 });
    try {
      await fs.promises.access(absolutePath);
    } catch {
      return new Response('Not found', { status: 404 });
    }
    return net.fetch(pathToFileURL(absolutePath).toString());
  });
}

/* ---------- lifecycle ---------- */

if (process.platform === 'win32') app.setAppUserModelId(APP_USER_MODEL_ID);

if (!app.requestSingleInstanceLock()) {
  // A second copy would add a second tray icon and a second writer to the same database.
  app.quit();
} else {
  app.on('second-instance', showWindow);

  app.whenReady().then(() => {
    runMigrations();
    registerAudioProtocol();
    registerIpcHandlers();

    // Only the microphone is needed; deny every other permission request.
    session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback, details) => {
      callback(permission === 'media' && (details.mediaTypes ?? []).every((type) => type === 'audio'));
    });

    createMainWindow();
    createTray();
    registerShortcuts();
    refreshTrayMenu(); // reflect any shortcut that could not be registered

    app.on('activate', showWindow);
  });

  app.on('before-quit', () => {
    isQuitting = true;
    writeWindowState();
  });

  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
    tray?.destroy();
    closeDb();
  });
}
