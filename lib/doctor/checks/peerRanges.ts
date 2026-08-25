import fs from 'node:fs';
import path from 'node:path';
import type { CheckResult } from '../../types';
import { readInstalledVersion } from '../readInstalledVersion';

export const PEER_RANGES_NAME = 'peer-ranges';

const CORE_PACKAGE = '@asenajs/asena';

const SCOPE_DIR = '@asenajs';

interface ScopedPackage {
  name: string;
  peerRange?: string;
}

const readScopedPackage = (pkgDir: string, name: string): ScopedPackage | null => {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf-8')) as {
      peerDependencies?: Record<string, string>;
    };

    return { name, peerRange: pkg.peerDependencies?.[CORE_PACKAGE] };
  } catch {
    return null;
  }
};

export const checkPeerRanges = async (cwd: string): Promise<CheckResult> => {
  const fail = (detail: string, hint?: string): CheckResult => ({ name: PEER_RANGES_NAME, ok: false, detail, hint });

  const scopePath = path.join(cwd, 'node_modules', SCOPE_DIR);

  if (!fs.existsSync(scopePath)) {
    return fail(`node_modules/${SCOPE_DIR} not found`, 'run `bun install` first');
  }

  const coreVersion = readInstalledVersion(path.join(scopePath, 'asena'));

  if (!coreVersion) {
    return fail(`${CORE_PACKAGE} is not installed`, `bun add ${CORE_PACKAGE}`);
  }

  const unsatisfied: string[] = [];

  for (const entry of fs.readdirSync(scopePath, { withFileTypes: true })) {
    if ((!entry.isDirectory() && !entry.isSymbolicLink()) || entry.name === 'asena') {
      continue;
    }

    const pkg = readScopedPackage(path.join(scopePath, entry.name), `${SCOPE_DIR}/${entry.name}`);

    if (!pkg?.peerRange) {
      continue;
    }

    if (!Bun.semver.satisfies(coreVersion, pkg.peerRange)) {
      unsatisfied.push(`${pkg.name} requires ${CORE_PACKAGE} ${pkg.peerRange} but ${coreVersion} is installed`);
    }
  }

  if (unsatisfied.length > 0) {
    return fail(
      unsatisfied.join('; '),
      `align the adapters with the installed core version or run: bun update ${CORE_PACKAGE}`,
    );
  }

  return {
    name: PEER_RANGES_NAME,
    ok: true,
    detail: `all @asenajs/* peer ranges are satisfied by ${CORE_PACKAGE}@${coreVersion}`,
  };
};
