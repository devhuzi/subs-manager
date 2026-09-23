import type { AppData, IpcApi } from '@shared/types';
import { seedData, seedRates } from './seed';

/**
 * An in-memory implementation of the renderer's `window.api` seam for browser
 * testing. No Supabase, no Electron, no auth — the real <App/> renders against
 * seeded sample data so Playwright can screenshot and drive the actual UI.
 *
 * Reads return the live in-memory copy; writes mutate it (so toggles, adds, and
 * preference changes persist within a session). Side-effecting methods (export,
 * logo fetch, AI) are inert stubs.
 */
export const makeMockApi = (): IpcApi => {
  let data: AppData = structuredClone(seedData);

  return {
    getDataDir: async () => '/preview/data',
    chooseDataDir: async () => null,
    loadData: async () => structuredClone(data),
    saveData: async (next) => {
      data = structuredClone(next);
    },
    saveFile: async () => null,
    openFile: async () => null,
    openExternal: async () => {},
    checkRemindersNow: async () => ({ fired: 0 }),
    getRates: async () => seedRates,
    refreshRates: async () => seedRates,
    fetchLogo: async () => null,
    aiChat: async () => ({ ok: false, error: 'AI is disabled in the design preview.' }),
    aiSetKey: async () => ({ ok: true }),
    aiClearKey: async () => ({ ok: true }),
    aiHasKey: async () => ({ hasKey: false }),
    aiIsSecureStorageAvailable: async () => true,
    backupNow: async () => ({ ok: true, path: '/preview/backups' }),
    listBackups: async () => [],
    openBackupsFolder: async () => {},
    aiFetchModelPricing: async () => ({}),
    onAiChunk: () => () => {},
  };
};
