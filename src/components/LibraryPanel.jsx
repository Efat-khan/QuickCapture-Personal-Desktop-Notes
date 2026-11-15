import { ArrowLeft, AudioLines, FolderOpen, Mic, NotebookText, Plus } from 'lucide-react';
import { NoteItem } from './NoteItem.jsx';
import { RecordingItem } from './RecordingItem.jsx';

const TABS = [
  { key: 'text', label: 'Notes', icon: NotebookText },
  { key: 'audio', label: 'Recordings', icon: AudioLines },
];

/** One window for everything saved: a Notes tab and a Recordings tab, each grouped by date. */
export function LibraryPanel({
  tab,
  onTabChange,
  noteGroups,
  noteCount,
  recordingGroups,
  recordingCount,
  loading,
  onEditNote,
  onNewNote,
  onShowFile,
  onRename,
  onDelete,
  onOpenFolder,
  onRecord,
  onClose,
}) {
  const isNotes = tab === 'text';
  const groups = isNotes ? noteGroups : recordingGroups;
  const counts = { text: noteCount, audio: recordingCount };

  return (
    <div className="panel recordings-panel">
      <h2 className="panel-header drag-region">Library</h2>

      <div className="tabs" role="tablist" aria-label="Library sections">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            className={`tab ${tab === key ? 'active' : ''}`}
            onClick={() => onTabChange(key)}
          >
            <Icon size={14} /> {label}
            <span className="tab-count">{loading ? '–' : counts[key]}</span>
          </button>
        ))}
      </div>

      <div className="rec-list" role="tabpanel">
        {!loading && groups.length === 0 && (
          <div className="rec-empty">
            <p>{isNotes ? 'No text notes yet.' : 'No recordings yet.'}</p>
            {isNotes ? (
              <button className="primary" onClick={onNewNote}>
                <Plus size={14} /> Write one now
              </button>
            ) : (
              <button className="primary" onClick={onRecord}>
                <Mic size={14} /> Record one now
              </button>
            )}
          </div>
        )}
        {groups.map((group) => (
          <section key={group.label} className="rec-group">
            <h3>{group.label}</h3>
            <ul>
              {group.notes.map((note) =>
                isNotes ? (
                  <NoteItem key={note.id} note={note} onEdit={onEditNote} onDelete={onDelete} />
                ) : (
                  <RecordingItem key={note.id} note={note} onShowFile={onShowFile} onRename={onRename} onDelete={onDelete} />
                )
              )}
            </ul>
          </section>
        ))}
      </div>

      <div className="actions-row">
        {isNotes ? (
          <button className="primary" onClick={onNewNote}>
            <Plus size={14} /> New note
          </button>
        ) : (
          <button onClick={onOpenFolder} title="Open the recordings folder in File Explorer">
            <FolderOpen size={14} /> Open folder
          </button>
        )}
        <button className="ghost back-btn" onClick={onClose} title="Back to the widget (Esc)">
          <ArrowLeft size={14} /> Back
        </button>
      </div>
    </div>
  );
}
