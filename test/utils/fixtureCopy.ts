import fs from 'fs';
import path from 'path';

export const FIXTURE_DIR = path.resolve(import.meta.dir, '../fixtures/sample-app');

/**
 * Copies the sample-app fixture to dest without node_modules, then symlinks the
 * fixture's node_modules into the copy. Bun resolves through the symlink to the
 * real modules, so decorator Symbols stay identical to the scanner's.
 */
export function copySampleApp(dest: string): void {
  fs.cpSync(FIXTURE_DIR, dest, {
    recursive: true,
    filter: (source) => !source.includes(`${path.sep}node_modules`),
  });

  fs.symlinkSync(path.join(FIXTURE_DIR, 'node_modules'), path.join(dest, 'node_modules'), 'dir');
}

export function listFilesRecursively(dir: string, base = dir, acc: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      listFilesRecursively(full, base, acc);
    } else {
      acc.push(path.relative(base, full));
    }
  }

  return acc.sort();
}

export function findAsenaJsFiles(dir: string): string[] {
  return listFilesRecursively(dir).filter((file) => file.endsWith('.asena.js'));
}
