import { describe, expect, it } from 'bun:test';
import { eslintInstallCommands, preRequestInstallCommands } from '../../lib/commands/createInstallCommands';
import { DOCTOR_REQUIRED_DEPENDENCIES } from '../../lib/constants';

const defaults = { adapter: 'hono', logger: true, eslint: true, prettier: true } as const;

describe('preRequestInstallCommands', () => {
  it('adds the core with the doctor-required packages as direct dependencies', () => {
    const [core] = preRequestInstallCommands(defaults);

    expect(core.slice(0, 3)).toEqual(['bun', 'add', '@asenajs/asena']);
    expect(core).toContain('reflect-metadata');
    for (const name of DOCTOR_REQUIRED_DEPENDENCIES) {
      expect(core).toContain(name);
    }
  });

  it('installs the side-by-side TypeScript 7 layout when ESLint is enabled', () => {
    const typescript = preRequestInstallCommands(defaults).at(-1);

    expect(typescript).toEqual([
      'bun',
      'add',
      '-D',
      '@types/bun',
      'typescript@npm:@typescript/typescript6@^6.0.2',
      '@typescript/native@npm:typescript@^7.0.2',
    ]);
  });

  it('installs plain TypeScript 7 when ESLint is disabled', () => {
    const typescript = preRequestInstallCommands({ ...defaults, eslint: false }).at(-1);

    expect(typescript).toEqual(['bun', 'add', '-D', '@types/bun', 'typescript@^7.0.2']);
  });

  it('adds the logger package only when the logger is enabled', () => {
    expect(preRequestInstallCommands(defaults)).toContainEqual(['bun', 'add', '@asenajs/asena-logger']);
    expect(preRequestInstallCommands({ ...defaults, logger: false })).not.toContainEqual([
      'bun',
      'add',
      '@asenajs/asena-logger',
    ]);
  });
});

describe('eslintInstallCommands', () => {
  it('installs the ESLint packages as dev dependencies, plus the Prettier integration when enabled', () => {
    const commands = eslintInstallCommands(defaults);

    expect(commands[0].slice(0, 3)).toEqual(['bun', 'add', '-D']);
    expect(commands[0]).toContain('@eslint/js');
    expect(commands).toHaveLength(2);
  });

  it('installs only the base ESLint packages when Prettier is disabled', () => {
    expect(eslintInstallCommands({ ...defaults, prettier: false })).toHaveLength(1);
  });
});
