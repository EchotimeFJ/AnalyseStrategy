import { useState, useEffect } from 'react';

export type Theme = 'light' | 'dark';
export const THEME_STORAGE_KEY = 'analyse-strategy-theme';

export function resolveInitialTheme(storedValue: string | null, prefersDark: boolean): Theme {
  if (storedValue === 'light' || storedValue === 'dark') return storedValue;
  return prefersDark ? 'dark' : 'light';
}

export function nextTheme(theme: Theme): Theme {
  return theme === 'light' ? 'dark' : 'light';
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    const storedValue = window.localStorage.getItem(THEME_STORAGE_KEY);
    return resolveInitialTheme(storedValue, window.matchMedia('(prefers-color-scheme: dark)').matches);
  });

  useEffect(() => {
    document.documentElement.classList.remove('light', 'dark');
    document.documentElement.classList.add(theme);
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    document.querySelector('meta[name="theme-color"]')?.setAttribute(
      'content',
      theme === 'dark' ? '#0b1220' : '#f6f7f9',
    );
  }, [theme]);

  const toggleTheme = () => {
    setTheme((currentTheme) => nextTheme(currentTheme));
  };

  return {
    theme,
    toggleTheme,
    isDark: theme === 'dark'
  };
}
