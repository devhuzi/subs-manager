/**
 * Tiny color helpers used by the appearance settings + theme hook.
 *
 * The app stores brand color as a hex like `#6366F1`. The CSS variables in
 * `index.css` use Tailwind's `<alpha-value>` format which needs HSL channels
 * (e.g. `243 75% 59%`). These helpers bridge the two.
 */

export interface Hsl {
  /** 0–360 */
  h: number;
  /** 0–100 */
  s: number;
  /** 0–100 */
  l: number;
}

const HEX_RE = /^#?([0-9a-f]{6})$/i;

export const isValidHex = (input: string): boolean =>
  HEX_RE.test(input.trim());

export const normalizeHex = (input: string): string | null => {
  const m = HEX_RE.exec(input.trim());
  return m ? `#${m[1].toUpperCase()}` : null;
};

export const hexToHsl = (input: string): Hsl | null => {
  const m = HEX_RE.exec(input.trim());
  if (!m) return null;
  const num = parseInt(m[1], 16);
  const r = ((num >> 16) & 0xff) / 255;
  const g = ((num >> 8) & 0xff) / 255;
  const b = (num & 0xff) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: l * 100 };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return { h: h * 60, s: s * 100, l: l * 100 };
};

export const formatHslChannels = ({ h, s, l }: Hsl): string =>
  `${h.toFixed(1)} ${s.toFixed(1)}% ${l.toFixed(1)}%`;

const hslToRgb = ({ h, s, l }: Hsl): [number, number, number] => {
  const sat = s / 100;
  const lig = l / 100;
  const k = (n: number): number => (n + h / 30) % 12;
  const a = sat * Math.min(lig, 1 - lig);
  const f = (n: number): number =>
    lig - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)];
};

/** WCAG relative luminance of an HSL color. */
const luminance = (c: Hsl): number => {
  const [r, g, b] = hslToRgb(c).map((v) =>
    v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** WCAG contrast ratio between two colors (1–21). */
export const contrastRatio = (a: Hsl, b: Hsl): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

// Mirrors --background (per mode) and the two foreground candidates in index.css.
const BACKGROUND: Record<'light' | 'dark', Hsl> = {
  light: { h: 40, s: 24, l: 98 },
  dark: { h: 222, s: 18, l: 8 },
};
const WHITE: Hsl = { h: 0, s: 0, l: 100 };
const INK: Hsl = { h: 222, s: 25, l: 12 };

export interface BrandVariant {
  /** HSL channels for `--primary` / `--ring`. */
  primary: string;
  /** HSL channels for `--primary-foreground`. */
  foreground: string;
}

/**
 * Adapts a user-picked brand color to a mode so it stays legible as text and
 * as a fill: darkened (light mode) or lightened (dark mode) just until it
 * reaches 4.5:1 against that mode's background, keeping hue and saturation.
 * The foreground is whichever of white / ink reads better on the result.
 */
export const brandVariant = (hex: string, mode: 'light' | 'dark'): BrandVariant | null => {
  const base = hexToHsl(hex);
  if (!base) return null;
  const bg = BACKGROUND[mode];
  const step = mode === 'light' ? -1 : 1;
  let color = base;
  while (contrastRatio(color, bg) < 4.5 && color.l > 0 && color.l < 100) {
    color = { ...color, l: Math.min(100, Math.max(0, color.l + step)) };
  }
  const foreground = contrastRatio(color, WHITE) >= contrastRatio(color, INK) ? WHITE : INK;
  return { primary: formatHslChannels(color), foreground: formatHslChannels(foreground) };
};
