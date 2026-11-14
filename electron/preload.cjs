const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('quickCapture', {
  app: {
    setMode: (mode) => ipcRenderer.invoke('app:set-mode', mode),
    hideWidget: () => ipcRenderer.invoke('app:hide-widget'),
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
    getUrl: (relativePath) => ipcRenderer.invoke('audio:get-url', relativePath),
  },
});
