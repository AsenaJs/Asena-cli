import fs from 'node:fs';
import path from 'node:path';
import type { CheckResult } from '../../types';
import { AUTH_PACKAGE, escapeRegExp, importsFrom, readDeclaredDeps, readSourceFiles } from '../authSource';
import type { SourceFile } from '../authSource';

export const AUTH_BETTER_AUTH_DEP_NAME = 'auth-better-auth-dep';

const BETTER_AUTH_PACKAGE = 'better-auth';

const BETTER_AUTH_CLASSES = ['BetterAuthService', 'BetterAuthController'];

const findBetterAuthUse = (files: SourceFile[]): string | null => {
  for (const file of files) {
    const hit = importsFrom(file.code, AUTH_PACKAGE).find(
      (binding) =>
        BETTER_AUTH_CLASSES.includes(binding.imported) ||
        (binding.imported === 'BetterAuth' && new RegExp(`@${escapeRegExp(binding.local)}\\s*\\(`).test(file.code)),
    );

    if (hit) {
      return `${file.relPath}:${hit.line}`;
    }
  }

  return null;
};

export const checkAuthBetterAuthDep = async (cwd: string): Promise<CheckResult> => {
  const fail = (detail: string, hint?: string): CheckResult => ({
    name: AUTH_BETTER_AUTH_DEP_NAME,
    ok: false,
    detail,
    hint,
  });

  let files: SourceFile[];

  try {
    files = readSourceFiles(cwd);
  } catch (e) {
    return fail(`could not scan ${cwd} for source files: ${(e as Error).message}`);
  }

  const use = findBetterAuthUse(files);

  if (!use) {
    return { name: AUTH_BETTER_AUTH_DEP_NAME, ok: true, detail: `Better Auth provider of ${AUTH_PACKAGE} not used` };
  }

  const declared = readDeclaredDeps(cwd).has(BETTER_AUTH_PACKAGE);
  const installed = fs.existsSync(path.join(cwd, 'node_modules', BETTER_AUTH_PACKAGE, 'package.json'));

  if (!declared) {
    return fail(
      `Better Auth provider used at ${use}, but ${BETTER_AUTH_PACKAGE} is not in package.json`,
      `bun add ${BETTER_AUTH_PACKAGE}`,
    );
  }

  if (!installed) {
    return fail(
      `Better Auth provider used at ${use}; ${BETTER_AUTH_PACKAGE} is declared but not installed`,
      'bun install',
    );
  }

  return {
    name: AUTH_BETTER_AUTH_DEP_NAME,
    ok: true,
    detail: `Better Auth provider used at ${use} and ${BETTER_AUTH_PACKAGE} is installed`,
  };
};
