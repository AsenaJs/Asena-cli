import fs from 'fs';
import path from 'path';

export const openCommand = (url: string, platform: NodeJS.Platform = process.platform): string[] => {
  if (platform === 'darwin') return ['open', url];

  if (platform === 'win32') return ['cmd', '/c', 'start', '""', url];

  return ['xdg-open', url];
};

/** Opens `url` in the default browser. Resolves false instead of throwing when that fails. */
export const openBrowser = async (url: string): Promise<boolean> => {
  try {
    const opener = Bun.spawn(openCommand(url), { stdin: 'ignore', stdout: 'ignore', stderr: 'ignore' });

    return (await opener.exited) === 0;
  } catch {
    return false;
  }
};

/** `dist/console-ui` of this CLI package, from its source or its compiled location. */
export const consoleUiDir = (from: string = import.meta.dir): string | null => {
  for (let dir = from; ; dir = path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, 'package.json'))) {
      const ui = path.join(dir, 'dist', 'console-ui');

      return fs.existsSync(path.join(ui, 'index.html')) ? ui : null;
    }

    if (path.dirname(dir) === dir) return null;
  }
};
