const { getDb } = require('./connection.cjs');

const NOTE_TYPES = new Set(['text', 'audio']);

let statements;
const listStatements = new Map();

// Prepare once, reuse forever: preparing SQL on every call is the most expensive part of a query.
function getStatements() {
  if (statements) return statements;
  const db = getDb();

  statements = {
    insert: db.prepare(`
      INSERT INTO notes (title, content, note_type, file_path, duration_seconds, is_favorite, created_at, updated_at)
      VALUES (@title, @content, @note_type, @file_path, @duration_seconds, @is_favorite, @created_at, @updated_at)
      RETURNING *
    `),
    update: db.prepare(`
      UPDATE notes
      SET title = COALESCE(@title, title),
          content = CASE WHEN @set_content THEN @content ELSE content END,
          is_favorite = COALESCE(@is_favorite, is_favorite),
          updated_at = @updated_at
      WHERE id = @id
      RETURNING *
    `),
    remove: db.prepare('DELETE FROM notes WHERE id = ? RETURNING *'),
  };
  return statements;
}

function getListStatement(hasType, hasSearch) {
  const key = `${hasType}:${hasSearch}`;
  if (listStatements.has(key)) return listStatements.get(key);

  const conditions = [];
  if (hasType) conditions.push('note_type = @note_type');
  if (hasSearch) {
    conditions.push("(title LIKE @search ESCAPE '\\' OR COALESCE(content, '') LIKE @search ESCAPE '\\')");
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // created_at is ISO-8601, so it sorts correctly as plain text and can use the index.
  const stmt = getDb().prepare(`SELECT * FROM notes ${where} ORDER BY created_at DESC, id DESC`);
  listStatements.set(key, stmt);
  return stmt;
}

function normalizeRow(row) {
  return row ? { ...row, is_favorite: Boolean(row.is_favorite) } : null;
}

function escapeLike(value) {
  return value.replace(/[\\%_]/g, '\\$&');
}

function createNote(note) {
  const now = new Date().toISOString();
  return normalizeRow(
    getStatements().insert.get({
      title: note.title?.trim() || 'Untitled',
      content: note.content || null,
      note_type: note.note_type,
      file_path: note.file_path || null,
      duration_seconds: Number.isFinite(note.duration_seconds) ? Math.max(0, Math.round(note.duration_seconds)) : null,
      is_favorite: note.is_favorite ? 1 : 0,
      created_at: now,
      updated_at: now,
    })
  );
}

function updateNote(id, updates) {
  const hasContent = updates.content !== undefined;
  return normalizeRow(
    getStatements().update.get({
      id,
      title: updates.title === undefined ? null : updates.title.trim() || 'Untitled',
      set_content: hasContent ? 1 : 0,
      content: hasContent ? updates.content || null : null,
      is_favorite: updates.is_favorite === undefined ? null : updates.is_favorite ? 1 : 0,
      updated_at: new Date().toISOString(),
    })
  );
}

function deleteNote(id) {
  return normalizeRow(getStatements().remove.get(id));
}

function listNotes(filters) {
  const noteType = NOTE_TYPES.has(filters?.note_type) ? filters.note_type : null;
  const search = typeof filters?.search === 'string' ? filters.search.trim() : '';

  const stmt = getListStatement(Boolean(noteType), Boolean(search));
  const params = {};
  if (noteType) params.note_type = noteType;
  if (search) params.search = `%${escapeLike(search)}%`;

  const rows = Object.keys(params).length > 0 ? stmt.all(params) : stmt.all();
  return rows.map(normalizeRow);
}

module.exports = {
  createNote,
  updateNote,
  deleteNote,
  listNotes,
};
