import { IpcRendererEvent } from "electron";
import { ITwinElectronApi } from "../renderer/ElectronPreload";

const { contextBridge, ipcRenderer } = require("electron");

function checkPrefix(channel: string) {
  if (!channel.startsWith("itwin."))
    throw new Error(`illegal channel name '${channel}'`);
}
type ElectronListener = (event: IpcRendererEvent, ...args: any[]) => void;

const frontendApi: ITwinElectronApi = {
  send(channel: string, ...data: any[]) {
    checkPrefix(channel);
    ipcRenderer.send(channel, ...data);
  },
  addListener(channel: string, listener: ElectronListener) {
    checkPrefix(channel);
    return ipcRenderer.addListener(channel, listener);
  },
  removeListener(channel: string, listener: ElectronListener) {
    return ipcRenderer.removeListener(channel, listener);
  },
  once(channel: string, listener: ElectronListener) {
    checkPrefix(channel);
    return ipcRenderer.once(channel, listener);
  },
  async invoke(channel: string, ...data: any[]): Promise<any> {
    checkPrefix(channel);
    return ipcRenderer.invoke(channel, ...data);
  },
};

// this adds the frontendApi object under the name `window.itwinjs` in the frontend Electron process.
contextBridge.exposeInMainWorld("itwinjs", frontendApi);
