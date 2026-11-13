import {
  DOCTOR_REQUIRED_DEPENDENCIES,
  ESLINT_INSTALLATIONS,
  ESLINT_WITH_FORMAT_INSTALLATIONS,
  TYPESCRIPT_DEV_DEPENDENCIES,
  TYPESCRIPT_WITH_ESLINT_DEV_DEPENDENCIES,
} from '../constants';
import { getAdapterInstallPackages } from '../helpers';
import type { ProjectSetupOptions } from '../types/create';

type InstallOptions = Pick<ProjectSetupOptions, 'adapter' | 'logger' | 'eslint' | 'format'>;

// A package without a version is installed unpinned: `latest` in package.json.
interface InstallPackage {
  name: string;
  version?: string;
}

export interface InstallSelection {
  dependencies: InstallPackage[];
  devDependencies: InstallPackage[];
}

const unpinned = (names: readonly string[]): InstallPackage[] => names.map((name) => ({ name }));

const pinned = (record: Record<string, string>): InstallPackage[] =>
  Object.entries(record).map(([name, version]) => ({ name, version }));

// The one list of packages `asena create` installs. The default install path and the --skip-install
// package.json are both derived from it, so the two cannot list different packages.
export const installSelection = (options: InstallOptions): InstallSelection => {
  // The adapter and its peers: an undeclared peer is not written to package.json by the package manager.
  const dependencies = [
    ...unpinned(['@asenajs/asena', ...DOCTOR_REQUIRED_DEPENDENCIES]),
    ...pinned(getAdapterInstallPackages(options.adapter)),
  ];

  if (options.logger) dependencies.push(...unpinned(['@asenajs/asena-logger']));

  const devDependencies = [
    ...unpinned(['@types/bun']),
    ...pinned(options.eslint ? TYPESCRIPT_WITH_ESLINT_DEV_DEPENDENCIES : TYPESCRIPT_DEV_DEPENDENCIES),
  ];

  if (options.eslint) {
    devDependencies.push(...unpinned(ESLINT_INSTALLATIONS));

    if (options.format) devDependencies.push(...unpinned(ESLINT_WITH_FORMAT_INSTALLATIONS));
  }

  return { dependencies, devDependencies };
};

export const installManifest = (selection: InstallSelection) => {
  const toRecord = (packages: InstallPackage[]) =>
    Object.fromEntries(packages.map(({ name, version }) => [name, version ?? 'latest']));

  return {
    dependencies: toRecord(selection.dependencies),
    devDependencies: toRecord(selection.devDependencies),
  };
};

const specifier = ({ name, version }: InstallPackage) => (version ? `${name}@${version}` : name);

// argv of the two `bun add` calls that `asena create` runs on the default install path.
export const installCommands = (options: InstallOptions): string[][] => {
  const { dependencies, devDependencies } = installSelection(options);

  return [
    ['bun', 'add', ...dependencies.map(specifier)],
    ['bun', 'add', '-D', ...devDependencies.map(specifier)],
  ];
};
