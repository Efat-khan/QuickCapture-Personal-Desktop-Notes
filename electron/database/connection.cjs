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
  return db;
}

module.exports = { getDb };
