import { useRef, useState } from 'react';
import { Check, SquarePen, X } from 'lucide-react';
import { formatLongDate } from '../lib/format.js';

function countWords(text) {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

/**
 * Writing surface for a text note: borderless title + body, live word count, Ctrl+Enter to save.
 * `note` is the note being edited, or null for a new one.
 */
export function NoteEditor({ note, title, content, saving, onTitleChange, onContentChange, onSave, onCancel }) {
  const titleRef = useRef(null);
  const bodyRef = useRef(null);
  // Captured once when the editor opens (it remounts each time).
  const [openedAt] = useState(() => Date.now());
  // Shown when Save is pressed on an empty note, instead of the button silently doing nothing.
  const [showEmptyHint, setShowEmptyHint] = useState(false);

  const isEditing = note !== null;
  const hasText = Boolean(title.trim() || content.trim());
  const words = countWords(content);

  const trySave = () => {
    if (saving) return;
    if (!hasText) {
      setShowEmptyHint(true);
      titleRef.current?.focus();
      return;
    }
    onSave();
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      trySave();
    }
  };

  return (
    <div className="editor" onKeyDown={handleKeyDown}>
      <header className="editor-header drag-region">
        <span className="editor-icon">
          <SquarePen size={14} />
        </span>
        <div className="editor-heading">
          <strong>{isEditing ? 'Edit note' : 'New note'}</strong>
          <span>{isEditing ? `Created ${formatLongDate(note.created_at)}` : formatLongDate(openedAt)}</span>
        </div>
        <button className="pill-ctl close no-drag" onClick={onCancel} title="Close (Esc)" aria-label="Close editor">
          <X size={14} />
        </button>
      </header>

      <div className="editor-body">
        <input
          ref={titleRef}
          className="editor-title"
          placeholder="Untitled"
          aria-label="Note title"
          value={title}
          maxLength={200}
          autoFocus
          onChange={(event) => {
            setShowEmptyHint(false);
            onTitleChange(event.target.value);
          }}
          onKeyDown={(event) => {
            // Enter in the title moves on to the body, like most note apps.
            if (event.key === 'Enter' && !event.ctrlKey && !event.metaKey) {
              event.preventDefault();
              bodyRef.current?.focus();
            }
          }}
        />
        <textarea
          ref={bodyRef}
          className="editor-content"
          placeholder="Start writing…"
          aria-label="Note content"
          value={content}
          onChange={(event) => {
            setShowEmptyHint(false);
            onContentChange(event.target.value);
          }}
        />
      </div>

      <footer className="editor-footer">
        <div className="editor-meta">
          {showEmptyHint ? (
            <span className="editor-warning" role="alert">
              Add a title or some text first
            </span>
          ) : (
            <>
              <span className="editor-stats">
                {words} {words === 1 ? 'word' : 'words'} · {content.length} chars
              </span>
              <span className="editor-hint">
                <kbd>Ctrl</kbd>
                <kbd>Enter</kbd> to save
              </span>
            </>
          )}
        </div>
        <div className="editor-actions">
          <button className="ghost" onClick={onCancel}>
            Cancel
          </button>
          <button className="primary" onClick={trySave} disabled={saving}>
            <Check size={14} />
            {saving ? 'Saving…' : isEditing ? 'Save changes' : 'Save note'}
          </button>
        </div>
      </footer>
    </div>
  );
}
