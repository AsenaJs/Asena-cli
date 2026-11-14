import { describe, expect, it } from 'bun:test';
import { installCommands, installManifest, installSelection } from '../../lib/commands/createInstallCommands';
import { FRAMEWORK_PACKAGES } from '../../lib/constants';

const defaults = { adapter: 'hono', logger: true, eslint: true, format: true } as const;

const ALL_OPTION_SETS = (['hono', 'ergenecore'] as const).flatMap((adapter) =>
  [true, false].flatMap((logger) =>
    [true, false].flatMap((eslint) => [true, false].map((format) => ({ adapter, logger, eslint, format }))),
  ),
);

// Package name of a `bun add` argument: `@scope/name@spec`, `name@spec` or a bare name.
const nameOf = (argument: string) => /^((?:@[^@/]+\/)?[^@]+)(?:@.*)?$/.exec(argument)?.[1] ?? argument;

// Real names rather than ESLINT_INSTALLATIONS, so that moving a package out of that list cannot hide it.
const ESLINT_PACKAGES = [
  'eslint',
  '@eslint/js',
  '@typescript-eslint/parser',
  '@typescript-eslint/eslint-plugin',
  'typescript-eslint',
];

describe('installCommands', () => {
  it('adds the framework packages and the adapter as direct dependencies', () => {
    const [core] = installCommands(defaults);

    expect(core.slice(0, 3)).toEqual(['bun', 'add', '@asenajs/asena']);
    for (const name of FRAMEWORK_PACKAGES) {
      expect(core).toContain(name);
    }
    expect(core).toContain('@asenajs/hono-adapter@latest');
    expect(core).toContain('zod@^4');
  });

  it('installs the side-by-side TypeScript 7 layout and @types/bun when ESLint is enabled', () => {
    const [, devDependencies] = installCommands(defaults);

    expect(devDependencies.slice(0, 6)).toEqual([
      'bun',
      'add',
      '-D',
      '@types/bun',
      'typescript@npm:@typescript/typescript6@^6.0.2',
      '@typescript/native@npm:typescript@^7.0.2',
    ]);
  });

  it('installs plain TypeScript 7 when ESLint is disabled', () => {
    const [, devDependencies] = installCommands({ ...defaults, eslint: false, format: false });

    expect(devDependencies).toEqual(['bun', 'add', '-D', '@types/bun', 'typescript@^7.0.2']);
  });

  it('installs the ESLint packages and then eslint-config-prettier when ESLint and formatting are enabled', () => {
    const [, devDependencies] = installCommands(defaults);

    expect(devDependencies).toContain('@eslint/js');
    expect(devDependencies.at(-1)).toBe('eslint-config-prettier');
  });

  for (const options of ALL_OPTION_SETS) {
    it(`installs neither prettier nor eslint-plugin-prettier for ${JSON.stringify(options)}`, () => {
      const names = installCommands(options).flatMap((command) => command.map(nameOf));

      expect(names).not.toContain('prettier');
      expect(names).not.toContain('eslint-plugin-prettier');
    });
  }

  it('adds the logger package only when the logger is enabled', () => {
    expect(installCommands(defaults)[0]).toContain('@asenajs/asena-logger');
    expect(installCommands({ ...defaults, logger: false })[0]).not.toContain('@asenajs/asena-logger');
  });

  it('never installs the ESLint packages or eslint-config-prettier when ESLint or formatting is disabled', () => {
    const names = (eslint: boolean, format: boolean) =>
      installCommands({ ...defaults, eslint, format }).flatMap((command) => command.map(nameOf));

    for (const format of [true, false]) {
      for (const name of [...ESLINT_PACKAGES, 'eslint-config-prettier']) {
        expect(names(false, format)).not.toContain(name);
      }
    }

    expect(names(true, false)).toContain('eslint');
    expect(names(true, false)).not.toContain('eslint-config-prettier');
  });
});

describe('installManifest', () => {
  it('writes unpinned packages as latest and pinned ones with their version', () => {
    const { dependencies, devDependencies } = installManifest(installSelection(defaults));

    expect(dependencies['@asenajs/asena']).toBe('latest');
    expect(dependencies['reflect-metadata']).toBe('latest');
    expect(dependencies['@asenajs/hono-adapter']).toBe('latest');
    expect(dependencies.zod).toBe('^4');
    expect(devDependencies['typescript']).toBe('npm:@typescript/typescript6@^6.0.2');
    expect(devDependencies['@eslint/js']).toBe('latest');
  });

  for (const options of ALL_OPTION_SETS) {
    it(`lists the same packages as the default install path for ${JSON.stringify(options)}`, () => {
      const [dependencyArguments, devDependencyArguments] = installCommands(options);
      const manifest = installManifest(installSelection(options));

      expect(dependencyArguments.slice(2).map(nameOf).sort()).toEqual(Object.keys(manifest.dependencies).sort());
      expect(devDependencyArguments.slice(3).map(nameOf).sort()).toEqual(Object.keys(manifest.devDependencies).sort());
    });
  }
});
