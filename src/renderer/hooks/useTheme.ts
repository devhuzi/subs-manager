import { useEffect } from 'react';
import {
  normalizeLayoutTheme,
  type ActiveLayoutTheme,
  type LayoutTheme,
  type Theme,
} from '../../shared/types';
import { brandVariant } from '../lib/colors';

const LAYOUT_CLASSES: Record<ActiveLayoutTheme, string> = {
  default: 'layout-default',
  sharp: 'layout-sharp',
};

export const useApplyTheme = (theme: Theme): void => {
  useEffect(() => {
    const root = document.documentElement;
    const apply = (): void => {
      const isDark =
        theme === 'dark' ||
        (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
      root.classList.toggle('dark', isDark);
    };
    apply();
    if (theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);
};

/**
 * Applies the user-picked layout theme as a class on `<html>` and the
 * user-picked brand color as inline CSS variables. Retired layouts ('glass',
 * 'notion') render as the default. The brand color gets a light and a dark
 * variant (`--brand*`), each contrast-adjusted for its mode; `.has-brand`
 * rules in `index.css` map the active one onto `--primary` / `--ring`.
 *
 * Pass `brandColor: undefined` to fall back to the CSS-defined default.
 */
export const useApplyAppearance = (
  layoutTheme: LayoutTheme,
  brandColor: string | undefined,
): void => {
  const layout = normalizeLayoutTheme(layoutTheme);
  useEffect(() => {
    const root = document.documentElement;
    // Layout class — remove all variants then add the active one. The retired
    // class names are removed too in case an older build left them behind.
    for (const cls of [...Object.values(LAYOUT_CLASSES), 'layout-glass', 'layout-notion']) {
      root.classList.remove(cls);
    }
    root.classList.add(LAYOUT_CLASSES[layout]);
  }, [layout]);

  useEffect(() => {
    const root = document.documentElement;
    const light = brandColor ? brandVariant(brandColor, 'light') : null;
    const dark = brandColor ? brandVariant(brandColor, 'dark') : null;
    const props = ['--brand', '--brand-foreground', '--brand-dark', '--brand-dark-foreground'];
    if (!light || !dark) {
      root.classList.remove('has-brand');
      for (const p of props) root.style.removeProperty(p);
      return;
    }
    root.style.setProperty('--brand', light.primary);
    root.style.setProperty('--brand-foreground', light.foreground);
    root.style.setProperty('--brand-dark', dark.primary);
    root.style.setProperty('--brand-dark-foreground', dark.foreground);
    root.classList.add('has-brand');
  }, [brandColor]);

  // Keep the PWA theme-color (the iOS status-bar / Android toolbar tint) in
  // sync with the chosen brand color, so the top area on a phone matches the
  // in-app accent instead of being stuck on the build-time default. No-op on
  // desktop (the Electron renderer has no theme-color meta).
  useEffect(() => {
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', brandColor ?? '#6366F1');
  }, [brandColor]);
};
