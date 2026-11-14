const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');

function saveAudioBuffer(buffer) {
  const now = new Date();
  const folder = path.join(
    app.getPath('userData'),
    'recordings',
    String(now.getFullYear()),
    String(now.getMonth() + 1).padStart(2, '0')
  );

  fs.mkdirSync(folder, { recursive: true });

  const filename = `audio_${now.getTime()}.webm`;
  const absolutePath = path.join(folder, filename);

  fs.writeFileSync(absolutePath, buffer);

  return {
    absolutePath,
    relativePath: path.relative(app.getPath('userData'), absolutePath),
  };
}

module.exports = { saveAudioBuffer };
