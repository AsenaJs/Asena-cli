import fs from 'fs';
import path from 'path';

export interface SourceWatcher {
  close(): void;
}

const DEFAULT_DEBOUNCE_MS = 100;

// 4913 is the probe file vim writes to test a directory; ___jb_*___ are JetBrains' safe-write files.
const EDITOR_TEMP_FILE = /(?:\.tmp(?:\..*)?|~|\.sw[a-z]|\.crswap|___jb_(?:tmp|old)___)$|^#.*#$|^4913$/;

/** Editor temp, swap and backup files, and anything under a dot directory. */
export const isIgnoredChange = (file: string): boolean => {
  const segments = file.split(/[\\/]/);

  return segments.some((segment) => segment.startsWith('.')) || EDITOR_TEMP_FILE.test(segments.at(-1) ?? '');
};

/** `file` below `dir` as a path relative to `root`, with `/` separators; relative to `dir` when `root` does not hold it. */
const relativeTo = (root: string, dir: string, file: string): string => {
  const relative = path.relative(root, path.join(dir, file));
  const shown = relative.startsWith('..') || path.isAbsolute(relative) ? file : relative;

  return shown.split(path.sep).join('/');
};

/**
 * Calls `onChange` once per burst of changes below `dir`; one save fires several fs events.
 *
 * @param root - The files are named relative to it, e.g. the project root for `src/index.ts`
 */
export const watchSourceFolder = (
  dir: string,
  onChange: (files: string[]) => void,
  debounceMs: number = DEFAULT_DEBOUNCE_MS,
  root: string = dir,
): SourceWatcher => {
  const watched = path.resolve(dir);
  const base = path.resolve(root);
  const changed = new Set<string>();
  let timer: ReturnType<typeof setTimeout> | undefined;

  const watcher = fs.watch(watched, { recursive: true }, (_event, file) => {
    if (file === null || isIgnoredChange(String(file))) return;

    changed.add(relativeTo(base, watched, String(file)));
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
