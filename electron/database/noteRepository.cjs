const { getDb } = require('./connection.cjs');

function normalizeRow(row) {
  return {
    ...row,
    is_favorite: Boolean(row.is_favorite),
  };
}

function createNote(note) {
  const db = getDb();
  const now = new Date().toISOString();

  const stmt = db.prepare(`
    INSERT INTO notes (title, content, note_type, file_path, duration_seconds, is_favorite, created_at, updated_at)
    VALUES (@title, @content, @note_type, @file_path, @duration_seconds, @is_favorite, @created_at, @updated_at)
  `);

  const result = stmt.run({
    title: note.title?.trim() || 'Untitled',
    content: note.content || null,
    note_type: note.note_type,
    file_path: note.file_path || null,
    duration_seconds: Number.isFinite(note.duration_seconds) ? Math.max(0, Math.floor(note.duration_seconds)) : null,
    is_favorite: note.is_favorite ? 1 : 0,
    created_at: now,
    updated_at: now,
  });

  return getNoteById(result.lastInsertRowid);
}

function updateNote(id, updates) {
  const db = getDb();
  const existing = getNoteById(id);
  if (!existing) {
    return null;
  }

  const merged = {
    ...existing,
    ...updates,
    title: (updates.title ?? existing.title ?? '').trim() || 'Untitled',
    updated_at: new Date().toISOString(),
  };

  db.prepare(`
    UPDATE notes
    SET title = @title,
        content = @content,
        is_favorite = @is_favorite,
        updated_at = @updated_at
    WHERE id = @id
  `).run({
    id,
    title: merged.title,
    content: merged.content || null,
    is_favorite: merged.is_favorite ? 1 : 0,
    updated_at: merged.updated_at,
  });

  return getNoteById(id);
}

function deleteNote(id) {
  const db = getDb();
  const existing = getNoteById(id);
  if (!existing) return null;
  db.prepare('DELETE FROM notes WHERE id = ?').run(id);
  return existing;
}

function getNoteById(id) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM notes WHERE id = ?').get(id);
  return row ? normalizeRow(row) : null;
}

function listNotes(filters = {}) {
  const db = getDb();
  const params = {};
  const conditions = [];

  if (filters.note_type && ['text', 'audio'].includes(filters.note_type)) {
    conditions.push('note_type = @note_type');
    params.note_type = filters.note_type;
  }

  if (filters.search && filters.search.trim()) {
    conditions.push('(title LIKE @search OR COALESCE(content, \'\') LIKE @search)');
    params.search = `%${filters.search.trim()}%`;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const rows = db
    .prepare(`SELECT * FROM notes ${whereClause} ORDER BY datetime(created_at) DESC`)
    .all(params);

  return rows.map(normalizeRow);
}

module.exports = {
  createNote,
  updateNote,
  deleteNote,
  listNotes,
};
