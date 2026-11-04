import { useEffect, useState } from 'react';
import { browserStorage, readJson, writeJson } from '../state/storage';

export type ThemeChoice = 'system' | 'light' | 'dark';

const THEME_KEY = 'asena-console:theme';

const storedTheme = (): ThemeChoice => {
  const value = readJson(browserStorage(), THEME_KEY);

  return value === 'light' || value === 'dark' ? value : 'system';
};

/** The theme choice, applied as `data-theme` on `<html>`; `system` leaves it to `prefers-color-scheme`. */
export const useTheme = (): [ThemeChoice, (theme: ThemeChoice) => void] => {
  const [theme, setTheme] = useState<ThemeChoice>(storedTheme);

  useEffect(() => {
    const root = document.documentElement;

    if (theme === 'system') {
      delete root.dataset['theme'];
    } else {
      root.dataset['theme'] = theme;
    }

    writeJson(browserStorage(), THEME_KEY, theme);
  }, [theme]);

  return [theme, setTheme];
};
