import { app, BrowserWindow, Menu, powerMonitor, session, shell } from 'electron';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  registerDataHandlers,
  runChatHistoryCleanup,
  runStartupBackup,
  setDataListener,
  updateData,
} from './data';
import { runOnce, startScheduler } from './notifications';
import { createTray, destroyTray } from './tray';

const __dirname = dirname(fileURLToPath(import.meta.url));

const APP_USER_MODEL_ID = 'app.toolssubsmanager.desktop';
app.setAppUserModelId(APP_USER_MODEL_ID);

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

let mainWindow: BrowserWindow | null = null;
let isQuitting = false;
let cancelScheduler: (() => void) | null = null;

// Refreshed on every data load/save (see setDataListener below) so the
// synchronous close handler doesn't need I/O.
let minimizeToTrayFlag = true;

/** Show the main window, recreating it if it was closed (macOS keeps the app
 * alive with no window; the tray can also outlive it). */
const showMainWindow = (): void => {
  if (!app.isReady()) return;
  if (!mainWindow || mainWindow.isDestroyed()) createWindow();
  const win = mainWindow;
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
};

const createWindow = (): void => {
  const win = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 640,
    minHeight: 480,
    title: 'Tools & Subs Manager',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      devTools: !app.isPackaged,
    },
  });

  // Hardening: never let in-app content spawn Electron windows or navigate the
  // main frame. Real outbound links go through the validated openExternal IPC.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (url !== win.webContents.getURL()) e.preventDefault();
  });

  win.on('close', (e) => {
    if (isQuitting) return;
    if (minimizeToTrayFlag) {
      e.preventDefault();
      win.hide();
    }
    // Otherwise let it close: window-all-closed quits on Windows/Linux.
  });
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null;
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    void win.loadURL(devUrl);
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'));
  }

  mainWindow = win;
};

setDataListener((data) => {
  minimizeToTrayFlag = data.preferences.notify.minimizeToTray;
});

app.on('second-instance', showMainWindow);

app.on('before-quit', () => {
  isQuitting = true;
});

void app.whenReady().then(() => {
  // A second instance only hands off to the first (via 'second-instance') and
  // quits; it must not touch data, backups, the tray, or the scheduler.
  if (!gotLock) return;

  if (app.isPackaged) {
    // No default menu (it exposes Reload / Toggle DevTools). macOS still needs
    // the app/edit/window menus for Cmd+Q and Cmd+C/V to work.
    Menu.setApplicationMenu(
      process.platform === 'darwin'
        ? Menu.buildFromTemplate([
            { role: 'appMenu' },
            { role: 'editMenu' },
            { role: 'windowMenu' },
          ])
        : null,
    );
  }

  // The renderer needs no browser permissions beyond notifications.
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === 'notifications');
  });

  registerDataHandlers();
  void runStartupBackup();
  void runChatHistoryCleanup();
  createWindow();

  createTray({
    onShow: showMainWindow,
    onCheckNow: () => runOnce(updateData),
  });

  cancelScheduler = startScheduler(updateData);
  // The 6-hour interval doesn't catch up after sleep; check right away on wake.
  powerMonitor.on('resume', () => {
    runOnce(updateData).catch((err) => console.error('Reminder check on resume failed', err));
  });

  app.on('activate', showMainWindow);
});

app.on('window-all-closed', () => {
  // Only reached when the window really closed (minimize-to-tray off, or
  // quitting). macOS convention: the app stays alive until Cmd+Q; elsewhere
  // closing the last window quits.
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  cancelScheduler?.();
  destroyTray();
});
