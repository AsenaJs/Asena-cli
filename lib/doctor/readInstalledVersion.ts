import fs from 'node:fs';
import path from 'node:path';

/** The `version` of the package installed at `pkgDir`, or null when it cannot be read. */
export const readInstalledVersion = (pkgDir: string): string | null => {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf-8')) as { version?: string };

    return pkg.version ?? null;
  } catch {
    return null;
  }
};
