import { afterEach, describe, expect, it } from 'bun:test';
import fs from 'fs';
import path from 'path';
import { Command } from 'commander';
import { Commands } from '../../lib/commands/Commands';
import { Doctor } from '../../lib/commands/Doctor';
import { DOCTOR_CHECKS, exitCodeFor, runDoctor } from '../../lib/doctor';
import type { CheckResult } from '../../lib/types';

const createdDirs: string[] = [];

let dirCounter = 0;

const makeTmpDir = (): string => {
  const dir = path.join(import.meta.dir, `../.tmp-doctor-${++dirCounter}`);

  fs.mkdirSync(dir, { recursive: true });

  createdDirs.push(dir);

  return dir;
};

afterEach(() => {
  for (const dir of createdDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }

  createdDirs.length = 0;
});

const writeFiles = (dir: string, files: Record<string, string>) => {
  for (const [relPath, content] of Object.entries(files)) {
    const filePath = path.join(dir, relPath);

    fs.mkdirSync(path.dirname(filePath), { recursive: true });

    fs.writeFileSync(filePath, content);
  }
};

const TSCONFIG_WITH_DECORATORS = JSON.stringify(
  { compilerOptions: { experimentalDecorators: true, emitDecoratorMetadata: true } },
  null,
  2,
);

const asenaConfigFile = (buildOptions?: Record<string, unknown>) =>
  `export default ${JSON.stringify({ rootFile: './src/index.ts', sourceFolder: './src', buildOptions }, null, 2)};\n`;

const packageJsonFile = (dependencies: Record<string, string>) =>
  JSON.stringify({ name: 'fixture', version: '0.0.0', dependencies }, null, 2);

const fakePackage = (dir: string, name: string, version: string, fields?: Record<string, unknown>) => {
  writeFiles(dir, {
    [`node_modules/${name.split('/').join('/')}/package.json`]: JSON.stringify({ name, version, ...fields }, null, 2),
  });
};

const writeValidProject = (dir: string) => {
  writeFiles(dir, {
    'tsconfig.json': TSCONFIG_WITH_DECORATORS,
    'asena-config.ts': asenaConfigFile(),
    'src/index.ts': 'export default class Index {}\n',
    'package.json': packageJsonFile({
      '@asenajs/asena': '^0.10.0',
      'reflect-metadata': '^0.2.2',
      '@asenajs/hono-adapter': '^0.10.0',
      hono: '^4.0.0',
      zod: '^3.0.0',
    }),
  });

  fakePackage(dir, '@asenajs/asena', '0.10.2');
  fakePackage(dir, '@asenajs/hono-adapter', '0.10.1', {
    peerDependencies: { '@asenajs/asena': '^0.10.0' },
  });
  fakePackage(dir, 'hono', '4.9.11');
  fakePackage(dir, 'zod', '4.1.5');
};

const resultOf = (results: CheckResult[], name: string): CheckResult => {
  const result = results.find((r) => r.name === name);

  if (!result) {
    throw new Error(`check ${name} missing from results`);
  }

  return result;
};

describe('doctor', () => {
  it('runs the five checks in the declared order', async () => {
    const dir = makeTmpDir();

    writeValidProject(dir);

    const results = await runDoctor(dir);

    expect(results.map((r) => r.name)).toEqual(DOCTOR_CHECKS.map((check) => check.name));
  });

  describe('tsconfig-decorators', () => {
    it('passes when both decorator flags are true', async () => {
      const dir = makeTmpDir();

      writeFiles(dir, { 'tsconfig.json': TSCONFIG_WITH_DECORATORS });

      const result = resultOf(await runDoctor(dir), 'tsconfig-decorators');

      expect(result.ok).toBe(true);
      expect(result.hint).toBeUndefined();
    });

    it('fails and names both flags when they are missing', async () => {
      const dir = makeTmpDir();

      writeFiles(dir, {
        'tsconfig.json': JSON.stringify({ compilerOptions: { experimentalDecorators: true } }),
      });

      const result = resultOf(await runDoctor(dir), 'tsconfig-decorators');

      expect(result.ok).toBe(false);
      expect(result.detail).toContain('emitDecoratorMetadata');
      expect(result.hint).toContain('experimentalDecorators');
      expect(result.hint).toContain('emitDecoratorMetadata');
    });

    it('fails when tsconfig.json does not exist', async () => {
      const dir = makeTmpDir();

      const result = resultOf(await runDoctor(dir), 'tsconfig-decorators');

      expect(result.ok).toBe(false);
      expect(result.detail).toContain('not found');
    });
  });

  describe('asena-config', () => {
    it('passes when the config exists and its paths are on disk', async () => {
      const dir = makeTmpDir();

      writeFiles(dir, {
        'asena-config.ts': asenaConfigFile(),
        'src/index.ts': 'export default class Index {}\n',
      });

      const result = resultOf(await runDoctor(dir), 'asena-config');

      expect(result.ok).toBe(true);
    });

    it('passes when identifiers are not minified - the shape asena init writes', async () => {
      const dir = makeTmpDir();

      writeFiles(dir, {
        'asena-config.ts': asenaConfigFile({
          minify: { whitespace: true, syntax: true, identifiers: false, keepNames: true },
        }),
        'src/index.ts': 'export default class Index {}\n',
      });

      const result = resultOf(await runDoctor(dir), 'asena-config');

      expect(result.ok).toBe(true);
    });

    it('fails when identifiers are minified, even with keepNames - Bun does not preserve class names', async () => {
      const dir = makeTmpDir();

      writeFiles(dir, {
        'asena-config.ts': asenaConfigFile({
          minify: { whitespace: true, syntax: true, identifiers: true, keepNames: true },
        }),
        'src/index.ts': 'export default class Index {}\n',
      });

      const result = resultOf(await runDoctor(dir), 'asena-config');

      expect(result.ok).toBe(false);
      expect(result.detail).toContain('runtime');
      expect(result.hint).toContain('identifiers: false');
    });

    it('fails when minify is true', async () => {
      const dir = makeTmpDir();

      writeFiles(dir, {
        'asena-config.ts': asenaConfigFile({ minify: true }),
        'src/index.ts': 'export default class Index {}\n',
      });

      const result = resultOf(await runDoctor(dir), 'asena-config');

      expect(result.ok).toBe(false);
      expect(result.hint).toContain('identifiers: false');
    });

    it('fails when rootFile does not exist on disk', async () => {
      const dir = makeTmpDir();

      writeFiles(dir, {
        'asena-config.ts': asenaConfigFile(),
      });

      const result = resultOf(await runDoctor(dir), 'asena-config');

      expect(result.ok).toBe(false);
      expect(result.detail).toContain('does not exist');
    });

    it('fails when no asena-config.ts is found', async () => {
      const dir = makeTmpDir();

      const result = resultOf(await runDoctor(dir), 'asena-config');

      expect(result.ok).toBe(false);
      expect(result.detail).toContain('no asena-config.ts');
    });
  });

  describe('direct-dependencies', () => {
    it('passes when every required package is a direct dependency', async () => {
      const dir = makeTmpDir();

      writeFiles(dir, {
        'package.json': packageJsonFile({
          '@asenajs/asena': '^0.10.0',
          'reflect-metadata': '^0.2.2',
          '@asenajs/hono-adapter': '^0.10.0',
          '@asenajs/ergenecore': '^0.10.0',
          hono: '^4.0.0',
          zod: '^3.0.0',
        }),
      });

      const result = resultOf(await runDoctor(dir), 'direct-dependencies');

      expect(result.ok).toBe(true);
    });

    it('fails and lists the missing packages with a bun add hint', async () => {
      const dir = makeTmpDir();

      writeFiles(dir, {
        'package.json': packageJsonFile({
          '@asenajs/hono-adapter': '^0.10.0',
          'reflect-metadata': '^0.2.2',
        }),
      });

      const result = resultOf(await runDoctor(dir), 'direct-dependencies');

      expect(result.ok).toBe(false);
      expect(result.detail).toContain('hono');
      expect(result.detail).toContain('zod');
      expect(result.detail).toContain('@asenajs/asena');
      expect(result.hint).toContain('bun add');
      expect(result.hint).toContain('hono');
      expect(result.hint).toContain('zod');
      expect(result.hint).toContain('@asenajs/asena');
    });

    it('requires zod when only ergenecore is listed', async () => {
      const dir = makeTmpDir();

      writeFiles(dir, {
        'package.json': packageJsonFile({
          '@asenajs/asena': '^0.10.0',
          'reflect-metadata': '^0.2.2',
          '@asenajs/ergenecore': '^0.10.0',
        }),
      });

      const result = resultOf(await runDoctor(dir), 'direct-dependencies');

      expect(result.ok).toBe(false);
      expect(result.detail).toContain('zod');
    });

    it('fails when package.json does not exist', async () => {
      const dir = makeTmpDir();

      const result = resultOf(await runDoctor(dir), 'direct-dependencies');

      expect(result.ok).toBe(false);
      expect(result.detail).toContain('package.json');
    });
  });

  describe('duplicate-packages', () => {
    it('passes when each tracked package resolves to a single version', async () => {
      const dir = makeTmpDir();

      fakePackage(dir, '@asenajs/asena', '0.10.2');
      fakePackage(dir, 'hono', '4.9.11');
      fakePackage(dir, 'zod', '4.1.5');

      const result = resultOf(await runDoctor(dir), 'duplicate-packages');

      expect(result.ok).toBe(true);
    });

    it('passes when a nested copy has the same version', async () => {
      const dir = makeTmpDir();

      fakePackage(dir, 'hono', '4.9.11');
      fakePackage(path.join(dir, 'node_modules', 'some-lib'), 'hono', '4.9.11');

      const result = resultOf(await runDoctor(dir), 'duplicate-packages');

      expect(result.ok).toBe(true);
    });

    it('fails listing path → version when two distinct hono versions are installed', async () => {
      const dir = makeTmpDir();

      fakePackage(dir, 'hono', '4.9.11');
      fakePackage(path.join(dir, 'node_modules', 'some-lib'), 'hono', '3.3.0');

      const result = resultOf(await runDoctor(dir), 'duplicate-packages');

      expect(result.ok).toBe(false);
      expect(result.detail).toContain('4.9.11');
      expect(result.detail).toContain('3.3.0');
      expect(result.detail).toContain('→');
      expect(result.detail).toContain(path.join('node_modules', 'some-lib', 'node_modules', 'hono'));
      expect(result.hint).toContain('instanceof');
      expect(result.hint).toContain('bun update hono');
    });

    it("finds a second copy inside Bun's isolated-linker store (node_modules/.bun)", async () => {
      const dir = makeTmpDir();

      fakePackage(dir, 'hono', '4.9.11');
      fakePackage(path.join(dir, 'node_modules', '.bun', 'some-lib@1.0.0'), 'hono', '3.3.0');

      const result = resultOf(await runDoctor(dir), 'duplicate-packages');

      expect(result.ok).toBe(false);
      expect(result.detail).toContain('3.3.0');
      expect(result.detail).toContain(path.join('.bun', 'some-lib@1.0.0', 'node_modules', 'hono'));
    });

    it('fails when node_modules does not exist', async () => {
      const dir = makeTmpDir();

      const result = resultOf(await runDoctor(dir), 'duplicate-packages');

      expect(result.ok).toBe(false);
      expect(result.detail).toContain('node_modules not found');
    });
  });

  describe('peer-ranges', () => {
    it('passes when the installed core version satisfies every adapter range', async () => {
      const dir = makeTmpDir();

      fakePackage(dir, '@asenajs/asena', '0.10.2');
      fakePackage(dir, '@asenajs/hono-adapter', '0.10.1', {
        peerDependencies: { '@asenajs/asena': '^0.10.0' },
      });

      const result = resultOf(await runDoctor(dir), 'peer-ranges');

      expect(result.ok).toBe(true);
      expect(result.detail).toContain('0.10.2');
    });

    it('fails listing the range and the installed version when unsatisfied', async () => {
      const dir = makeTmpDir();

      fakePackage(dir, '@asenajs/asena', '0.10.2');
      fakePackage(dir, '@asenajs/hono-adapter', '0.11.0', {
        peerDependencies: { '@asenajs/asena': '^0.11.0' },
      });

      const result = resultOf(await runDoctor(dir), 'peer-ranges');

      expect(result.ok).toBe(false);
      expect(result.detail).toContain('@asenajs/hono-adapter');
      expect(result.detail).toContain('^0.11.0');
      expect(result.detail).toContain('0.10.2');
    });

    it('checks an adapter installed as a symlink (isolated linker, pnpm)', async () => {
      const dir = makeTmpDir();

      fakePackage(dir, '@asenajs/asena', '0.10.2');
      writeFiles(dir, {
        'store/hono-adapter/package.json': JSON.stringify({
          name: '@asenajs/hono-adapter',
          version: '0.11.0',
          peerDependencies: { '@asenajs/asena': '^0.11.0' },
        }),
      });
      fs.symlinkSync(
        path.join(dir, 'store', 'hono-adapter'),
        path.join(dir, 'node_modules', '@asenajs', 'hono-adapter'),
      );

      const result = resultOf(await runDoctor(dir), 'peer-ranges');

      expect(result.ok).toBe(false);
      expect(result.detail).toContain('^0.11.0');
    });

    it('fails when the core package is not installed', async () => {
      const dir = makeTmpDir();

      fakePackage(dir, '@asenajs/hono-adapter', '0.10.1', {
        peerDependencies: { '@asenajs/asena': '^0.10.0' },
      });

      const result = resultOf(await runDoctor(dir), 'peer-ranges');

      expect(result.ok).toBe(false);
      expect(result.detail).toContain('@asenajs/asena');
    });
  });

  describe('exitCodeFor', () => {
    const result = (ok: boolean): CheckResult => ({ name: 'x', ok, detail: ok ? 'fine' : 'broken' });

    it('returns 0 when every check passed', () => {
      expect(exitCodeFor([result(true), result(true)])).toBe(0);
    });

    it('returns 1 when any check failed', () => {
      expect(exitCodeFor([result(true), result(false)])).toBe(1);
    });

    it('returns 0 for an empty result list', () => {
      expect(exitCodeFor([])).toBe(0);
    });
  });

  describe('command', () => {
    const runProgram = async (cwd: string, args: string[]): Promise<{ lines: string[]; exitCode: number }> => {
      const program = new Command();

      program.addCommand(new Doctor().command());

      const captured: string[] = [];
      const originalLog = console.log;
      const originalCwd = process.cwd();
      const savedExitCode = process.exitCode;

      console.log = (...logged: unknown[]) => {
        captured.push(logged.map(String).join(' '));
      };

      process.chdir(cwd);

      let exitCode = 0;

      try {
        await program.parseAsync(args, { from: 'user' });

        exitCode = typeof process.exitCode === 'number' ? process.exitCode : Number(process.exitCode ?? 0);
      } finally {
        process.chdir(originalCwd);

        console.log = originalLog;

        process.exitCode = savedExitCode ?? 0;
      }

      return { lines: captured, exitCode };
    };

    it('prints one line per check and an indented hint for failures', async () => {
      const dir = makeTmpDir();

      writeFiles(dir, {
        'tsconfig.json': JSON.stringify({ compilerOptions: {} }),
      });

      const { lines } = await runProgram(dir, ['doctor']);

      expect(lines.filter((line) => /^[✓✗] /.test(line))).toHaveLength(DOCTOR_CHECKS.length);

      const failed = lines.find((line) => line.startsWith('✗ tsconfig-decorators'));

      expect(failed).toBeDefined();
      expect(failed).toContain('—');

      const failedIndex = lines.indexOf(failed!);

      expect(lines[failedIndex + 1]).toMatch(/^ {2}hint: /);
    });

    it('prints results that parse to the same array with --json', async () => {
      const dir = makeTmpDir();

      writeValidProject(dir);

      const { lines } = await runProgram(dir, ['doctor', '--json']);

      const printed = JSON.parse(lines.join('\n')) as CheckResult[];

      expect(printed).toEqual(await runDoctor(dir));
    });

    it('exits 1 when a check fails and 0 otherwise', async () => {
      const failing = makeTmpDir();

      writeFiles(failing, {
        'tsconfig.json': JSON.stringify({ compilerOptions: {} }),
      });

      expect((await runProgram(failing, ['doctor'])).exitCode).toBe(1);

      const passing = makeTmpDir();

      writeValidProject(passing);

      expect((await runProgram(passing, ['doctor'])).exitCode).toBe(0);
    });

    it('is registered on the program', () => {
      const program = (new Commands() as unknown as { program: Command }).program;

      expect(program.commands.map((command) => command.name())).toContain('doctor');
    });
  });
});
