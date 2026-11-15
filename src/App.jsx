import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AudioLines,
  Calendar,
  Check,
  FileText,
  FolderOpen,
  LayoutDashboard,
  Mic,
  Minimize2,
  LibraryBig,
  ListTodo,
  Minus,
  Pause,
  Play,
  Search,
  Square,
  SquarePen,
  StickyNote,
  Trash2,
  X,
} from 'lucide-react';
import './App.css';
import { NoteCard } from './components/NoteCard.jsx';
import { LibraryPanel } from './components/LibraryPanel.jsx';
import { TodoPanel } from './components/TodoPanel.jsx';
import { toDayKey } from './lib/day.js';
import { NoteEditor } from './components/NoteEditor.jsx';
import { useVoiceRecorder } from './hooks/useVoiceRecorder.js';
import { formatDuration, groupByDate } from './lib/format.js';

const api = window.quickCapture;

const MODES = {
  pill: 'pill',
  popup: 'popup',
  text: 'text',
  voice: 'voice',
  library: 'library',
  todo: 'todo',
  dashboard: 'dashboard',
};

// Window size the main process uses for each UI mode (the text editor shares the popup size).
const WINDOW_SIZE_FOR_MODE = {
  pill: 'pill',
  popup: 'popup',
  text: 'editor',
  voice: 'voice',
  library: 'library',
  todo: 'todo',
  dashboard: 'dashboard',
};

const NOTE_FILTERS = [
  { key: 'all', label: 'All Notes', icon: StickyNote },
  { key: 'text', label: 'Text Notes', icon: FileText },
  { key: 'audio', label: 'Voice Notes', icon: AudioLines },
];

const SEARCH_DEBOUNCE_MS = 200;
const TOAST_MS = 1800;

function App() {
  const [mode, setMode] = useState(MODES.pill);
  const [notes, setNotes] = useState([]);
  // All notes for the Library window (null until first loaded); split into the two tabs below.
  const [library, setLibrary] = useState(null);
  const [libraryTab, setLibraryTab] = useState('text');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [toast, setToast] = useState(null);
  const [saving, setSaving] = useState(false);

  const [textTitle, setTextTitle] = useState('');
  const [textContent, setTextContent] = useState('');
  const [editingNote, setEditingNote] = useState(null); // the saved note being edited, or null for a new note
  const [audioTitle, setAudioTitle] = useState('');

  const recorder = useVoiceRecorder();
  // Where Cancel/Save in the text editor should return to (pill, popup or dashboard).
  const textReturnModeRef = useRef(MODES.pill);

  const isDashboard = mode === MODES.dashboard;
  const isLibrary = mode === MODES.library;
  const isPill = mode === MODES.pill;
  const [openTodayCount, setOpenTodayCount] = useState(0);

  const switchMode = useCallback((nextMode) => {
    setMode(nextMode);
    api.app.setMode(WINDOW_SIZE_FOR_MODE[nextMode]).catch((error) => console.error('setMode failed', error));
  }, []);

  // Opens the editor for a new note, or for `note` when one is given.
  const openTextEditor = useCallback(
    (returnTo, note = null) => {
      textReturnModeRef.current = returnTo;
      if (note) {
        setEditingNote(note);
        setTextTitle(note.title);
        setTextContent(note.content ?? '');
      } else if (editingNote !== null) {
        // Don't start a new note pre-filled with the one that was being edited.
        setEditingNote(null);
        setTextTitle('');
        setTextContent('');
      }
      switchMode(MODES.text);
    },
    [switchMode, editingNote]
  );

  const notify = useCallback((text, tone = 'success') => setToast({ text, tone, id: Date.now() }), []);

  /* ---------- effects ---------- */

  // Tray actions: subscribe once (previously re-subscribed on every keystroke in the search box).
  useEffect(() => {
    return api.app.onTrayAction((action) => {
      if (action === 'open-dashboard') switchMode(MODES.dashboard);
      else if (action === 'open-text') openTextEditor(MODES.pill);
      else if (action === 'open-voice') switchMode(MODES.voice);
      else if (action === 'open-todo') switchMode(MODES.todo);
      else switchMode(MODES.pill);
    });
  }, [switchMode, openTextEditor]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search]);

  // Notes are only shown on the dashboard, so only query while it is open.
  // `cancelled` drops responses that arrive after a newer query was issued.
  useEffect(() => {
    if (!isDashboard) return undefined;
    let cancelled = false;
    api.notes
      .list({ search: debouncedSearch, note_type: filter === 'all' ? undefined : filter })
      .then((result) => {
        if (!cancelled) setNotes(result);
      })
      .catch((error) => {
        if (!cancelled) notify(`Could not load notes: ${error.message}`, 'error');
      });
    return () => {
      cancelled = true;
    };
  }, [isDashboard, debouncedSearch, filter, notify]);

  // Library window: one query for both tabs, reloaded each time it opens so new items show up.
  useEffect(() => {
    if (!isLibrary) return undefined;
    let cancelled = false;
    api.notes
      .list({})
      .then((result) => {
        if (!cancelled) setLibrary(result);
      })
      .catch((error) => {
        if (!cancelled) notify(`Could not load notes: ${error.message}`, 'error');
      });
    return () => {
      cancelled = true;
    };
  }, [isLibrary, notify]);

  const libraryNotes = useMemo(() => (library ?? []).filter((note) => note.note_type === 'text'), [library]);
  const libraryRecordings = useMemo(() => (library ?? []).filter((note) => note.note_type === 'audio'), [library]);
  const groupedLibraryNotes = useMemo(() => groupByDate(libraryNotes), [libraryNotes]);
  const groupedLibraryRecordings = useMemo(() => groupByDate(libraryRecordings), [libraryRecordings]);

  const grouped = useMemo(() => groupByDate(notes), [notes]);

  useEffect(() => {
    if (!isPill) return undefined;
    let cancelled = false;
    api.todos
      .list(toDayKey())
      .then((list) => {
        if (!cancelled) setOpenTodayCount(list.filter((todo) => !todo.done).length);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isPill]);

  /* ---------- actions ---------- */

  // Cancel: a new note's draft is kept for next time; unsaved edits to an existing note need confirming.
  const closeTextEditor = useCallback(() => {
    if (editingNote !== null) {
      const changed = textTitle !== editingNote.title || textContent !== (editingNote.content ?? '');
      if (changed && !window.confirm('Discard your changes to this note?')) return;
      setEditingNote(null);
      setTextTitle('');
      setTextContent('');
    }
    switchMode(textReturnModeRef.current);
  }, [editingNote, textTitle, textContent, switchMode]);

  const saveText = async () => {
    if (saving || (!textTitle.trim() && !textContent.trim())) return;
    setSaving(true);
    try {
      const title = textTitle.trim() || 'Untitled';
      if (editingNote !== null) {
        await api.notes.update(editingNote.id, { title, content: textContent });
        notify('Note updated');
      } else {
        await api.notes.create({ title, content: textContent, note_type: 'text' });
        notify('Text note saved');
      }
      setEditingNote(null);
      setTextTitle('');
      setTextContent('');
      // Going back to the dashboard / notes list re-runs its query, so the change appears.
      const returnTo = textReturnModeRef.current;
      switchMode(returnTo === MODES.dashboard || returnTo === MODES.library ? returnTo : MODES.pill);
    } catch (error) {
      notify(`Could not save note: ${error.message}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const closeVoiceRecorder = useCallback(() => {
    if (recorder.hasUnsavedAudio && !window.confirm('Discard the current recording?')) return;
    recorder.reset();
    setAudioTitle('');
    switchMode(MODES.pill);
  }, [recorder, switchMode]);

  const persistRecording = async (recording) => {
    if (saving || !recording) return;
    setSaving(true);
    try {
      const arrayBuffer = await recording.blob.arrayBuffer();
      await api.audio.save(arrayBuffer, audioTitle, recording.durationSeconds);
      // Reset to idle so the next voice note can be recorded (it used to get stuck in "saved").
      recorder.reset();
      setAudioTitle('');
      notify('Voice note saved');
      switchMode(MODES.pill);
    } catch (error) {
      notify(`Could not save recording: ${error.message}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const saveRecording = () => persistRecording(recorder.getRecording());

  /* Quick recording straight from the floating widget: mic starts it, stop saves it. */

  const startQuickRecording = async () => {
    const error = await recorder.start();
    if (error) {
      notify(error, 'error');
      recorder.reset();
    }
  };

  const finishQuickRecording = async () => {
    const recording = await recorder.stop();
    if (!recording) {
      notify('Nothing was recorded', 'error');
      recorder.reset();
      return;
    }
    await persistRecording(recording);
  };

  const discardQuickRecording = () => {
    if (!window.confirm('Discard this recording?')) return;
    recorder.reset();
    setAudioTitle('');
  };

  const deleteNote = useCallback(
    async (note) => {
      if (!window.confirm(`Delete "${note.title}"? This cannot be undone.`)) return;
      try {
        await api.notes.delete(note.id);
        setNotes((previous) => previous.filter((item) => item.id !== note.id));
        setLibrary((previous) => previous?.filter((item) => item.id !== note.id) ?? previous);
      } catch (error) {
        notify(`Could not delete note: ${error.message}`, 'error');
      }
    },
    [notify]
  );

  const renameNote = useCallback(
    async (note, title) => {
      const trimmed = title.trim();
      if (!trimmed || trimmed === note.title) return;
      try {
        const updated = await api.notes.update(note.id, { title: trimmed });
        if (!updated) return;
        const replace = (item) => (item.id === updated.id ? updated : item);
        setLibrary((previous) => previous?.map(replace) ?? previous);
        setNotes((previous) => previous.map(replace));
        notify('Title updated');
      } catch (error) {
        notify(`Could not rename: ${error.message}`, 'error');
      }
    },
    [notify]
  );

  const showFile = useCallback(
    async (note) => {
      try {
        const result = await api.files.showInFolder(note.file_path);
        if (!result?.ok) notify(result?.error || 'Could not open file location', 'error');
      } catch (error) {
        notify(`Could not open file location: ${error.message}`, 'error');
      }
    },
    [notify]
  );

  const openDataFolder = async () => {
    try {
      const result = await api.files.openDataFolder();
      if (!result?.ok) notify(result?.error || 'Could not open folder', 'error');
    } catch (error) {
      notify(`Could not open folder: ${error.message}`, 'error');
    }
  };

  const minimizeWindow = () => api.app.minimize();

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      if (mode === MODES.text) closeTextEditor();
      else if (mode === MODES.voice) closeVoiceRecorder();
      else if (mode === MODES.popup || mode === MODES.library || mode === MODES.todo) switchMode(MODES.pill);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mode, closeTextEditor, closeVoiceRecorder, switchMode]);

  /* ---------- views ---------- */

  const openRecordingsFolder = async () => {
    try {
      const result = await api.files.openRecordingsFolder();
      if (!result?.ok) notify(result?.error || 'Could not open recordings folder', 'error');
    } catch (error) {
      notify(`Could not open recordings folder: ${error.message}`, 'error');
    }
  };

  // While a recording is in progress the widget shows only recording controls.
  const pillRecordingLabel = {
    starting: 'Starting…',
    recording: 'Recording',
    paused: 'Paused',
    stopping: 'Saving…',
    stopped: saving ? 'Saving…' : 'Not saved',
  }[recorder.status];

  const pillRecordingBar = (
    <div className="pill-root pill-recording drag-region">
      <div className="pill-rec-status" role="status">
        <span className={`dot ${recorder.status === 'recording' ? 'active' : ''}`} />
        <span className="pill-rec-label">{pillRecordingLabel}</span>
        <span className="pill-rec-time">{formatDuration(recorder.elapsedSeconds)}</span>
      </div>
      <div className="pill-actions no-drag">
        {recorder.status === 'recording' && (
          <button className="pill-btn" onClick={recorder.pause} title="Pause" aria-label="Pause">
            <Pause size={16} />
          </button>
        )}
        {recorder.status === 'paused' && (
          <button className="pill-btn" onClick={recorder.resume} title="Resume" aria-label="Resume">
            <Play size={16} />
          </button>
        )}
        {(recorder.status === 'recording' || recorder.status === 'paused') && (
          <button className="pill-btn stop" onClick={finishQuickRecording} title="Stop and save" aria-label="Stop and save">
            <Square size={14} fill="currentColor" />
          </button>
        )}
        {recorder.status === 'stopped' && (
          <button className="pill-btn stop" onClick={saveRecording} disabled={saving} title="Save recording" aria-label="Save recording">
            <Check size={16} />
          </button>
        )}
        <button
          className="pill-btn discard"
          onClick={discardQuickRecording}
          disabled={saving || recorder.status === 'stopping' || recorder.status === 'starting'}
          title="Discard recording"
          aria-label="Discard recording"
        >
          <Trash2 size={15} />
        </button>
      </div>
    </div>
  );

  const pill = (
    <div className="pill-root drag-region">
      <span className="pill-logo" title="QuickCapture (drag to move)">
        <AudioLines size={14} />
      </span>
      <div className="pill-actions no-drag">
        <button className="pill-btn" onClick={() => openTextEditor(MODES.pill)} title="New text note" aria-label="New text note">
          <SquarePen size={15} />
        </button>
        <button className="pill-btn" onClick={startQuickRecording} title="Start recording" aria-label="Start recording">
          <Mic size={15} />
        </button>
        <button
          className="pill-btn"
          onClick={() => switchMode(MODES.todo)}
          title={openTodayCount ? `To-do (${openTodayCount} left today)` : 'To-do'}
          aria-label="To-do"
        >
          <ListTodo size={15} />
          {openTodayCount > 0 && <span className="pill-badge">{openTodayCount > 99 ? '99+' : openTodayCount}</span>}
        </button>
        <button className="pill-btn" onClick={() => switchMode(MODES.library)} title="Notes & recordings" aria-label="Library">
          <LibraryBig size={15} />
        </button>
        <span className="pill-divider" />
        <button className="pill-ctl" onClick={minimizeWindow} title="Minimize" aria-label="Minimize">
          <Minus size={13} />
        </button>
        <button className="pill-ctl close" onClick={() => api.app.hideWidget()} title="Hide to tray" aria-label="Hide to tray">
          <X size={13} />
        </button>
      </div>
    </div>
  );

  const popup = (
    <div className="panel">
      <h2 className="panel-header drag-region">Quick Capture</h2>
      <div className="quick-actions">
        <button onClick={() => openTextEditor(MODES.popup)}>
          <StickyNote size={14} />
          Take a Note
        </button>
        <button onClick={() => switchMode(MODES.voice)}>
          <Mic size={14} />
          Record Audio
        </button>
        <button onClick={() => switchMode(MODES.dashboard)}>
          <LayoutDashboard size={14} />
          Open Dashboard
        </button>
      </div>
      <div className="panel-footer">
        <button className="ghost" onClick={() => switchMode(MODES.pill)}>
          Cancel
        </button>
      </div>
    </div>
  );

  const textEditor = (
    <NoteEditor
      note={editingNote}
      title={textTitle}
      content={textContent}
      saving={saving}
      onTitleChange={setTextTitle}
      onContentChange={setTextContent}
      onSave={saveText}
      onCancel={closeTextEditor}
    />
  );

  const { status } = recorder;
  const voiceRecorder = (
    <div className="panel voice-panel">
      <h2 className="panel-header drag-region">Voice Recorder</h2>
      <div className="recording-indicator">
        <span className={`dot ${status === 'recording' ? 'active' : ''}`} />
        <strong>{status === 'idle' ? 'READY' : status.toUpperCase()}</strong>
        <span>{formatDuration(recorder.elapsedSeconds)}</span>
      </div>
      {recorder.error && <p className="error-text">{recorder.error}</p>}
      <input
        className="field"
        placeholder="Optional title"
        value={audioTitle}
        maxLength={200}
        onChange={(event) => setAudioTitle(event.target.value)}
      />
      <div className="actions-row">
        {(status === 'idle' || status === 'error' || status === 'starting') && (
          <button className="primary" onClick={recorder.start} disabled={status === 'starting'}>
            <Mic size={14} /> {status === 'error' ? 'Try Again' : 'Start'}
          </button>
        )}
        {status === 'recording' && (
          <button onClick={recorder.pause}>
            <Pause size={14} /> Pause
          </button>
        )}
        {status === 'paused' && (
          <button onClick={recorder.resume}>
            <Play size={14} /> Resume
          </button>
        )}
        {(status === 'recording' || status === 'paused') && (
          <button onClick={recorder.stop}>
            <Square size={14} /> Stop
          </button>
        )}
        {(status === 'stopping' || status === 'stopped') && (
          <button className="primary" onClick={saveRecording} disabled={saving || status === 'stopping'}>
            <Check size={14} /> {saving ? 'Saving...' : 'Save Recording'}
          </button>
        )}
        <button className="ghost" onClick={closeVoiceRecorder}>
          {recorder.hasUnsavedAudio ? 'Discard' : 'Close'}
        </button>
      </div>
    </div>
  );

  const hasQuery = debouncedSearch !== '' || filter !== 'all';
  const dashboard = (
    <div className="dashboard">
      <aside className="sidebar">
        <h1 className="sidebar-header drag-region">QuickCapture</h1>
        <nav>
          {NOTE_FILTERS.map(({ key, label, icon: Icon }) => (
            <button key={key} className={filter === key ? 'active' : ''} onClick={() => setFilter(key)}>
              <Icon size={14} /> {label}
            </button>
          ))}
          <button disabled title="Coming soon">
            <Calendar size={14} /> Calendar <span className="badge">Soon</span>
          </button>
        </nav>
        <div className="local-hint">
          <span>Data stored locally</span>
          <button onClick={openDataFolder} title="Open the folder with your database and recordings">
            <FolderOpen size={14} /> Open saved files
          </button>
        </div>
      </aside>

      <section className="content">
        <header className="toolbar drag-region">
          <div className="search-wrap no-drag">
            <Search size={14} />
            <input placeholder="Search notes..." value={search} onChange={(event) => setSearch(event.target.value)} />
          </div>
          <button className="primary no-drag" onClick={() => openTextEditor(MODES.dashboard)}>
            New Note
          </button>
          <button className="no-drag icon-btn" onClick={minimizeWindow} title="Minimize">
            <Minus size={14} />
          </button>
          <button className="no-drag icon-btn" onClick={() => switchMode(MODES.pill)} title="Back to floating widget">
            <Minimize2 size={14} />
          </button>
        </header>

        <div className="timeline">
          {grouped.length === 0 && (
            <p className="empty">{hasQuery ? 'No notes match your search.' : 'No notes yet. Capture one from the pill.'}</p>
          )}
          {grouped.map((group) => (
            <section key={group.label} className="date-group">
              <h3>{group.label}</h3>
              {group.notes.map((note) => (
                <NoteCard key={note.id} note={note} onDelete={deleteNote} onShowFile={showFile} />
              ))}
            </section>
          ))}
        </div>
      </section>
    </div>
  );

  return (
    <main className={`app mode-${mode}`}>
      {mode === MODES.pill && (recorder.status === 'idle' || recorder.status === 'error' ? pill : pillRecordingBar)}
      {mode === MODES.popup && popup}
      {mode === MODES.text && textEditor}
      {mode === MODES.voice && voiceRecorder}
      {mode === MODES.todo && <TodoPanel notify={notify} onClose={() => switchMode(MODES.pill)} />}
      {isLibrary && (
        <LibraryPanel
          tab={libraryTab}
          onTabChange={setLibraryTab}
          noteGroups={groupedLibraryNotes}
          noteCount={libraryNotes.length}
          recordingGroups={groupedLibraryRecordings}
          recordingCount={libraryRecordings.length}
          loading={library === null}
          onEditNote={(note) => openTextEditor(MODES.library, note)}
          onNewNote={() => openTextEditor(MODES.library)}
          onShowFile={showFile}
          onRename={renameNote}
          onDelete={deleteNote}
          onOpenFolder={openRecordingsFolder}
          onRecord={() => {
            switchMode(MODES.pill);
            startQuickRecording();
          }}
          onClose={() => switchMode(MODES.pill)}
        />
      )}
      {isDashboard && dashboard}
      {toast && (
        <div key={toast.id} className={`toast ${toast.tone}`}>
          {toast.text}
        </div>
      )}
    </main>
  );
}

export default App;
