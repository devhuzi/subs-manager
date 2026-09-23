import { describe, expect, it } from 'vitest';
import { brandVariant, contrastRatio, hexToHsl, isValidHex, normalizeHex } from './colors';

describe('isValidHex', () => {
  it('accepts 6-digit hex with or without #', () => {
    expect(isValidHex('#6366F1')).toBe(true);
    expect(isValidHex('6366f1')).toBe(true);
  });
  it('rejects malformed input', () => {
    expect(isValidHex('#fff')).toBe(false);
    expect(isValidHex('purple')).toBe(false);
    expect(isValidHex('#12345g')).toBe(false);
  });
});

describe('normalizeHex', () => {
  it('uppercases and prefixes #', () => {
    expect(normalizeHex('6366f1')).toBe('#6366F1');
  });
  it('returns null for invalid input', () => {
    expect(normalizeHex('nope')).toBeNull();
  });
});

describe('hexToHsl', () => {
  it('converts pure red', () => {
    const hsl = hexToHsl('#FF0000');
    expect(hsl).not.toBeNull();
    expect(hsl!.h).toBeCloseTo(0);
    expect(hsl!.s).toBeCloseTo(100);
    expect(hsl!.l).toBeCloseTo(50);
  });
  it('converts white and black to zero saturation', () => {
    expect(hexToHsl('#FFFFFF')!.l).toBeCloseTo(100);
    expect(hexToHsl('#000000')!.l).toBeCloseTo(0);
  });
  it('returns null for invalid hex', () => {
    expect(hexToHsl('zzz')).toBeNull();
  });
});

const channels = (c: string): { h: number; s: number; l: number } => {
  const [h, s, l] = c.replace(/%/g, '').split(' ').map(Number);
  return { h, s, l };
};

describe('contrastRatio', () => {
  it('is 21 for black on white and 1 for identical colors', () => {
    const white = { h: 0, s: 0, l: 100 };
    expect(contrastRatio({ h: 0, s: 0, l: 0 }, white)).toBeCloseTo(21, 0);
    expect(contrastRatio(white, white)).toBeCloseTo(1);
  });
});

describe('brandVariant', () => {
  const lightBg = { h: 40, s: 24, l: 98 };
  const darkBg = { h: 222, s: 18, l: 8 };

  it('darkens a light accent until it clears AA on the light background', () => {
    const v = brandVariant('#3B82F6', 'light')!;
    expect(contrastRatio(channels(v.primary), lightBg)).toBeGreaterThanOrEqual(4.5);
    expect(channels(v.primary).l).toBeLessThan(hexToHsl('#3B82F6')!.l);
  });

  it('raises lightness for dark mode until it clears AA on the dark background', () => {
    const v = brandVariant('#475569', 'dark')!;
    expect(contrastRatio(channels(v.primary), darkBg)).toBeGreaterThanOrEqual(4.5);
    expect(channels(v.primary).l).toBeGreaterThan(hexToHsl('#475569')!.l);
  });

  it('keeps a color that already passes and picks a readable foreground', () => {
    const v = brandVariant('#1E1B4B', 'light')!;
    expect(channels(v.primary).l).toBeCloseTo(hexToHsl('#1E1B4B')!.l, 1);
    expect(v.foreground).toBe('0.0 0.0% 100.0%');
    expect(brandVariant('#C7D2FE', 'dark')!.foreground).toBe('222.0 25.0% 12.0%');
  });

  it('returns null for invalid hex', () => {
    expect(brandVariant('nope', 'light')).toBeNull();
  });
});
