import { app, safeStorage } from 'electron';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';

const FILE = 'ai-credentials.bin';

/**
 * Thrown when the OS doesn't expose a secure keyring. We refuse to fall back
 * to plaintext storage — surface the error to the user instead.
 */
export class NoSecureStorageError extends Error {
  constructor() {
    super(
      'Secure key storage is unavailable on this OS. The API key cannot be saved.',
    );
    this.name = 'NoSecureStorageError';
  }
}

const credPath = (): string => join(app.getPath('userData'), FILE);

/**
 * On Linux without a keyring, Electron "encrypts" with a hard-coded password
 * (the `basic_text` backend) — that is obfuscation, not protection, so treat
 * it as unavailable.
 */
export const isSecureStorageAvailable = (): boolean =>
  safeStorage.isEncryptionAvailable() &&
  !(process.platform === 'linux' && safeStorage.getSelectedStorageBackend?.() === 'basic_text');

export const setKey = async (plaintext: string): Promise<void> => {
  if (!isSecureStorageAvailable()) throw new NoSecureStorageError();
  const encrypted = safeStorage.encryptString(plaintext);
  await fs.writeFile(credPath(), encrypted, { mode: 0o600 });
};

/**
 * Plaintext key. Main-process only — must never cross the IPC boundary.
 * Callers (only `aiChat`) should hold the value as briefly as possible.
 */
export const getKey = async (): Promise<string | null> => {
  try {
    const buf = await fs.readFile(credPath());
    return safeStorage.decryptString(buf);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
};

export const clearKey = async (): Promise<void> => {
  await fs.rm(credPath(), { force: true });
};

/**
 * True if a non-empty key file exists. Deliberately does NOT decrypt: this runs
 * on every loadData, and decrypting would needlessly pull the plaintext key into
 * memory (and can prompt the macOS keychain). A file that no longer decrypts
 * (copied from another machine, rotated keychain) is reported by `aiChat` at
 * request time instead.
 */
export const hasKey = async (): Promise<boolean> => {
  try {
    const stat = await fs.stat(credPath());
    return stat.isFile() && stat.size > 0;
  } catch {
    return false;
  }
};
