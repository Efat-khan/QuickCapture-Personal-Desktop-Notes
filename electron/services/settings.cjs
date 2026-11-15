const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');

const DEFAULTS = {
  shortcutsEnabled: true,
};

let cache;

function getFilePath() {
  return path.join(app.getPath('userData'), 'settings.json');
}

function load() {
  if (cache) return cache;
  try {
    cache = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(getFilePath(), 'utf8')) };
  } catch {
    cache = { ...DEFAULTS };
  }
  return cache;
}

function getSetting(key) {
  return load()[key];
}

function setSetting(key, value) {
  load()[key] = value;
  // Write to a temp file and rename, so a crash mid-write can't leave a corrupt settings file.
  const file = getFilePath();
  const temp = `${file}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(cache, null, 2));
  fs.renameSync(temp, file);
}

module.exports = { getSetting, setSetting };
