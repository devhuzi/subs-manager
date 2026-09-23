import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import type { AppData } from '../shared/types';

const DATA_FILE = 'subs-manager.json';
const BACKUPS_DIR = 'backups';
const KEEP = 10;

// Daily and manual backups rotate separately, so a burst of "Back up now"
// clicks can't push out the daily history (and vice versa).
const DAILY_RE = /^subs-manager-\d{4}-\d{2}-\d{2}\.json$/;
const MANUAL_RE = /^subs-manager-\d{4}-\d{2}-\d{2}-\d{6}\.json$/;

/** Parses a data-file body; null unless it is a JSON object. */
export const parseDataText = (text: string): AppData | null => {
  try {
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed as AppData;
  } catch {
    return null;
  }
};

export const backupsDir = (dataDir: string): string => join(dataDir, BACKUPS_DIR);

const pad = (n: number): string => String(n).padStart(2, '0');

const dayStamp = (d: Date): string =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const timeStamp = (d: Date): string =>
  `${dayStamp(d)}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;

const prune = async (dir: string, pattern: RegExp): Promise<void> => {
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return;
  }
  const candidates = entries.filter((f) => pattern.test(f));
  if (candidates.length <= KEEP) return;
  // Order by actual write time so the genuinely-oldest files are removed.
  const withMtime = await Promise.all(
    candidates.map(async (f) => ({ f, mtime: (await fs.stat(join(dir, f))).mtimeMs })),
  );
  withMtime.sort((a, b) => a.mtime - b.mtime); // oldest first
  const excess = withMtime.length - KEEP;
  for (const { f } of withMtime.slice(0, excess)) {
    await fs.rm(join(dir, f), { force: true });
  }
};

const copyTo = async (
  dataDir: string,
  fileName: string,
  pattern: RegExp,
): Promise<string | null> => {
  let text: string;
  try {
    text = await fs.readFile(join(dataDir, DATA_FILE), 'utf8');
  } catch {
    return null; // nothing to back up yet
  }
  // Never back up a corrupt file — it would rotate out a good backup.
  if (!parseDataText(text)) {
    console.error('Skipping backup: data file does not parse');
    return null;
  }
  const dir = backupsDir(dataDir);
  await fs.mkdir(dir, { recursive: true });
  const dest = join(dir, fileName);
  await fs.writeFile(dest, text, 'utf8');
  await prune(dir, pattern);
  return dest;
};

/** Once-per-day backup. No-op if today's already exists. Returns the path written, or null. */
export const writeDailyBackup = async (
  dataDir: string,
  now: Date = new Date(),
): Promise<string | null> => {
  const fileName = `subs-manager-${dayStamp(now)}.json`;
  const dir = backupsDir(dataDir);
  try {
    await fs.access(join(dir, fileName));
    return null; // already backed up today
  } catch {
    // not yet — fall through
  }
  return copyTo(dataDir, fileName, DAILY_RE);
};

/** On-demand timestamped backup. Returns the path written, or null if no data file. */
export const backupNow = async (
  dataDir: string,
  now: Date = new Date(),
): Promise<string | null> =>
  copyTo(dataDir, `subs-manager-${timeStamp(now)}.json`, MANUAL_RE);

/**
 * Newest backup (daily or manual, by write time) that parses, or null. Used to
 * auto-restore after the live data file turns out to be corrupt.
 */
export const findLatestValidBackup = async (
  dataDir: string,
): Promise<{ fileName: string; data: AppData } | null> => {
  const dir = backupsDir(dataDir);
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return null;
  }
  const candidates = await Promise.all(
    entries
      .filter((f) => DAILY_RE.test(f) || MANUAL_RE.test(f))
      .map(async (f) => ({ f, mtime: (await fs.stat(join(dir, f))).mtimeMs })),
  );
  candidates.sort((a, b) => b.mtime - a.mtime); // newest first
  for (const { f } of candidates) {
    const data = parseDataText(await fs.readFile(join(dir, f), 'utf8').catch(() => ''));
    if (data) return { fileName: f, data };
  }
  return null;
};

export interface BackupInfo {
  fileName: string;
  modifiedAt: string;
}

export const listBackups = async (dataDir: string): Promise<BackupInfo[]> => {
  const dir = backupsDir(dataDir);
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return [];
  }
  const infos: BackupInfo[] = [];
  for (const f of entries) {
    if (!f.startsWith('subs-manager-') || !f.endsWith('.json')) continue;
    const stat = await fs.stat(join(dir, f));
    infos.push({ fileName: f, modifiedAt: stat.mtime.toISOString() });
  }
  return infos.sort((a, b) => b.fileName.localeCompare(a.fileName));
};
