import fs from 'fs';
import path from 'path';
import { toImportPath, writeWrapperFiles } from '../helpers/wrapperHelper';
import type { WrapperOptions } from '../helpers/wrapperHelper';
import { DEVTOOLS_AGENT_EXPORT } from './coreVersion';

export const DEVTOOLS_PRELUDE_FILE = 'asena.devtools.js';

/**
 * The module that sets `globalThis[Symbol.for('asena.devtools')]`. It is its own module, imported before every
 * module of the app: the hook is set before the entry's top-level code starts the server, and the agent's output
 * capture sits beneath any console wrapper an app module installs, so a record holds what that wrapper prints.
 */
export const devtoolsPreludeSource = (agentPath: string): string =>
  [
    `import * as devtools from '${toImportPath(agentPath)}';`,
    '',
    `if (typeof devtools.${DEVTOOLS_AGENT_EXPORT} === 'function') {`,
    `  globalThis[Symbol.for('asena.devtools')] = devtools.${DEVTOOLS_AGENT_EXPORT};`,
    '} else {',
    `  console.warn(${JSON.stringify(
      `[asena console] ${toImportPath(agentPath)} has no ${DEVTOOLS_AGENT_EXPORT} export; the app runs without the devtools agent`,
    )});`,
    '}',
    '',
  ].join('\n');

export interface ConsoleWrapperOptions extends Omit<WrapperOptions, 'preludes'> {
  /** Absolute path of `@asenajs/asena/devtools`, resolved from the project root. */
  agentPath: string;
}

/** @returns The absolute path of the wrapper entry. */
export const writeConsoleWrapper = (dir: string, options: ConsoleWrapperOptions): string => {
  const { agentPath, ...wrapper } = options;

  return writeWrapperFiles(dir, {
    ...wrapper,
    preludes: { [DEVTOOLS_PRELUDE_FILE]: devtoolsPreludeSource(agentPath) },
  });
};

/** The command that runs the wrapper; the cwd must be the project root. */
export const appCommand = (root: string, entry: string, bun: string = process.execPath): string[] => {
  const tsconfig = path.join(root, 'tsconfig.json');

  return fs.existsSync(tsconfig) ? [bun, `--tsconfig-override=${tsconfig}`, entry] : [bun, entry];
};
