import fs from 'node:fs';
import path from 'node:path';
import { getAllFiles } from '../../helpers';
import type { CheckResult, DoctorAsenaConfig } from '../../types';

export const ASENA_CONFIG_NAME = 'asena-config';

const KEEP_NAMES_HINT = 'minify: { whitespace: true, syntax: true, identifiers: true, keepNames: true }';

const locateConfigFile = (cwd: string): string | null => {
  for (const file of getAllFiles(cwd)) {
    if (file.endsWith('asena-config.ts')) {
      return file;
    }
  }

  return null;
};

const minifiesIdentifiers = (config: DoctorAsenaConfig): boolean => {
  const minify = config.buildOptions?.minify;

  return minify === true || (typeof minify === 'object' && minify !== null && minify.identifiers === true);
};

// Bun reads keepNames only inside the minify object; `minify: true` has no place to put it
const keepsNames = (config: DoctorAsenaConfig): boolean => {
  const minify = config.buildOptions?.minify;

  return typeof minify === 'object' && minify !== null && minify.keepNames === true;
};

export const checkAsenaConfig = async (cwd: string): Promise<CheckResult> => {
  const fail = (detail: string, hint?: string): CheckResult => ({ name: ASENA_CONFIG_NAME, ok: false, detail, hint });

  let configPath: string | null;

  try {
    configPath = locateConfigFile(cwd);
  } catch (e) {
    return fail(`could not scan ${cwd} for asena-config.ts: ${(e as Error).message}`);
  }

  if (!configPath) {
    return fail('no asena-config.ts found', 'run `asena init` to generate one');
  }

  let config: DoctorAsenaConfig | undefined;

  try {
    config = (await import(configPath)).default as DoctorAsenaConfig | undefined;
  } catch (e) {
    return fail(`asena-config.ts could not be imported: ${(e as Error).message}`);
  }

  if (!config || typeof config !== 'object') {
    return fail('asena-config.ts has no default export object');
  }

  const problems: string[] = [];

  let hints: string[] = [];

  if (!config.rootFile || !config.sourceFolder) {
    problems.push('rootFile and sourceFolder are required');
  } else {
    for (const [label, configured] of [
      ['rootFile', config.rootFile],
      ['sourceFolder', config.sourceFolder],
    ] as const) {
      if (!fs.existsSync(path.resolve(cwd, configured))) {
        problems.push(`${label} "${configured}" does not exist`);
      }
    }
  }

  if (minifiesIdentifiers(config) && !keepsNames(config)) {
    problems.push('minify drops component names that are read at runtime');
    hints = [...hints, `enable keepNames: ${KEEP_NAMES_HINT}`];
  }

  if (problems.length > 0) {
    return { name: ASENA_CONFIG_NAME, ok: false, detail: problems.join('; '), hint: hints.join(' | ') || undefined };
  }

  return {
    name: ASENA_CONFIG_NAME,
    ok: true,
    detail: 'asena-config.ts found, rootFile and sourceFolder exist',
  };
};
