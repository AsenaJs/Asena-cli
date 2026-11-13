import {
  DOCTOR_REQUIRED_DEPENDENCIES,
  ESLINT_INSTALLATIONS,
  ESLINT_WITH_PRETTIER_INSTALLATIONS,
  TYPESCRIPT_DEV_DEPENDENCIES,
  TYPESCRIPT_WITH_ESLINT_DEV_DEPENDENCIES,
} from '../constants';
import { getAdapterInstallPackages } from '../helpers';
import type { ProjectSetupOptions } from '../types/create';

type InstallOptions = Pick<ProjectSetupOptions, 'adapter' | 'logger' | 'eslint' | 'prettier'>;

// argv of each `bun add` that `asena create` runs on the default install path, in order.
export const preRequestInstallCommands = (options: InstallOptions): string[][] => {
  // The adapter plus its peers: `bun add` records them in package.json, which an undeclared peer would not.
  const adapterPackages = Object.entries(getAdapterInstallPackages(options.adapter)).map(
    ([name, version]) => `${name}@${version}`,
  );
  const typescript = options.eslint ? TYPESCRIPT_WITH_ESLINT_DEV_DEPENDENCIES : TYPESCRIPT_DEV_DEPENDENCIES;
  const typescriptPackages = Object.entries(typescript).map(([name, version]) => `${name}@${version}`);

  const commands = [['bun', 'add', '@asenajs/asena', ...DOCTOR_REQUIRED_DEPENDENCIES, ...adapterPackages]];

  if (options.logger) commands.push(['bun', 'add', '@asenajs/asena-logger']);

  commands.push(['bun', 'add', '-D', '@types/bun', ...typescriptPackages]);

  return commands;
};

export const eslintInstallCommands = (options: InstallOptions): string[][] => {
  const commands = [['bun', 'add', '-D', ...ESLINT_INSTALLATIONS]];

  if (options.prettier) commands.push(['bun', 'add', '-D', ...ESLINT_WITH_PRETTIER_INSTALLATIONS]);

  return commands;
};
