import assert from 'node:assert/strict';
import * as themeModule from '../src/hooks/useTheme';

const themeApi = themeModule as unknown as {
  THEME_STORAGE_KEY?: string;
  resolveInitialTheme?: (storedValue: string | null, prefersDark: boolean) => 'light' | 'dark';
  nextTheme?: (theme: 'light' | 'dark') => 'light' | 'dark';
};

assert.equal(themeApi.THEME_STORAGE_KEY, 'analyse-strategy-theme');
assert.equal(typeof themeApi.resolveInitialTheme, 'function');
assert.equal(typeof themeApi.nextTheme, 'function');
assert.equal(themeApi.resolveInitialTheme?.('dark', false), 'dark');
assert.equal(themeApi.resolveInitialTheme?.('light', true), 'light');
assert.equal(themeApi.resolveInitialTheme?.('invalid', true), 'dark');
assert.equal(themeApi.resolveInitialTheme?.(null, false), 'light');
assert.equal(themeApi.nextTheme?.('light'), 'dark');
assert.equal(themeApi.nextTheme?.('dark'), 'light');

console.log('theme tests passed');
