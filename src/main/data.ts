import {
  app,
  dialog,
  ipcMain,
  shell,
  BrowserWindow,
  type MessageBoxOptions,
} from 'electron';
import { randomUUID } from 'node:crypto';
import { constants as fsConstants, promises as fs } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  defaultPreferences,
  type AiChatRequest,
  type AppData,
  type FileFilter,
  type FxRates,
  type ImportedFile,
} from '../shared/types';
import { runOnce } from './notifications';
import { getRates, refreshRates } from './fx';
import { fetchLogoDataUrl } from './logos';
import { aiChat, fetchModelPricing } from './ai';
import {
  clearKey,
  hasKey,
  isSecureStorageAvailable,
  NoSecureStorageError,
  setKey,
} from './aiCredentials';
import { purgeChatHistory } from './chatHistory';
import { migrate } from './migrate';
import {
  backupNow,
  backupsDir,
  findLatestValidBackup,
  listBackups,
  parseDataText,
  writeDailyBackup,
} from './backup';
import { mergeFiredAlerts } from './firedAlerts';

const SETTINGS_FILE = 'settings.json';
const DATA_FILE = 'subs-manager.json';
const RATES_FILE = 'rates.json';

interface Settings {
  dataDir: string;
}

const emptyData = (): AppData => ({
  version: 1,
  subscriptions: [],
  oneTimePurchases: [],
  categories: [],
  preferences: defaultPreferences(),
  cancellationLog: [],
});

const settingsPath = (): string => join(app.getPath('userData'), SETTINGS_FILE);

const defaultDataDir = (): string => join(app.getPath('userData'), 'data');

const readJson = async <T>(path: string): Promise<T | null> => {
  try {
    const text = await fs.readFile(path, 'utf8');
    return JSON.parse(text) as T;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
};

const RENAME_RETRIES = 5;
// Windows (antivirus, OneDrive, the search indexer) briefly locks freshly
// written files; these codes are transient there.
const TRANSIENT_FS_CODES = new Set(['EPERM', 'EBUSY', 'EACCES']);

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

const writeJsonAtomic = async (path: string, value: unknown): Promise<void> => {
  // Unique temp name per write so two concurrent atomic writes to the same
  // target don't stage onto a shared `.tmp` and clobber each other.
  const tmp = `${path}.${randomUUID()}.tmp`;
  try {
    const fh = await fs.open(tmp, 'w');
    try {
      await fh.writeFile(JSON.stringify(value, null, 2), 'utf8');
      // Flush before the rename so a power loss can't leave the target
      // pointing at a renamed-but-empty file.
      await fh.sync();
    } finally {
      await fh.close();
    }
    for (let attempt = 0; ; attempt++) {
      try {
        await fs.rename(tmp, path);
        return;
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code ?? '';
        if (attempt >= RENAME_RETRIES || !TRANSIENT_FS_CODES.has(code)) throw err;
        await sleep(50 * 2 ** attempt);
      }
    }
  } catch (err) {
    await fs.rm(tmp, { force: true }).catch(() => undefined);
    throw err;
  }
};

const loadSettings = async (): Promise<Settings> => {
  // A corrupt or hand-edited settings.json must not break every IPC call —
  // fall back to the default data dir instead.
  try {
    const s = await readJson<Partial<Settings>>(settingsPath());
    if (s && typeof s.dataDir === 'string' && s.dataDir) return { dataDir: s.dataDir };
  } catch (err) {
    console.error('settings.json unreadable; using defaults', err);
  }
  return { dataDir: defaultDataDir() };
};

const saveSettings = async (s: Settings): Promise<void> => {
  await writeJsonAtomic(settingsPath(), s);
};

export const getDataDir = async (): Promise<string> => (await loadSettings()).dataDir;

/** Run a once-per-day backup of the data file. Called on app launch. */
export const runStartupBackup = async (): Promise<void> => {
  try {
    await writeDailyBackup(await getDataDir());
  } catch (err) {
    console.error('Daily backup failed', err);
  }
};

/** Delete any leftover AI chat history from older persisting builds. */
export const runChatHistoryCleanup = async (): Promise<void> => {
  try {
    await purgeChatHistory(await getDataDir());
  } catch (err) {
    console.error('Chat history cleanup failed', err);
  }
};

const showMessage = (opts: MessageBoxOptions): void => {
  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
  void (win ? dialog.showMessageBox(win, opts) : dialog.showMessageBox(opts));
};

/**
 * The data file exists but doesn't parse. Move it aside (never delete — the
 * user may want it), restore the newest backup that parses, and tell the user.
 * Returns the restored data, or null to start empty.
 */
const recoverCorruptData = async (dir: string): Promise<AppData | null> => {
  const path = join(dir, DATA_FILE);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const corruptPath = join(dir, `subs-manager.corrupt-${stamp}.json`);
  await fs.rename(path, corruptPath);
  const backup = await findLatestValidBackup(dir);
  if (backup) await writeJsonAtomic(path, backup.data);
  console.error(`Corrupt data file moved to ${corruptPath}; restored: ${backup?.fileName ?? 'none'}`);
  showMessage({
    type: 'warning',
    title: 'Data file was damaged',
    message: backup
      ? `Your data file couldn't be read, so it was restored from the backup "${backup.fileName}". Changes made after that backup may be missing.`
      : "Your data file couldn't be read and no usable backup was found, so the app started with empty data.",
    detail: `The damaged file was kept at:\n${corruptPath}`,
  });
  return backup?.data ?? null;
};

const readDataFile = async (dir: string): Promise<AppData | null> => {
  let text: string;
  try {
    text = await fs.readFile(join(dir, DATA_FILE), 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
  return parseDataText(text) ?? recoverCorruptData(dir);
};

/** Notified with every loaded or written AppData (index.ts caches prefs from it). */
let dataListener: ((data: AppData) => void) | null = null;

export const setDataListener = (listener: (data: AppData) => void): void => {
  dataListener = listener;
};

/**
 * Serializes every access to subs-manager.json. The renderer's data:save, the
 * notification scheduler, and "check renewals now" can all fire concurrently;
 * running each whole load→mutate→save inside one queue slot prevents one from
 * clobbering another's changes. Loads are queued too so a read never observes
 * a half-finished corrupt-file recovery.
 */
let dataQueue: Promise<unknown> = Promise.resolve();

const enqueue = <T>(task: () => Promise<T>): Promise<T> => {
  // Swallow prior errors so one failure doesn't wedge the chain, but still
  // surface this call's own result to the caller.
  const result = dataQueue.then(task, task);
  dataQueue = result.catch(() => undefined);
  return result;
};

const loadDataUnqueued = async (): Promise<AppData> => {
  const dir = await getDataDir();
  const data = await readDataFile(dir);
  const migrated = data ? migrate(data) : emptyData();
  // Reconcile the cached `hasKey` against the actual encrypted file on disk —
  // catches the case where the file was deleted externally or never existed.
  const keyPresent = await hasKey();
  migrated.preferences.aiAssistant.hasKey = keyPresent;
  if (!keyPresent) migrated.preferences.aiAssistant.enabled = false;
  dataListener?.(migrated);
  return migrated;
};

const writeDataUnqueued = async (data: AppData): Promise<void> => {
  const dir = await getDataDir();
  await fs.mkdir(dir, { recursive: true });
  await writeJsonAtomic(join(dir, DATA_FILE), data);
  dataListener?.(data);
};

export const loadData = (): Promise<AppData> => enqueue(loadDataUnqueued);

/** Renderer save. `firedAlerts` is main-owned, so keys already on disk are
 * merged in rather than overwritten by the renderer's older snapshot. */
export const saveData = (data: AppData): Promise<void> =>
  enqueue(async () => {
    const onDisk = await readJson<AppData>(join(await getDataDir(), DATA_FILE)).catch(
      () => null,
    );
    await writeDataUnqueued(mergeFiredAlerts(data, onDisk));
  });

/**
 * Load, mutate, and save atomically with respect to every other data access.
 * `mutate` returns the next data to persist, or null to skip the write.
 */
export const updateData = (mutate: (data: AppData) => AppData | null): Promise<void> =>
  enqueue(async () => {
    const next = mutate(await loadDataUnqueued());
    if (next) await writeDataUnqueued(next);
  });

export const loadRates = async (): Promise<FxRates | null> => {
  const dir = await getDataDir();
  return readJson<FxRates>(join(dir, RATES_FILE));
};

export const saveRates = async (rates: FxRates): Promise<void> => {
  const dir = await getDataDir();
  await fs.mkdir(dir, { recursive: true });
  await writeJsonAtomic(join(dir, RATES_FILE), rates);
};

const chooseDataDir = async (): Promise<string | null> => {
  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
  const result = win
    ? await dialog.showOpenDialog(win, {
        title: 'Choose data directory',
        properties: ['openDirectory', 'createDirectory'],
      })
    : await dialog.showOpenDialog({
        title: 'Choose data directory',
        properties: ['openDirectory', 'createDirectory'],
      });
  if (result.canceled || result.filePaths.length === 0) return null;
  const chosen = result.filePaths[0];
  const current = await getDataDir();
  if (resolve(chosen) === resolve(current)) return chosen;

  try {
    // Prove the folder is writable before committing to it.
    const probe = join(chosen, `.write-test-${randomUUID()}`);
    await fs.writeFile(probe, '');
    await fs.rm(probe, { force: true });
  } catch (err) {
    showMessage({
      type: 'error',
      title: 'Folder not writable',
      message: "The app can't save data in that folder. Your data location was not changed.",
      detail: (err as Error).message,
    });
    return null;
  }

  let adoptedExisting: boolean;
  try {
    // Inside the queue so no in-flight save lands in the old dir mid-switch.
    adoptedExisting = await enqueue(async () => {
      let adopted = false;
      try {
        // COPYFILE_EXCL: never overwrite data that already lives there.
        await fs.copyFile(
          join(current, DATA_FILE),
          join(chosen, DATA_FILE),
          fsConstants.COPYFILE_EXCL,
        );
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code;
        if (code === 'EEXIST') adopted = true;
        else if (code !== 'ENOENT') throw err; // ENOENT: nothing to carry over yet
      }
      await saveSettings({ dataDir: chosen });
      return adopted;
    });
  } catch (err) {
    showMessage({
      type: 'error',
      title: "Couldn't move your data",
      message: 'Copying your data to the new folder failed. Your data location was not changed.',
      detail: (err as Error).message,
    });
    return null;
  }

  if (adoptedExisting) {
    showMessage({
      type: 'info',
      title: 'Using existing data',
      message:
        'That folder already contains Tools & Subs Manager data, so the app now uses it. Your previous data was left untouched.',
      detail: `Previous location:\n${current}`,
    });
  }
  return chosen;
};

const saveFile = async (
  defaultName: string,
  content: string,
  filters: FileFilter[],
): Promise<string | null> => {
  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
  const opts = { defaultPath: defaultName, filters };
  const result = win
    ? await dialog.showSaveDialog(win, opts)
    : await dialog.showSaveDialog(opts);
  if (result.canceled || !result.filePath) return null;
  await fs.writeFile(result.filePath, content, 'utf8');
  return result.filePath;
};

const openFile = async (filters: FileFilter[]): Promise<ImportedFile | null> => {
  const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
  const opts = { properties: ['openFile' as const], filters };
  const result = win
    ? await dialog.showOpenDialog(win, opts)
    : await dialog.showOpenDialog(opts);
  if (result.canceled || result.filePaths.length === 0) return null;
  const path = result.filePaths[0];
  const content = await fs.readFile(path, 'utf8');
  return { path, content };
};

export const registerDataHandlers = (): void => {
  ipcMain.handle('data:getDir', () => getDataDir());
  ipcMain.handle('data:chooseDir', () => chooseDataDir());
  ipcMain.handle('data:load', () => loadData());
  ipcMain.handle('data:save', (_e, data: AppData) => saveData(data));
  ipcMain.handle(
    'data:saveFile',
    (_e, defaultName: string, content: string, filters: FileFilter[]) =>
      saveFile(defaultName, content, filters),
  );
  ipcMain.handle('data:openFile', (_e, filters: FileFilter[]) => openFile(filters));
  ipcMain.handle('system:openExternal', async (_e, url: string) => {
    if (!url || typeof url !== 'string') return;
    const normalized = /^[a-z]+:\/\//i.test(url) ? url : `https://${url}`;
    // Only ever open web links. Reject file://, custom URI handlers, etc.
    let scheme: string;
    try {
      scheme = new URL(normalized).protocol;
    } catch {
      return;
    }
    if (scheme !== 'https:' && scheme !== 'http:') return;
    await shell.openExternal(normalized);
  });
  ipcMain.handle('system:checkRemindersNow', () => runOnce(updateData));
  ipcMain.handle('fx:getRates', async () => {
    const data = await loadData();
    return getRates(data.preferences.defaultCurrency);
  });
  ipcMain.handle('fx:refreshRates', async () => {
    const data = await loadData();
    if (!data.preferences.defaultCurrency) return null;
    return refreshRates(data.preferences.defaultCurrency);
  });
  ipcMain.handle('logo:fetch', async (_e, website: string) => fetchLogoDataUrl(website));
  ipcMain.handle('ai:chat', async (e, request: AiChatRequest) => aiChat(request, e.sender));
  ipcMain.handle('ai:setKey', async (_e, key: string) => {
    const trimmed = typeof key === 'string' ? key.trim() : '';
    if (!trimmed) return { ok: false, reason: 'empty-key' as const };
    try {
      await setKey(trimmed);
      return { ok: true as const };
    } catch (err) {
      if (err instanceof NoSecureStorageError) {
        return { ok: false, reason: 'no-secure-storage' as const };
      }
      throw err;
    }
  });
  ipcMain.handle('ai:clearKey', async () => {
    await clearKey();
    return { ok: true as const };
  });
  ipcMain.handle('ai:hasKey', async () => ({ hasKey: await hasKey() }));
  ipcMain.handle('ai:isSecureStorageAvailable', async () => isSecureStorageAvailable());
  ipcMain.handle('ai:fetchModelPricing', async () => fetchModelPricing());
  ipcMain.handle('backup:now', async () => {
    const path = await backupNow(await getDataDir());
    return { ok: Boolean(path), path };
  });
  ipcMain.handle('backup:list', async () => listBackups(await getDataDir()));
  ipcMain.handle('backup:openFolder', async () => {
    const dir = backupsDir(await getDataDir());
    await fs.mkdir(dir, { recursive: true });
    await shell.openPath(dir);
  });
};
