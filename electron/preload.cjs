const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('quickCapture', {
  app: {
    setMode: (mode) => ipcRenderer.invoke('app:set-mode', mode),
    hideWidget: () => ipcRenderer.invoke('app:hide-widget'),
    minimize: () => ipcRenderer.invoke('app:minimize'),
    getShortcuts: () => ipcRenderer.invoke('app:get-shortcuts'),
    onTrayAction: (callback) => {
      const channel = 'tray:action';
      const listener = (_, payload) => callback(payload);
      ipcRenderer.on(channel, listener);
      return () => ipcRenderer.removeListener(channel, listener);
    },
  },
  notes: {
    list: (filters) => ipcRenderer.invoke('notes:list', filters),
    create: (payload) => ipcRenderer.invoke('notes:create', payload),
    update: (id, payload) => ipcRenderer.invoke('notes:update', id, payload),
    delete: (id) => ipcRenderer.invoke('notes:delete', id),
  },
  audio: {
    save: (arrayBuffer, title, durationSeconds) =>
      ipcRenderer.invoke('audio:save', arrayBuffer, title, durationSeconds),
  },
  todos: {
    list: (day) => ipcRenderer.invoke('todos:list', day),
    create: (day, text) => ipcRenderer.invoke('todos:create', day, text),
    update: (id, patch) => ipcRenderer.invoke('todos:update', id, patch),
    delete: (id) => ipcRenderer.invoke('todos:delete', id),
    clearDone: (day) => ipcRenderer.invoke('todos:clear-done', day),
    openBefore: (day) => ipcRenderer.invoke('todos:open-before', day),
    carryOver: (day) => ipcRenderer.invoke('todos:carry-over', day),
  },
  files: {
    showInFolder: (relativePath) => ipcRenderer.invoke('files:show-in-folder', relativePath),
    openDataFolder: () => ipcRenderer.invoke('files:open-data-folder'),
    openRecordingsFolder: () => ipcRenderer.invoke('files:open-recordings-folder'),
  },
});
