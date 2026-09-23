import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { backupNow, backupsDir, findLatestValidBackup, writeDailyBackup } from './backup';

let dataDir: string;

beforeEach(async () => {
  dataDir = await fs.mkdtemp(join(tmpdir(), 'subs-backup-'));
});

afterEach(async () => {
  await fs.rm(dataDir, { recursive: true, force: true });
});

const writeData = (text: string): Promise<void> =>
  fs.writeFile(join(dataDir, 'subs-manager.json'), text, 'utf8');

const listDir = async (): Promise<string[]> => (await fs.readdir(backupsDir(dataDir))).sort();

describe('backups', () => {
  it('skips backing up a data file that does not parse', async () => {
    await writeData('{ truncated');
    expect(await writeDailyBackup(dataDir)).toBeNull();
    expect(await backupNow(dataDir)).toBeNull();
  });

  it('rotates daily and manual backups separately (10 each)', async () => {
    await writeData('{"subscriptions":[]}');
    for (let d = 1; d <= 12; d++) {
      await writeDailyBackup(dataDir, new Date(2026, 0, d));
      await backupNow(dataDir, new Date(2026, 1, 1, 10, 0, d));
    }
    const files = await listDir();
    expect(files.filter((f) => /^subs-manager-\d{4}-\d{2}-\d{2}\.json$/.test(f))).toHaveLength(10);
    expect(files.filter((f) => /-\d{6}\.json$/.test(f))).toHaveLength(10);
  });

  it('finds the newest backup that parses, skipping corrupt ones', async () => {
    const dir = backupsDir(dataDir);
    await fs.mkdir(dir, { recursive: true });
    const older = join(dir, 'subs-manager-2026-01-01.json');
    const newer = join(dir, 'subs-manager-2026-01-02.json');
    await fs.writeFile(older, '{"subscriptions":[{"id":"ok"}]}');
    await fs.writeFile(newer, 'not json');
    await fs.utimes(older, new Date(2026, 0, 1), new Date(2026, 0, 1));
    await fs.utimes(newer, new Date(2026, 0, 2), new Date(2026, 0, 2));
    const found = await findLatestValidBackup(dataDir);
    expect(found?.fileName).toBe('subs-manager-2026-01-01.json');
    expect(found?.data.subscriptions[0].id).toBe('ok');
  });

  it('returns null when there are no backups', async () => {
    expect(await findLatestValidBackup(dataDir)).toBeNull();
  });
});
