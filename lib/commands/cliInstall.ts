import fs from 'node:fs';
import path from 'node:path';
import type { Command } from 'commander';

// Test seam, not user-facing: the scaffold test points it at a packed tarball of this checkout.
export const CLI_INSTALL_SOURCE_ENV = 'ASENA_CLI_INSTALL_SOURCE';

// The version `asena --version` prints; scripts/sync-version.ts keeps it equal to package.json.
export const runningCliVersion = (command: Command): string => {
  let program = command;

  while (program.parent) program = program.parent;

  const version = program.version();

  if (!version) {
    throw new Error(
      `Cannot tell which version of @asenajs/asena-cli is running: \`${command.name()}\` is not part of the asena program`,
    );
  }

  return version;
};

export const cliInstallSpecifier = (cliVersion: string): string => {
  const source = process.env[CLI_INSTALL_SOURCE_ENV];

  if (source === undefined) return `@asenajs/asena-cli@${cliVersion}`;

  const isPackedTarball =
    path.isAbsolute(source) && path.extname(source) === '.tgz' && fs.existsSync(source) && fs.statSync(source).isFile();

  if (!isPackedTarball) {
    throw new Error(
      `${CLI_INSTALL_SOURCE_ENV} must be the absolute path of a packed @asenajs/asena-cli .tgz, got ${JSON.stringify(source)}`,
    );
  }

  return `@asenajs/asena-cli@file:${source}`;
};
