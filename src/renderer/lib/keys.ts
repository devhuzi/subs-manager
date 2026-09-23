/** True on macOS / iOS, where shortcuts use ⌘ instead of Ctrl. */
export const isApplePlatform = (): boolean => {
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  const platform = nav.userAgentData?.platform || nav.platform || '';
  return /mac|iphone|ipad|ipod/i.test(platform);
};

/** Label for a Cmd/Ctrl shortcut, e.g. `shortcut('K')` → "⌘K" or "Ctrl K". */
export const shortcut = (key: string): string =>
  isApplePlatform() ? `⌘${key}` : `Ctrl ${key}`;
