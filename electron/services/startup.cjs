const { app } = require('electron');

// Started at login with --hidden, so the app waits quietly in the tray instead of popping up.
function loginItemOptions() {
  return {
    path: process.execPath,
    // When run from source (npm), Electron needs the app folder; an installed build is its own exe.
    args: app.isPackaged ? ['--hidden'] : [app.getAppPath(), '--hidden'],
  };
}

function isLaunchAtLoginEnabled() {
  const settings = app.getLoginItemSettings(loginItemOptions());
  // Windows: matches our entry by exe + args regardless of its name (openAtLogin only checks the
  // default name) and is false if the user disabled it in Task Manager. macOS: openAtLogin.
  return settings.executableWillLaunchAtLogin ?? settings.openAtLogin;
}

function setLaunchAtLogin(enabled) {
  // `name` is what Windows shows under Task Manager > Startup apps (default would be "electron.app.Electron").
  app.setLoginItemSettings({ openAtLogin: enabled, name: 'QuickCapture', ...loginItemOptions() });
}

module.exports = { isLaunchAtLoginEnabled, setLaunchAtLogin };
