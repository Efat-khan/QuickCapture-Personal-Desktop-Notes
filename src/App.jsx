import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AudioLines,
  Calendar,
  Check,
  LayoutDashboard,
  Mic,
  Pause,
  Play,
  Search,
  Square,
  StickyNote,
  X,
} from 'lucide-react';
import './App.css';

const MODES = {
  pill: 'pill',
  popup: 'popup',
  text: 'text',
  voice: 'voice',
  dashboard: 'dashboard',
};

const NOTE_FILTERS = [
  { key: 'all', label: 'All Notes' },
  { key: 'text', label: 'Text Notes' },
  { key: 'audio', label: 'Voice Notes' },
];

function formatTime(timestamp) {
  return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(new Date(timestamp));
}

function formatDate(timestamp) {
  return new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(timestamp));
}

function groupByDate(notes) {
  return notes.reduce((acc, note) => {
    const dateLabel = formatDate(note.created_at);
    if (!acc[dateLabel]) acc[dateLabel] = [];
    acc[dateLabel].push(note);
    return acc;
  }, {});
}

function App() {
  const [mode, setMode] = useState(MODES.pill);
  const [notes, setNotes] = useState([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [saveMessage, setSaveMessage] = useState('');
  const [audioUrls, setAudioUrls] = useState({});

  const [textTitle, setTextTitle] = useState('');
  const [textContent, setTextContent] = useState('');

  const [audioTitle, setAudioTitle] = useState('');
  const [audioStatus, setAudioStatus] = useState('ready');
  const [audioError, setAudioError] = useState('');
  const [audioSeconds, setAudioSeconds] = useState(0);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const streamRef = useRef(null);
  const timerRef = useRef(null);
  const messageTimerRef = useRef(null);

  const fetchNotes = useCallback(async (override = {}) => {
    const payload = {
      search: override.search ?? search,
      note_type: override.filter && override.filter !== 'all' ? override.filter : filter !== 'all' ? filter : undefined,
    };
    const allNotes = await window.quickCapture.notes.list(payload);
    setNotes(allNotes);
    const uniquePaths = [...new Set(allNotes.filter((note) => note.note_type === 'audio' && note.file_path).map((note) => note.file_path))];
    const resolved = await Promise.all(uniquePaths.map((relativePath) => window.quickCapture.audio.getUrl(relativePath)));
    const nextUrls = {};
    uniquePaths.forEach((relativePath, index) => {
      nextUrls[relativePath] = resolved[index];
    });
    setAudioUrls(nextUrls);
  }, [filter, search]);

  const openMode = async (nextMode) => {
    setMode(nextMode);
    await window.quickCapture.app.setMode(nextMode === MODES.text ? MODES.popup : nextMode);
    if (nextMode === MODES.text || nextMode === MODES.popup) {
      await window.quickCapture.app.setMode(MODES.popup);
    }
  };

  useEffect(() => {
    fetchNotes();

    const detachTray = window.quickCapture.app.onTrayAction(async (action) => {
      if (action === 'open-dashboard') {
        setMode(MODES.dashboard);
        await window.quickCapture.app.setMode(MODES.dashboard);
      } else if (action === 'open-text') {
        setMode(MODES.text);
        await window.quickCapture.app.setMode(MODES.popup);
      } else if (action === 'open-voice') {
        setMode(MODES.voice);
        await window.quickCapture.app.setMode(MODES.voice);
      } else {
        setMode(MODES.pill);
        await window.quickCapture.app.setMode(MODES.pill);
      }
    });

    return () => detachTray?.();
  }, [fetchNotes]);

  useEffect(() => {
    clearTimeout(messageTimerRef.current);
    if (saveMessage) {
      messageTimerRef.current = setTimeout(() => setSaveMessage(''), 1800);
    }
    return () => clearTimeout(messageTimerRef.current);
  }, [saveMessage]);

  useEffect(() => {
    const delay = setTimeout(() => {
      fetchNotes({ search, filter });
    }, 200);

    return () => clearTimeout(delay);
  }, [fetchNotes, search, filter]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  useEffect(() => {
    const onKeyDown = async (event) => {
      if (event.key !== 'Escape') return;
      if (mode === MODES.dashboard || mode === MODES.pill) return;
      setMode(MODES.pill);
      await window.quickCapture.app.setMode(MODES.pill);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mode]);

  const grouped = useMemo(() => groupByDate(notes), [notes]);

  const saveText = async () => {
    if (!textTitle.trim() && !textContent.trim()) return;

    await window.quickCapture.notes.create({
      title: textTitle.trim() || 'Untitled',
      content: textContent,
      note_type: 'text',
    });

    setTextTitle('');
    setTextContent('');
    setSaveMessage('Text note saved');
    await fetchNotes();
    setMode(MODES.pill);
    await window.quickCapture.app.setMode(MODES.pill);
  };

  const deleteNote = async (id) => {
    await window.quickCapture.notes.delete(id);
    await fetchNotes();
  };

  const startRecordingTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setAudioSeconds((prev) => prev + 1);
    }, 1000);
  };

  const startRecording = async () => {
    try {
      setAudioError('');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];
      setAudioSeconds(0);

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.start();
      startRecordingTimer();
      setAudioStatus('recording');
    } catch (error) {
      setAudioStatus('error');
      setAudioError(error.message || 'Unable to access microphone');
    }
  };

  const pauseRecording = () => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.pause();
      clearInterval(timerRef.current);
      setAudioStatus('paused');
    }
  };

  const resumeRecording = () => {
    if (mediaRecorderRef.current?.state === 'paused') {
      mediaRecorderRef.current.resume();
      startRecordingTimer();
      setAudioStatus('recording');
    }
  };

  const stopRecording = () => {
    if (!mediaRecorderRef.current) return;
    mediaRecorderRef.current.stop();
    clearInterval(timerRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    setAudioStatus('stopped');
  };

  const saveRecording = async () => {
    if (!audioChunksRef.current.length) return;

    const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
    const arrayBuffer = await blob.arrayBuffer();

    await window.quickCapture.audio.save(arrayBuffer, audioTitle, audioSeconds);
    setAudioTitle('');
    setAudioStatus('saved');
    setAudioSeconds(0);
    audioChunksRef.current = [];
    setSaveMessage('Voice note saved');
    await fetchNotes();

    setMode(MODES.pill);
    await window.quickCapture.app.setMode(MODES.pill);
  };

  const pill = (
    <div className="pill-root drag-region">
      <div className="pill-brand">
        <AudioLines size={16} />
        <span>QuickCapture</span>
      </div>
      <button className="pill-action no-drag" onClick={() => openMode(MODES.text)}>
        <StickyNote size={15} />
        Note
      </button>
      <button className="pill-mic no-drag" onClick={() => openMode(MODES.voice)}>
        <Mic size={15} />
      </button>
      <button className="pill-close no-drag" onClick={() => window.quickCapture.app.hideWidget()}>
        <X size={14} />
      </button>
    </div>
  );

  const popup = (
    <div className="panel">
      <h2>Quick Capture</h2>
      <div className="quick-actions">
        <button onClick={() => setMode(MODES.text)}>
          <StickyNote size={16} />
          Take a Note
        </button>
        <button onClick={() => openMode(MODES.voice)}>
          <Mic size={16} />
          Record Audio
        </button>
        <button onClick={() => openMode(MODES.dashboard)}>
          <LayoutDashboard size={16} />
          Open Dashboard
        </button>
      </div>
      <div className="panel-footer">
        <button className="ghost" onClick={() => openMode(MODES.pill)}>
          Cancel
        </button>
      </div>
    </div>
  );

  const textEditor = (
    <div className="panel">
      <h2>Text Note</h2>
      <input
        className="field"
        placeholder="Title"
        value={textTitle}
        onChange={(event) => setTextTitle(event.target.value)}
      />
      <textarea
        className="field area"
        placeholder="Write your note..."
        value={textContent}
        onChange={(event) => setTextContent(event.target.value)}
      />
      <div className="actions-row">
        <button className="ghost" onClick={() => openMode(MODES.popup)}>
          Cancel
        </button>
        <button className="primary" onClick={saveText}>
          Save Note
        </button>
      </div>
    </div>
  );

  const voiceRecorder = (
    <div className="panel voice-panel">
      <h2>Voice Recorder</h2>
      <div className="recording-indicator">
        <span className={`dot ${audioStatus === 'recording' ? 'active' : ''}`} />
        <strong>{audioStatus.toUpperCase()}</strong>
        <span>{Math.floor(audioSeconds / 60)}:{String(audioSeconds % 60).padStart(2, '0')}</span>
      </div>
      {audioError && <p className="error-text">{audioError}</p>}
      <input
        className="field"
        placeholder="Optional title"
        value={audioTitle}
        onChange={(event) => setAudioTitle(event.target.value)}
      />
      <div className="actions-row">
        {audioStatus === 'ready' && (
          <button className="primary" onClick={startRecording}>
            <Mic size={16} /> Start
          </button>
        )}
        {audioStatus === 'recording' && (
          <>
            <button onClick={pauseRecording}>
              <Pause size={16} /> Pause
            </button>
            <button onClick={stopRecording}>
              <Square size={16} /> Stop
            </button>
          </>
        )}
        {audioStatus === 'paused' && (
          <>
            <button onClick={resumeRecording}>
              <Play size={16} /> Resume
            </button>
            <button onClick={stopRecording}>
              <Square size={16} /> Stop
            </button>
          </>
        )}
        {audioStatus === 'stopped' && (
          <button className="primary" onClick={saveRecording}>
            <Check size={16} /> Save Recording
          </button>
        )}
        <button className="ghost" onClick={() => openMode(MODES.pill)}>
          Close
        </button>
      </div>
    </div>
  );

  const dashboard = (
    <div className="dashboard">
      <aside className="sidebar">
        <h1>QuickCapture</h1>
        <nav>
          <button className="active">
            <LayoutDashboard size={16} /> Dashboard
          </button>
          <button>
            <StickyNote size={16} /> All Notes
          </button>
          <button>
            <AudioLines size={16} /> Voice Notes
          </button>
          <button>
            <Calendar size={16} /> Calendar
          </button>
        </nav>
        <p className="local-hint">Data stored locally</p>
      </aside>

      <section className="content">
        <header className="toolbar">
          <div className="search-wrap">
            <Search size={16} />
            <input placeholder="Search notes..." value={search} onChange={(event) => setSearch(event.target.value)} />
          </div>
          <div className="filters">
            {NOTE_FILTERS.map((item) => (
              <button
                key={item.key}
                className={filter === item.key ? 'active' : ''}
                onClick={() => setFilter(item.key)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <button className="primary" onClick={() => openMode(MODES.text)}>
            New Note
          </button>
        </header>

        <div className="timeline">
          {Object.keys(grouped).length === 0 && <p className="empty">No notes yet. Capture one from the pill.</p>}
          {Object.entries(grouped).map(([date, entries]) => (
            <section key={date} className="date-group">
              <h3>{date}</h3>
              {entries.map((note) => (
                <article key={note.id} className="note-card">
                  <div>
                    <h4>{note.title}</h4>
                    <p className="meta">
                      {note.note_type === 'audio' ? 'Audio' : 'Text'} • {formatTime(note.created_at)}
                    </p>
                    {note.note_type === 'text' ? (
                      <p className="preview">{note.content || 'No content'}</p>
                    ) : (
                      <div className="audio-preview">
                        <p className="preview">Duration: {note.duration_seconds || 0}s</p>
                        {audioUrls[note.file_path] ? <audio controls src={audioUrls[note.file_path]} preload="none" /> : null}
                      </div>
                    )}
                  </div>
                  <button className="ghost" onClick={() => deleteNote(note.id)}>
                    Delete
                  </button>
                </article>
              ))}
            </section>
          ))}
        </div>
      </section>
    </div>
  );

  return (
    <main className={`app mode-${mode}`}>
      {mode === MODES.pill && pill}
      {mode === MODES.popup && popup}
      {mode === MODES.text && textEditor}
      {mode === MODES.voice && voiceRecorder}
      {mode === MODES.dashboard && dashboard}
      {saveMessage && <div className="toast">{saveMessage}</div>}
    </main>
  );
}

export default App;
