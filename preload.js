const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('floatingNotes', {
  loadStore: () => ipcRenderer.invoke('store:load'),
  saveStore: (store) => ipcRenderer.invoke('store:save', store),
  saveStoreSync: (store) => ipcRenderer.sendSync('store:save-sync', store),
  minimize: () => ipcRenderer.invoke('window:minimize'),
  close: () => ipcRenderer.invoke('window:close')
});
