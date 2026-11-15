import { memo } from 'react';
import { FolderOpen } from 'lucide-react';
import { audioSrc, formatDuration, formatTime } from '../lib/format.js';

// Memoised so typing in the search box doesn't re-render every card.
export const NoteCard = memo(function NoteCard({ note, onDelete, onShowFile }) {
  const isAudio = note.note_type === 'audio';

  return (
    <article className="note-card">
      <div className="note-body">
        <h4>{note.title}</h4>
        <p className="meta">
          {isAudio ? 'Audio' : 'Text'} • {formatTime(note.created_at)}
        </p>
        {isAudio ? (
          <div className="audio-preview">
            <p className="preview">Duration: {formatDuration(note.duration_seconds)}</p>
            {note.file_path && <audio controls src={audioSrc(note.file_path)} preload="none" />}
          </div>
        ) : (
          <p className="preview text-preview">{note.content || 'No content'}</p>
        )}
      </div>
      <div className="note-actions">
        {isAudio && note.file_path && (
          <button className="ghost" onClick={() => onShowFile(note)} title="Show the recording in File Explorer">
            <FolderOpen size={13} /> Show file
          </button>
        )}
        <button className="ghost" onClick={() => onDelete(note)}>
          Delete
        </button>
      </div>
    </article>
  );
});
