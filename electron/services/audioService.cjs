const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');

function getRecordingsDir() {
  return path.join(app.getPath('userData'), 'recordings');
}

/**
 * Turns a stored relative path (e.g. "recordings/2026/11/audio_x.webm", or the older
 * backslash form) into an absolute path, or null if it would escape the recordings folder.
 */
function resolveRecordingPath(relativePath) {
  if (typeof relativePath !== 'string' || !relativePath) return null;

  const root = getRecordingsDir();
  const absolutePath = path.resolve(app.getPath('userData'), relativePath.replace(/^[\\/]+/, ''));
  const fromRoot = path.relative(root, absolutePath);

  if (!fromRoot || fromRoot === '..' || fromRoot.startsWith(`..${path.sep}`) || path.isAbsolute(fromRoot)) {
    return null;
  }
  return absolutePath;
}

async function saveAudioBuffer(buffer) {
  const now = new Date();
  const relativeDir = ['recordings', String(now.getFullYear()), String(now.getMonth() + 1).padStart(2, '0')];
  const filename = `audio_${now.getTime()}_${crypto.randomBytes(3).toString('hex')}.webm`;

  const absoluteDir = path.join(app.getPath('userData'), ...relativeDir);
  await fs.promises.mkdir(absoluteDir, { recursive: true });

  const absolutePath = path.join(absoluteDir, filename);
  // Async write so a long recording doesn't freeze the main process (and with it every window).
  await fs.promises.writeFile(absolutePath, buffer);

  return {
    absolutePath,
    // Forward slashes keep stored paths portable and usable directly in URLs.
    relativePath: [...relativeDir, filename].join('/'),
  };
}

async function deleteRecording(relativePath) {
  const absolutePath = resolveRecordingPath(relativePath);
  if (!absolutePath) return;
  await fs.promises.rm(absolutePath, { force: true });
}

module.exports = { saveAudioBuffer, deleteRecording, resolveRecordingPath, getRecordingsDir };
