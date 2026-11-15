import { memo, useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { formatTime } from '../lib/format.js';

export const NoteItem = memo(function NoteItem({ note, onEdit, onDelete }) {
  const [expanded, setExpanded] = useState(false);
  const content = note.content?.trim();

  return (
    <li className="rec-item">
      <div className="rec-head">
        <div className="rec-info">
          <strong title={note.title}>{note.title}</strong>
          <span className="rec-meta">
            {formatTime(note.created_at)}
            {note.updated_at !== note.created_at && ' · edited'}
          </span>
        </div>
        <div className="rec-tools">
          <button className="rec-tool" onClick={() => onEdit(note)} title="Edit note" aria-label="Edit note">
            <Pencil size={14} />
          </button>
          <button className="rec-tool danger" onClick={() => onDelete(note)} title="Delete note" aria-label="Delete note">
            <Trash2 size={14} />
          </button>
        </div>
      </div>
      {content ? (
        <button
          className={`note-text ${expanded ? 'expanded' : ''}`}
          onClick={() => setExpanded((value) => !value)}
          title={expanded ? 'Show less' : 'Show full note'}
          aria-expanded={expanded}
        >
          {content}
        </button>
      ) : (
        <p className="note-text empty-text">No content</p>
      )}
    </li>
  );
});
