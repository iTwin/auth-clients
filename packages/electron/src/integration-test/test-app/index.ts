import { ElectronMainAuthorization } from "../../main/Client";
import { app, BrowserWindow } from "electron";
import { config } from "dotenv";

config();

const createWindow = () => {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: require.resolve("../../renderer/ElectronPreload"),
    },
  });

  void win.loadFile("./index.html");
  // win.webContents.openDevTools();
};

void app.whenReady().then(async () => {
  if (!process.env.IMJS_TEST_ELECTRON_CLIENT_ID)
    throw new Error("Please provide a clientId in env");
  if (!process.env.IMJS_TEST_ELECTRON_SCOPES)
    throw new Error("Please provide scopes in env");

  createWindow();

  new ElectronMainAuthorization({
    clientId: process.env.IMJS_TEST_ELECTRON_CLIENT_ID,
    scopes: process.env.IMJS_TEST_ELECTRON_SCOPES,
    redirectUris: ["http://localhost:3000/signin-callback"],
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0)
      createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin")
    app.quit();
});
