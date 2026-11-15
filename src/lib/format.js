// Intl formatters are expensive to construct; build them once instead of once per note per render.
const timeFormatter = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });
const dateFormatter = new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'long', day: 'numeric' });

export function formatTime(timestamp) {
  return timeFormatter.format(new Date(timestamp));
}

export function formatDuration(totalSeconds) {
  const seconds = Math.max(0, Math.floor(totalSeconds || 0));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/** Notes arrive sorted newest-first, so grouping is a single pass over consecutive dates. */
export function groupByDate(notes) {
  const groups = [];
  let current = null;
  for (const note of notes) {
    const label = dateFormatter.format(new Date(note.created_at));
    if (!current || current.label !== label) {
      current = { label, notes: [] };
      groups.push(current);
    }
    current.notes.push(note);
  }
  return groups;
}

/** URL served by the main process's qc-audio:// protocol. Handles old backslash-separated paths too. */
export function audioSrc(filePath) {
  if (!filePath) return null;
  const encoded = filePath.replace(/\\/g, '/').split('/').filter(Boolean).map(encodeURIComponent).join('/');
  return `qc-audio://local/${encoded}`;
}

const longDateFormatter = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

/** e.g. "Saturday, November 15" */
export function formatLongDate(timestamp) {
  return longDateFormatter.format(new Date(timestamp));
}
