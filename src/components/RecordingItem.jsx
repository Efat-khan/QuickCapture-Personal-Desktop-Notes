import { memo, useRef, useState } from 'react';
import { Check, FolderOpen, Pencil, Trash2 } from 'lucide-react';
import { audioSrc, formatDuration, formatTime } from '../lib/format.js';

export const RecordingItem = memo(function RecordingItem({ note, onShowFile, onRename, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  // Guards against committing twice (Enter + blur) or after Escape cancelled the edit.
  const activeRef = useRef(false);

  const startEditing = () => {
    activeRef.current = true;
    setDraft(note.title);
    setEditing(true);
  };

  const commit = () => {
    if (!activeRef.current) return;
    activeRef.current = false;
    setEditing(false);
    onRename(note, draft);
  };

  const cancel = () => {
    activeRef.current = false;
    setEditing(false);
  };

  return (
    <li className="rec-item">
      <div className="rec-head">
        <div className="rec-info">
          {editing ? (
            <input
              className="field rec-title-input"
              value={draft}
              maxLength={200}
              autoFocus
              placeholder="Recording title"
              aria-label="Recording title"
              onFocus={(event) => event.target.select()}
              onChange={(event) => setDraft(event.target.value)}
              onBlur={commit}
              onKeyDown={(event) => {
                if (event.key === 'Enter') commit();
                if (event.key === 'Escape') {
                  // Cancel only the rename, not the whole window.
                  event.stopPropagation();
                  cancel();
                }
              }}
            />
          ) : (
            <strong className="rec-name" title="Click to rename" onClick={startEditing}>
              {note.title}
            </strong>
          )}
          <span className="rec-meta">
            {formatTime(note.created_at)} · {formatDuration(note.duration_seconds)}
          </span>
        </div>
        <div className="rec-tools">
          {editing ? (
            <button
              className="rec-tool"
              onMouseDown={(event) => event.preventDefault()}
              onClick={commit}
              title="Save title"
              aria-label="Save title"
            >
              <Check size={14} />
            </button>
          ) : (
            <button className="rec-tool" onClick={startEditing} title="Rename" aria-label="Rename">
              <Pencil size={14} />
            </button>
          )}
          <button className="rec-tool" onClick={() => onShowFile(note)} title="Show in folder" aria-label="Show in folder">
            <FolderOpen size={14} />
          </button>
          <button className="rec-tool danger" onClick={() => onDelete(note)} title="Delete recording" aria-label="Delete recording">
            <Trash2 size={14} />
          </button>
        </div>
      </div>
      {note.file_path && <audio controls src={audioSrc(note.file_path)} preload="none" />}
    </li>
  );
});
