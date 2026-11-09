'use strict';
const { contextBridge, ipcRenderer } = require('electron');

const info = ipcRenderer.sendSync('overlay:info');
contextBridge.exposeInMainWorld('falconOverlay', {
  url: info.url,
  logo: info.logo,
  strings: info.strings,
  setOpacity: (v) => ipcRenderer.send('overlay:opacity', v),
  toTab: (url) => ipcRenderer.send('overlay:to-tab', url),
  close: () => ipcRenderer.send('overlay:close')
});
