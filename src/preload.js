'use strict';
// Sichere Brücke zwischen Hauptprozess und Falcon-Oberfläche

const { contextBridge, ipcRenderer } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');
const pkg = require('../package.json');

const fileUrl = (...p) => pathToFileURL(path.join(__dirname, ...p)).href;
const CHANNELS = ['open-tab', 'search-tab', 'shortcut', 'win-state', 'blocked-count', 'download', 'pw-offer', 'page-context-menu', 'update-status', 'passkey-prompt'];

contextBridge.exposeInMainWorld('falcon', {
  platform: process.platform,
  version: pkg.version,
  versions: { electron: process.versions.electron, chrome: process.versions.chrome, node: process.versions.node },
  newTabUrl: fileUrl('ui', 'newtab.html'),
  webviewPreloadUrl: fileUrl('webview-preload.js'),
  logoUrl: fileUrl('..', 'assets', 'falcon.png'),

  win: (action) => ipcRenderer.send('win', action),
  overlayDim: (dim) => ipcRenderer.send('overlay-dim', !!dim),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (patch) => ipcRenderer.invoke('settings:set', patch),
  metrics: () => ipcRenderer.invoke('metrics'),
  openPath: (p) => ipcRenderer.invoke('open-external', p),
  showInFolder: (p) => ipcRenderer.invoke('show-in-folder', p),
  cancelDownload: (id) => ipcRenderer.invoke('download:cancel', id),
  clearData: () => ipcRenderer.invoke('clear-data'),
  copy: (text) => ipcRenderer.invoke('copy', text),
  fetchImage: (url) => ipcRenderer.invoke('image:fetch', url),
  writeImage: (png) => ipcRenderer.invoke('image:write', png),
  authAvailable: () => ipcRenderer.invoke('auth:available'),
  answerPasskeyPrompt: (id, ok) => ipcRenderer.send('passkey-prompt:answer', id, !!ok),
  updates: {
    status: () => ipcRenderer.invoke('update:status'),
    check: () => ipcRenderer.invoke('update:check'),
    download: () => ipcRenderer.send('update:download'),
    install: () => ipcRenderer.send('update:install')
  },
  passkeys: {
    list: () => ipcRenderer.invoke('passkey:list'),
    register: () => ipcRenderer.invoke('passkey:register'),
    remove: (id) => ipcRenderer.invoke('passkey:remove', id)
  },
  replaceMisspelling: (id, word) => ipcRenderer.invoke('webview:replace-misspelling', id, word),
  addToDictionary: (word) => ipcRenderer.invoke('webview:add-to-dictionary', word),

  bookmarks: {
    import: () => ipcRenderer.invoke('bookmarks:import'),
    export: () => ipcRenderer.invoke('bookmarks:export')
  },
  passwords: {
    list: () => ipcRenderer.invoke('pw:list'),
    reveal: (id) => ipcRenderer.invoke('pw:reveal', id),
    fill: (webContentsId, id) => ipcRenderer.invoke('pw:fill', webContentsId, id),
    remove: (id) => ipcRenderer.invoke('pw:delete', id),
    update: (id, patch) => ipcRenderer.invoke('pw:update', id, patch),
    add: (entry) => ipcRenderer.invoke('pw:add', entry),
    answer: (id, answer) => ipcRenderer.invoke('pw:offer-answer', id, answer),
    removeNever: (origin) => ipcRenderer.invoke('pw:never-remove', origin),
    import: () => ipcRenderer.invoke('pw:import'),
    export: () => ipcRenderer.invoke('pw:export')
  },

  on: (channel, fn) => {
    if (CHANNELS.includes(channel)) ipcRenderer.on(channel, (_e, data) => fn(data));
  }
});
