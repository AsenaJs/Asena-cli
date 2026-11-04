import fs from 'fs';
import path from 'path';

export interface SourceWatcher {
  close(): void;
}

const DEFAULT_DEBOUNCE_MS = 100;

/** Editor swap and backup files, and anything under a dot directory. */
export const isIgnoredChange = (file: string): boolean =>
  file.endsWith('~') || file.split(/[\\/]/).some((segment) => segment.startsWith('.'));

/** Calls `onChange` once per burst of changes below `dir`; one save fires several fs events. */
export const watchSourceFolder = (
  dir: string,
  onChange: (files: string[]) => void,
  debounceMs: number = DEFAULT_DEBOUNCE_MS,
): SourceWatcher => {
  const changed = new Set<string>();
  let timer: ReturnType<typeof setTimeout> | undefined;

  const watcher = fs.watch(path.resolve(dir), { recursive: true }, (_event, file) => {
    if (file === null || isIgnoredChange(String(file))) return;

    changed.add(String(file));
    clearTimeout(timer);

    timer = setTimeout(() => {
      const files = [...changed];

      changed.clear();
      onChange(files);
    }, debounceMs);
  });

  return {
    close() {
      clearTimeout(timer);
      watcher.close();
    },
  };
};
