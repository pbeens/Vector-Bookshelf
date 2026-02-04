const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // We can add secure IPC methods here later
  ping: () => ipcRenderer.invoke('ping'),
  openDirectory: () => ipcRenderer.invoke('dialog:openDirectory'),
  getAppInfo: () => ipcRenderer.invoke('app:getInfo'),
  openPath: (path) => ipcRenderer.invoke('app:openPath', path),
  showItemInFolder: (path) => ipcRenderer.invoke('app:showItemInFolder', path)
});
