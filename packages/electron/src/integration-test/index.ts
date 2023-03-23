import { ElectronMainAuthorization } from "../ElectronMain";

const { app, BrowserWindow } = require("electron");
const path = require("path");

const createWindow = () => {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      devTools: true,
    },
  });

  win.loadFile("./index.html");
  win.webContents.openDevTools();
};

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
  const client = new ElectronMainAuthorization({ clientId: "", scope: "" });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
