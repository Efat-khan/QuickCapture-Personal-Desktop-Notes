const Database = require('better-sqlite3');
const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');

let db;

function getDb() {
  if (db) return db;

  const dbDir = path.join(app.getPath('userData'), 'database');
  fs.mkdirSync(dbDir, { recursive: true });

  db = new Database(path.join(dbDir, 'quickcapture.db'));
  db.pragma('journal_mode = WAL');
  // NORMAL is crash-safe in WAL mode and avoids an fsync on every write.
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');
  return db;
}

function closeDb() {
  if (!db) return;
  db.close();
  db = undefined;
}

module.exports = { getDb, closeDb };
