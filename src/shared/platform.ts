import type { Platform } from './types';

/**
 * The shell the renderer is running in. Defaults to 'desktop' because the
 * Electron preload never sets `window.platform`; the web bootstrap sets it to
 * 'web' before React mounts. Shared components branch on this to hide
 * desktop-only UI (data directory, backups folder, keep-in-tray) on the web.
 */
export const getPlatform = (): Platform => {
  // Read off globalThis (=== window in a browser) so this also type-checks in
  // the no-DOM-lib Node/Electron-main tsconfig where `window` isn't declared.
  const g = globalThis as typeof globalThis & { platform?: Platform };
  return g.platform ?? 'desktop';
};

export const isWeb = (): boolean => getPlatform() === 'web';
export const isDesktop = (): boolean => getPlatform() === 'desktop';
