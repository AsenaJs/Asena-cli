import fs from 'fs';
import path from 'path';

export interface SourceWatcher {
  close(): void;
}

const DEFAULT_DEBOUNCE_MS = 100;

// 4913 is the probe file vim writes to test a directory; ___jb_*___ are JetBrains' safe-write files. What follows `.tmp`
// must hold a digit, as a generated token does and a file extension hardly ever does: `x.tmp.ts` is a real source.
const EDITOR_TEMP_FILE = /(?:\.tmp(?:\.\w*\d\w*)*|~|\.sw[a-z]|\.crswap|___jb_(?:tmp|old)___)$|^#.*#$|^4913$/;

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

const isInside = (shown: string, folder: string): boolean => shown.startsWith(`${folder}/`);

/**
 * Calls `onChange` once per burst of changes below `dir`; one save fires several fs events. `removed` names the changed
 * paths that are gone by then; a removed folder is named once, without what was in it.
 *
 * @param root - The files are named relative to it, e.g. the project root for `src/index.ts`
 */
export const watchSourceFolder = (
  dir: string,
  onChange: (files: string[], removed: string[]) => void,
  debounceMs: number = DEFAULT_DEBOUNCE_MS,
  root: string = dir,
): SourceWatcher => {
  const watched = path.resolve(dir);
  const base = path.resolve(root);
  const changed = new Map<string, string>();
  let timer: ReturnType<typeof setTimeout> | undefined;

  const watcher = fs.watch(watched, { recursive: true }, (_event, file) => {
    if (file === null || isIgnoredChange(String(file))) return;

    changed.set(relativeTo(base, watched, String(file)), path.join(watched, String(file)));
    clearTimeout(timer);

    timer = setTimeout(() => {
      const gone = [...changed].filter(([, absolute]) => !fs.existsSync(absolute)).map(([shown]) => shown);
      const removed = gone.filter((shown) => !gone.some((folder) => isInside(shown, folder)));
      const files = [...changed.keys()].filter((shown) => !removed.some((folder) => isInside(shown, folder)));

      changed.clear();
      onChange(files, removed);
    }, debounceMs);
  });

  return {
    close() {
      clearTimeout(timer);
      watcher.close();
    },
  };
};
