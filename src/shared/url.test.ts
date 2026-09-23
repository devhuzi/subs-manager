import { describe, expect, it } from 'vitest';
import { normalizeExternalUrl } from './url';

describe('normalizeExternalUrl', () => {
  it('prepends https:// to bare domains', () => {
    expect(normalizeExternalUrl('wsform.com')).toBe('https://wsform.com');
    expect(normalizeExternalUrl('www.example.com/pricing?a=1')).toBe(
      'https://www.example.com/pricing?a=1',
    );
  });

  it('keeps http and https links as-is', () => {
    expect(normalizeExternalUrl('https://example.com/a')).toBe('https://example.com/a');
    expect(normalizeExternalUrl('http://example.com')).toBe('http://example.com');
    expect(normalizeExternalUrl('HTTPS://Example.com')).toBe('HTTPS://Example.com');
  });

  it('trims surrounding whitespace', () => {
    expect(normalizeExternalUrl('  example.com \n')).toBe('https://example.com');
    expect(normalizeExternalUrl('\thttps://example.com ')).toBe('https://example.com');
  });

  it('rejects empty and unparseable input', () => {
    expect(normalizeExternalUrl('')).toBeNull();
    expect(normalizeExternalUrl('   ')).toBeNull();
    expect(normalizeExternalUrl('http://')).toBeNull();
  });

  it('rejects non-web schemes', () => {
    expect(normalizeExternalUrl('javascript:alert(1)//.x')).toBeNull();
    expect(normalizeExternalUrl('javascript:alert(1)')).toBeNull();
    expect(normalizeExternalUrl('data:text/html,<script>alert(1)</script>')).toBeNull();
    expect(normalizeExternalUrl('file:///C:/Windows/system32/calc.exe')).toBeNull();
    expect(normalizeExternalUrl('ftp://example.com')).toBeNull();
    expect(normalizeExternalUrl('vscode://file/etc/passwd')).toBeNull();
  });
});
