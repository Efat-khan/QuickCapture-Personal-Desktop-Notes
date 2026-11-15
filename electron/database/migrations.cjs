const { getDb } = require('./connection.cjs');

// Each entry runs once, in order. The index of the last applied migration + 1
// is stored in SQLite's `user_version`. Never edit an existing entry; append.
const MIGRATIONS = [
  // 1: initial schema (IF NOT EXISTS so databases created before versioning upgrade cleanly)
  `
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
  `,
  // 2: indexes that match the list query (ORDER BY created_at DESC, id DESC, optionally filtered by type)
  `
    DROP INDEX IF EXISTS idx_notes_created_at;
    DROP INDEX IF EXISTS idx_notes_type;
    CREATE INDEX IF NOT EXISTS idx_notes_created ON notes(created_at, id);
    CREATE INDEX IF NOT EXISTS idx_notes_type_created ON notes(note_type, created_at, id);
  `,
  // 3: daily to-do lists. `day` is the local calendar day, 'YYYY-MM-DD' (sorts correctly as text).
  `
    CREATE TABLE IF NOT EXISTS todos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      day TEXT NOT NULL,
      text TEXT NOT NULL,
      done INTEGER NOT NULL DEFAULT 0,
      position INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_todos_day ON todos(day, done, position);
  `,
];

function runMigrations() {
  const db = getDb();
  const currentVersion = db.pragma('user_version', { simple: true });

  for (let version = currentVersion; version < MIGRATIONS.length; version += 1) {
    db.transaction(() => {
      db.exec(MIGRATIONS[version]);
      db.pragma(`user_version = ${version + 1}`);
    })();
  }
}

module.exports = { runMigrations };
