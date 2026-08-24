import fs from 'node:fs';
import path from 'node:path';
import type { CheckResult } from '../../types';

export const DUPLICATE_PACKAGES_NAME = 'duplicate-packages';

const TRACKED_PACKAGES = ['@asenajs/asena', 'hono', 'zod'];

const MAX_NODE_MODULES_DEPTH = 6;

const SKIPPED_DIRS = ['.bin', '.cache'];

interface InstalledPackage {
  name: string;
  version: string;
  path: string;
}

const readVersion = (pkgDir: string): string => {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf-8')) as { version?: string };

    return pkg.version ?? 'unknown';
  } catch {
    return 'unknown';
  }
};

const visitPackage = (name: string, pkgDir: string, level: number, visited: Set<string>, found: InstalledPackage[]) => {
  if (TRACKED_PACKAGES.includes(name)) {
    found.push({ name, version: readVersion(pkgDir), path: pkgDir });
  }

  const nested = path.join(pkgDir, 'node_modules');

  if (level < MAX_NODE_MODULES_DEPTH && fs.existsSync(nested)) {
    collectTracked(nested, level + 1, visited, found);
  }
};

const collectTracked = (nmDir: string, level: number, visited: Set<string>, found: InstalledPackage[]) => {
  let real: string;

  try {
    real = fs.realpathSync(nmDir);
  } catch {
    return;
  }

  if (visited.has(real)) {
    return;
  }

  visited.add(real);

  let entries: fs.Dirent[];

  try {
    entries = fs.readdirSync(nmDir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (SKIPPED_DIRS.includes(entry.name)) {
      continue;
    }

    if (!entry.isDirectory() && !entry.isSymbolicLink()) {
      continue;
    }

    if (entry.name.startsWith('@')) {
      const scoped = listDir(path.join(nmDir, entry.name));

      for (const child of scoped) {
        if (child.isDirectory() || child.isSymbolicLink()) {
          visitPackage(`${entry.name}/${child.name}`, path.join(nmDir, entry.name, child.name), level, visited, found);
        }
      }
    } else {
      visitPackage(entry.name, path.join(nmDir, entry.name), level, visited, found);
    }
  }
};

const listDir = (dir: string): fs.Dirent[] => {
  try {
    return fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
};

export const checkDuplicatePackages = async (cwd: string): Promise<CheckResult> => {
  const fail = (detail: string, hint?: string): CheckResult => ({
    name: DUPLICATE_PACKAGES_NAME,
    ok: false,
    detail,
    hint,
  });

  const root = path.join(cwd, 'node_modules');

  if (!fs.existsSync(root)) {
    return fail('node_modules not found', 'run `bun install` first');
  }

  const found: InstalledPackage[] = [];

  collectTracked(root, 1, new Set<string>(), found);

  found.sort((a, b) => a.path.localeCompare(b.path));

  if (found.length === 0) {
    return {
      name: DUPLICATE_PACKAGES_NAME,
      ok: true,
      detail: `none of ${TRACKED_PACKAGES.join(', ')} are installed`,
    };
  }

  const byName = new Map<string, InstalledPackage[]>();

  for (const pkg of found) {
    byName.set(pkg.name, [...(byName.get(pkg.name) ?? []), pkg]);
  }

  const duplicates = [...byName.entries()].filter(([, installs]) => new Set(installs.map((i) => i.version)).size > 1);

  if (duplicates.length === 0) {
    const summary = [...byName.entries()].map(([name, installs]) => `${name}@${installs[0].version}`).join(', ');

    return { name: DUPLICATE_PACKAGES_NAME, ok: true, detail: summary };
  }

  const detail = duplicates
    .map(([, installs]) => installs.map((i) => `${path.relative(cwd, i.path)} → ${i.version}`).join(', '))
    .join('; ');

  const names = duplicates.map(([name]) => name).join(' ');

  return fail(
    `multiple versions installed: ${detail}`,
    `two copies of a package break instanceof checks (the HttpException brand) — align the version ranges or run: bun update ${names}`,
  );
};
