import { AccessToken } from "@itwin/core-bentley";
import { contextBridge, ipcRenderer } from "electron";

export interface ElectronAuthIPC {
  signIn(): Promise<void>;
  signOut(): Promise<void>;
  getAccessToken(): Promise<AccessToken>;
  addAccessTokenChangeListener(callback: (event: any, token: AccessToken) => void): void;
}

export const electronIPCChannelName = "itwinjs.electron.auth";

export const frontendElectronAuthApi = {
  async signIn() {
    await ipcRenderer.invoke(`${electronIPCChannelName}.signIn`);
  },
  async signOut() {
    await ipcRenderer.invoke(`${electronIPCChannelName}.signOut`);
  },
  async getAccessToken(): Promise<string> {
    const token = await ipcRenderer.invoke(`${electronIPCChannelName}.getAccessToken`);
    return token;
  },
  async addAccessTokenChangeListener(callback: any) {
    ipcRenderer.on(`${electronIPCChannelName}.onAccessTokenChanged`, callback);
  },
};

// this adds the frontendElectronAuthApi object under the name `window.frontendElectronAuthApi` in the frontend Electron process.
export function registerElectronAuthIPC(){
  contextBridge.exposeInMainWorld("frontendElectronAuthApi", frontendElectronAuthApi);
}
