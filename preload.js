const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('floatingNotes', {
  loadStore: () => ipcRenderer.invoke('store:load'),
  saveStore: (store) => ipcRenderer.invoke('store:save', store),
  saveStoreSync: (store) => ipcRenderer.sendSync('store:save-sync', store),
  getStorage: () => ipcRenderer.invoke('storage:get'),
  chooseStorageFolder: () => ipcRenderer.invoke('storage:choose-folder'),
  switchStorageFolder: (folderPath) => ipcRenderer.invoke('storage:switch', folderPath),
  migrateStorageFolder: (folderPath) => ipcRenderer.invoke('storage:migrate', folderPath),
  openLink: (url) => ipcRenderer.invoke('link:open', url),
  minimize: () => ipcRenderer.invoke('window:minimize'),
  close: () => ipcRenderer.invoke('window:close')
});
