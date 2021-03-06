/* eslint global-require: off, no-console: off, promise/always-return: off */

/**
 * This module executes inside of electron's main process. You can start
 * electron renderer process from here and communicate with the other processes
 * through IPC.
 *
 * When running `npm run build` or `npm run build:main`, this file is compiled to
 * `./src/main.js` using webpack. This gives us some performance wins.
 */
import 'core-js/stable';
import 'regenerator-runtime/runtime';
import path from 'path';
import { app, BrowserWindow, shell, ipcMain, dialog } from 'electron';
import { autoUpdater } from 'electron-updater';
import log from 'electron-log';
import { execSync } from 'child_process';
import { InstallData, ProjectData } from 'renderer/common/types';
import MenuBuilder from './menu';
import { resolveHtmlPath } from './util';
import store, { STORE_KEYS } from './store';

export default class AppUpdater {
  constructor() {
    log.transports.file.level = 'info';
    autoUpdater.logger = log;
    autoUpdater.checkForUpdatesAndNotify();
  }
}

let mainWindow: BrowserWindow | null = null;

/**
 * IPC API
 * This is where we use native/server-side platform APIs (like NodeJS modules)
 */

ipcMain.on('ipc-example', async (event, arg) => {
  const msgTemplate = (pingPong: string) => `IPC test: ${pingPong}`;
  console.log(msgTemplate(arg));
  event.reply('ipc-example', msgTemplate('pong'));
});

ipcMain.handle('dialog:open', async (_, args) => {
  const result = await dialog.showOpenDialog({ properties: ['openFile'] });
  return result;
});

ipcMain.handle('store:installs', async (_, newInstall: InstallData) => {
  const prevInstalls = store.get(STORE_KEYS.INSTALLS);
  store.set(STORE_KEYS.INSTALLS, [...prevInstalls, newInstall]);
  const result = await dialog.showOpenDialog({ properties: ['openFile'] });
  return result;
});

ipcMain.handle('store:projects', async (_, newInstall: ProjectData) => {
  const prevInstalls = store.get(STORE_KEYS.PROJECTS);
  store.set(STORE_KEYS.PROJECZTS, [...prevInstalls, newInstall]);
});

/**
 * Blender CLI works with .exe, but needs changing for .app
 * @see: https://docs.blender.org/manual/en/latest/advanced/command_line/launch/macos.html
 */
const checkMacBlender = (blenderPath: string) => {
  let newPath = blenderPath;
  if (blenderPath.includes('.app')) {
    newPath = `${newPath}/Contents/MacOS/Blender`;
  }
  return newPath;
};

ipcMain.handle('blender:version', async (_, args) => {
  console.log('running cli', _, args);
  let result;
  if (args) {
    const blenderExecutable = checkMacBlender(args);
    // If MacOS, we need to change path to make executable
    const checkVersionCommand = `${blenderExecutable} -v`;

    result = execSync(checkVersionCommand).toString();
  }
  return result;
});

ipcMain.handle('blender:open', async (_, filePath, blenderPath) => {
  console.log('running blender open', _, filePath, blenderPath);
  let result;
  if (filePath && blenderPath) {
    const blenderExecutable = checkMacBlender(blenderPath);
    // If MacOS, we need to change path to make executable
    const openFileCommand = `${blenderExecutable} ${filePath}`;

    result = execSync(openFileCommand).toString();
  }
  return result;
});

// File Explorer
ipcMain.handle('file:open', async (_, filePath) => {
  console.log('running folder open', _, filePath);
  let result;
  if (filePath) {
    // @TODO: maybe try/catch?
    shell.showItemInFolder(filePath);
  }
  return true;
});

if (process.env.NODE_ENV === 'production') {
  const sourceMapSupport = require('source-map-support');
  sourceMapSupport.install();
}

const isDevelopment =
  process.env.NODE_ENV === 'development' || process.env.DEBUG_PROD === 'true';

if (isDevelopment) {
  require('electron-debug')();
}

const installExtensions = async () => {
  const installer = require('electron-devtools-installer');
  const forceDownload = !!process.env.UPGRADE_EXTENSIONS;
  const extensions = ['REACT_DEVELOPER_TOOLS'];

  return installer
    .default(
      extensions.map((name) => installer[name]),
      forceDownload
    )
    .catch(console.log);
};

const createWindow = async () => {
  if (isDevelopment) {
    await installExtensions();
  }

  const RESOURCES_PATH = app.isPackaged
    ? path.join(process.resourcesPath, 'assets')
    : path.join(__dirname, '../../assets');

  const getAssetPath = (...paths: string[]): string => {
    return path.join(RESOURCES_PATH, ...paths);
  };

  mainWindow = new BrowserWindow({
    show: false,
    width: 1024,
    height: 728,
    icon: getAssetPath('icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  mainWindow.loadURL(resolveHtmlPath('index.html'));

  mainWindow.on('ready-to-show', () => {
    if (!mainWindow) {
      throw new Error('"mainWindow" is not defined');
    }
    if (process.env.START_MINIMIZED) {
      mainWindow.minimize();
    } else {
      mainWindow.show();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  const menuBuilder = new MenuBuilder(mainWindow);
  menuBuilder.buildMenu();

  // Open urls in the user's browser
  mainWindow.webContents.on('new-window', (event, url) => {
    event.preventDefault();
    shell.openExternal(url);
  });

  // Remove this if your app does not use auto updates
  // eslint-disable-next-line
  new AppUpdater();
};

/**
 * Add event listeners...
 */

app.on('window-all-closed', () => {
  // Respect the OSX convention of having the application in memory even
  // after all windows have been closed
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app
  .whenReady()
  .then(() => {
    createWindow();
    app.on('activate', () => {
      // On macOS it's common to re-create a window in the app when the
      // dock icon is clicked and there are no other windows open.
      if (mainWindow === null) createWindow();
    });
  })
  .catch(console.log);
