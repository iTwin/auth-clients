import { loadConfig } from "./loadConfig";

const { clientId, envPrefix } = loadConfig();

// Get the user data path that would be returned in app.getPath('userData') if ran in main electron process.
export const getElectronUserDataPath = (): string | undefined => {
  switch (process.platform) {
    case "darwin": // For MacOS
      return `${process.env.HOME}/Library/Application Support/Electron`;
    case "win32": // For Windows
      return `${process.env.APPDATA!}/Electron`;
    case "linux": // For Linux
      return undefined; // Linux uses the same path for both main and renderer processes, no need to manually resolve path.
    default:
      return process.cwd();
  }
};

export const getTokenStoreFileName = (): string => `iTwinJs _${clientId}`;

export const getTokenStoreKey = (issuerUrl?: string): string => {
  const authority = new URL(issuerUrl ?? "https://ims.bentley.com");
  if (envPrefix && !issuerUrl) {
    authority.hostname = envPrefix + authority.hostname;
  }
  issuerUrl = authority.href.replace(/\/$/, "");
  return `${getTokenStoreFileName()}:${issuerUrl}`;
};
