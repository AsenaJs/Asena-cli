import fs from 'node:fs';
import path from 'node:path';
import { getAllFiles } from '../../helpers';
import type { CheckResult, DoctorAsenaConfig } from '../../types';

export const ASENA_CONFIG_NAME = 'asena-config';

const MINIFY_HINT = 'minify: { whitespace: true, syntax: true, identifiers: false }';

const locateConfigFile = (cwd: string): string | null => {
  for (const file of getAllFiles(cwd)) {
    if (file.endsWith('asena-config.ts')) {
      return file;
    }
  }

  return null;
};

// Component names are read at runtime, and Bun's bundler does not preserve class names under
// identifier minification even with keepNames set - measured on Bun 1.4.0
const minifiesIdentifiers = (config: DoctorAsenaConfig): boolean => {
  const minify = config.buildOptions?.minify;

  return minify === true || (typeof minify === 'object' && minify !== null && minify.identifiers === true);
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

  if (minifiesIdentifiers(config)) {
    problems.push(
      'minify.identifiers drops component names that are read at runtime (keepNames does not preserve them)',
    );
    hints = [...hints, `disable identifier minification: ${MINIFY_HINT}`];
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
