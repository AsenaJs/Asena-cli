import path from 'node:path';
import type { CheckResult } from '../../types';

export const DIRECT_DEPENDENCIES_NAME = 'direct-dependencies';

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

const isListed = (pkg: PackageJson, name: string): boolean =>
  Boolean(pkg.dependencies?.[name] ?? pkg.devDependencies?.[name]);

const readPackageJson = async (cwd: string): Promise<{ pkg: PackageJson } | { error: string }> => {
  const file = Bun.file(path.join(cwd, 'package.json'));

  if (!(await file.exists())) {
    return { error: 'package.json not found' };
  }

  try {
    return { pkg: JSON.parse(await file.text()) as PackageJson };
  } catch (e) {
    return { error: `package.json could not be parsed: ${(e as Error).message}` };
  }
};

export const checkDirectDependencies = async (cwd: string): Promise<CheckResult> => {
  const fail = (detail: string, hint?: string): CheckResult => ({
    name: DIRECT_DEPENDENCIES_NAME,
    ok: false,
    detail,
    hint,
  });

  const read = await readPackageJson(cwd);

  if ('error' in read) {
    return fail(read.error);
  }

  const { pkg } = read;

  const required: string[] = ['@asenajs/asena', 'reflect-metadata'];

  if (isListed(pkg, '@asenajs/hono-adapter')) {
    required.push('hono', 'zod');
  }

  if (isListed(pkg, '@asenajs/ergenecore')) {
    required.push('zod');
  }

  const missing = required.filter((name) => !pkg.dependencies?.[name]);

  if (missing.length > 0) {
    return fail(`missing from dependencies: ${missing.join(', ')}`, `bun add ${missing.join(' ')}`);
  }

  return {
    name: DIRECT_DEPENDENCIES_NAME,
    ok: true,
    detail: 'all required packages are direct dependencies',
  };
};
