import type { CheckResult } from '../../types';
import { AUTH_PACKAGE, CORE_AUTH_MODULE, importsFrom, readDeclaredDeps, readSourceFiles } from '../authSource';
import type { SourceFile } from '../authSource';

export const AUTH_ENFORCEMENT_NAME = 'auth-enforcement';

const MARKERS = ['Protected', 'Roles'];

const GUARD_REFERENCES = ['authComponents', 'AuthGuard'];

const WIRING_HINT = `add \`imports: [...authComponents]\` (from ${AUTH_PACKAGE}) to AsenaServerFactory.create`;

const firstImport = (files: SourceFile[], moduleName: string, names: string[]): string | null => {
  for (const file of files) {
    const hit = importsFrom(file.code, moduleName).find((binding) => names.includes(binding.imported));

    if (hit) {
      return `${file.relPath}:${hit.line}`;
    }
  }

  return null;
};

export const checkAuthEnforcement = async (cwd: string): Promise<CheckResult> => {
  const fail = (detail: string, hint?: string): CheckResult => ({
    name: AUTH_ENFORCEMENT_NAME,
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

  const marker = firstImport(files, CORE_AUTH_MODULE, MARKERS);

  if (!marker) {
    return { name: AUTH_ENFORCEMENT_NAME, ok: true, detail: `no @Protected/@Roles imported from ${CORE_AUTH_MODULE}` };
  }

  const guard = firstImport(files, AUTH_PACKAGE, GUARD_REFERENCES);

  if (guard) {
    return {
      name: AUTH_ENFORCEMENT_NAME,
      ok: true,
      detail: `auth markers (${marker}) are enforced by the guard imported at ${guard}`,
    };
  }

  const open = `the markers are metadata only and those routes are served open`;

  if (!readDeclaredDeps(cwd).has(AUTH_PACKAGE)) {
    return fail(
      `@Protected/@Roles imported at ${marker}, but ${AUTH_PACKAGE} is not a dependency and no guard is registered - ${open}`,
      `bun add ${AUTH_PACKAGE}, then ${WIRING_HINT}`,
    );
  }

  return fail(
    `@Protected/@Roles imported at ${marker} and ${AUTH_PACKAGE} is a dependency, but neither authComponents nor AuthGuard is imported from it - ${open}`,
    WIRING_HINT,
  );
};
