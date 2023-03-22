const { contextBridge, ipcRenderer } = require("electron");

const frontendApi = {
  send(channel, ...data) {
    checkPrefix(channel);
    ipcRenderer.send(channel, ...data);
  },
  addListener(channel, listener) {
    checkPrefix(channel);
    return ipcRenderer.addListener(channel, listener);
  },
  removeListener(channel, listener) {
    return ipcRenderer.removeListener(channel, listener);
  },
  once(channel, listener) {
    checkPrefix(channel);
    return ipcRenderer.once(channel, listener);
  },
  async invoke(channel, ...data) {
    checkPrefix(channel);
    return ipcRenderer.invoke(channel, ...data);
  },
};

// this adds the frontendApi object under the name `window.itwinjs` in the frontend Electron process.
contextBridge.exposeInMainWorld("itwinjs", frontendApi);
