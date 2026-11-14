const { getDb } = require('./connection.cjs');

function runMigrations() {
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL DEFAULT '',
      content TEXT,
      note_type TEXT NOT NULL CHECK(note_type IN ('text', 'audio')),
      file_path TEXT,
      duration_seconds INTEGER,
      is_favorite INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_notes_created_at ON notes(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_notes_type ON notes(note_type);
  `);
}

module.exports = { runMigrations };
