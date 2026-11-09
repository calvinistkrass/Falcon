'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('falconAuth', {
  request: () => ipcRenderer.invoke('passkey-window:request'),
  finish: (result) => ipcRenderer.invoke('passkey-window:finish', result),
  cancel: () => ipcRenderer.send('passkey-window:cancel')
});
