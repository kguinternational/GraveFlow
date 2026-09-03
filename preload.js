const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('graveflow', {
  getViews:      ()       => ipcRenderer.invoke('get-views'),
  serversReady:  ()       => ipcRenderer.invoke('servers-ready'),
  navigate:      (view)   => ipcRenderer.send('navigate', view),
  onNavigate:    (cb)     => ipcRenderer.on('navigate', (_, view) => cb(view)),
});
