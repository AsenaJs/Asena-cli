import type { Command } from 'commander';

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
