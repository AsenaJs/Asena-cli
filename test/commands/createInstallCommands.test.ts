import { describe, expect, it } from 'bun:test';
import { installCommands, installManifest, installSelection } from '../../lib/commands/createInstallCommands';
import { DOCTOR_REQUIRED_DEPENDENCIES } from '../../lib/constants';

const defaults = { adapter: 'hono', logger: true, eslint: true, prettier: true } as const;

const ALL_OPTION_SETS = (['hono', 'ergenecore'] as const).flatMap((adapter) =>
  [true, false].flatMap((logger) =>
    [true, false].flatMap((eslint) => [true, false].map((prettier) => ({ adapter, logger, eslint, prettier }))),
  ),
);

// Package name of a `bun add` argument: `@scope/name@spec`, `name@spec` or a bare name.
const nameOf = (argument: string) => /^((?:@[^@/]+\/)?[^@]+)(?:@.*)?$/.exec(argument)?.[1] ?? argument;

describe('installCommands', () => {
  it('adds the core with the doctor-required packages and the adapter as direct dependencies', () => {
    const [core] = installCommands(defaults);

    expect(core.slice(0, 3)).toEqual(['bun', 'add', '@asenajs/asena']);
    for (const name of DOCTOR_REQUIRED_DEPENDENCIES) {
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
    const [, devDependencies] = installCommands({ ...defaults, eslint: false, prettier: false });

    expect(devDependencies).toEqual(['bun', 'add', '-D', '@types/bun', 'typescript@^7.0.2']);
  });

  it('installs the ESLint packages and the Prettier integration, in that order, when both are enabled', () => {
    const [, devDependencies] = installCommands(defaults);

    expect(devDependencies).toContain('@eslint/js');
    expect(devDependencies.slice(-2)).toEqual(['eslint-config-prettier', 'prettier']);
  });

  it('adds the logger package only when the logger is enabled', () => {
    expect(installCommands(defaults)[0]).toContain('@asenajs/asena-logger');
    expect(installCommands({ ...defaults, logger: false })[0]).not.toContain('@asenajs/asena-logger');
  });

  it('never installs the ESLint or Prettier integration when those are disabled', () => {
    const [, devDependencies] = installCommands({ ...defaults, eslint: false, prettier: false });

    expect(devDependencies.join(' ')).not.toMatch(/eslint|prettier-integration/);
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
