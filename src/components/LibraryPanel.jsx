import { useDeferredValue, useMemo, useState } from 'react';
import { ArrowLeft, AudioLines, FolderOpen, Mic, NotebookText, Plus, Search, X } from 'lucide-react';
import { groupByDate } from '../lib/format.js';
import { NoteItem } from './NoteItem.jsx';
import { RecordingItem } from './RecordingItem.jsx';

const TABS = [
  { key: 'text', label: 'Notes', icon: NotebookText },
  { key: 'audio', label: 'Recordings', icon: AudioLines },
];

const PERIODS = [
  { key: 'all', label: 'All time', days: null },
  { key: 'today', label: 'Today', days: 0 },
  { key: 'week', label: 'Last 7 days', days: 6 },
  { key: 'month', label: 'Last 30 days', days: 29 },
];

/** Start of the day `daysAgo` days back, as an ISO string comparable with `created_at`. */
function sinceFor(periodKey) {
  const { days } = PERIODS.find((period) => period.key === periodKey);
  if (days === null) return null;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - days);
  return start.toISOString();
}

function matches(note, query, since) {
  if (since && note.created_at < since) return false;
  if (!query) return true;
  return note.title.toLowerCase().includes(query) || (note.content ?? '').toLowerCase().includes(query);
}

/** One window for everything saved: a Notes tab and a Recordings tab, each filterable and grouped by date. */
export function LibraryPanel({
  tab,
  onTabChange,
  notes,
  recordings,
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
  const [search, setSearch] = useState('');
  // The cut-off is computed when the period is picked (not during render), so render stays pure.
  const [period, setPeriod] = useState({ key: 'all', since: null });
  // Typing stays responsive even with a long list: filtering runs at a lower priority.
  const query = useDeferredValue(search.trim().toLowerCase());

  const filteredNotes = useMemo(() => notes.filter((note) => matches(note, query, period.since)), [notes, query, period.since]);
  const filteredRecordings = useMemo(
    () => recordings.filter((note) => matches(note, query, period.since)),
    [recordings, query, period.since]
  );
  const noteGroups = useMemo(() => groupByDate(filteredNotes), [filteredNotes]);
  const recordingGroups = useMemo(() => groupByDate(filteredRecordings), [filteredRecordings]);

  const isNotes = tab === 'text';
  const groups = isNotes ? noteGroups : recordingGroups;
  const counts = { text: filteredNotes.length, audio: filteredRecordings.length };
  const isFiltered = query !== '' || period.key !== 'all';
  const hasAnyItems = (isNotes ? notes : recordings).length > 0;

  const clearFilters = () => {
    setSearch('');
    setPeriod({ key: 'all', since: null });
  };

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

      <div className="filter-bar">
        <label className="filter-search">
          <Search size={14} />
          <input
            placeholder={isNotes ? 'Search notes…' : 'Search recordings…'}
            aria-label="Search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => {
              // Esc clears the search first; a second Esc goes back to the widget.
              if (event.key === 'Escape' && search) {
                event.stopPropagation();
                setSearch('');
              }
            }}
          />
          {search && (
            <button className="filter-clear" onClick={() => setSearch('')} title="Clear search" aria-label="Clear search">
              <X size={12} />
            </button>
          )}
        </label>
        <select
          className={`filter-select ${period.key !== 'all' ? 'active' : ''}`}
          aria-label="Date range"
          value={period.key}
          onChange={(event) => setPeriod({ key: event.target.value, since: sinceFor(event.target.value) })}
        >
          {PERIODS.map(({ key, label }) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <div className="rec-list" role="tabpanel">
        {!loading && groups.length === 0 && isFiltered && hasAnyItems && (
          <div className="rec-empty">
            <p>No {isNotes ? 'notes' : 'recordings'} match your filters.</p>
            <button onClick={clearFilters}>
              <X size={14} /> Clear filters
            </button>
          </div>
        )}
        {!loading && groups.length === 0 && !hasAnyItems && (
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
