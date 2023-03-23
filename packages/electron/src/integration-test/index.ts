import { ElectronMainAuthorization } from "../ElectronMain";
import { app, BrowserWindow } from "electron";
import { config } from "dotenv";

config();

const createWindow = () => {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: require.resolve("../renderer/ElectronPreload"),
    },
  });

  win.loadFile("./index.html");
  win.webContents.openDevTools();
};

app.whenReady().then(async () => {
  if (!process.env.clientId)
    throw new Error("Please provide a clientId in env");
  if (!process.env.scope) throw new Error("Please provide a clientId in env");

  createWindow();

  const client = new ElectronMainAuthorization({
    clientId: process.env.clientId,
    scope: process.env.scope,
    redirectUri: "http://localhost:3000/signin-callback",
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
