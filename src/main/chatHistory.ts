import { promises as fs } from 'node:fs';
import { join } from 'node:path';

const FILE = 'ai-chat-history.json';

/**
 * The AI chat is session-only — it never persists across restarts. This deletes
 * any history file left behind by older builds that did persist it, so a user's
 * prior transcript doesn't linger on disk. No-op if the file isn't there.
 */
export const purgeChatHistory = async (dataDir: string): Promise<void> => {
  await fs.rm(join(dataDir, FILE), { force: true });
};
