import { describe, expect, it } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Runs the real scaffold and the checks a generated project is expected to pass. Needs the network
// for `bun add`; a missing network makes the scaffold fail and the test fail - it never skips.
const CLI = path.resolve(import.meta.dir, '../../bin/asena.ts');
const SCAFFOLD_TIMEOUT = 900_000;

interface RunResult {
  exitCode: number;
  output: string;
}

// The scaffold runs `asena --version` and installs that CLI into the project. Put this checkout's
// CLI first on PATH so the scaffold installs the version under test, not whatever is global.
const cliOnPath = (root: string) => {
  const binDir = path.join(root, '.bin');

  fs.mkdirSync(binDir);
  fs.writeFileSync(path.join(binDir, 'asena'), `#!/bin/sh\nexec "${process.execPath}" "${CLI}" "$@"\n`, {
    mode: 0o755,
  });

  return `${binDir}${path.delimiter}${process.env.PATH ?? ''}`;
};

const run = async (cwd: string, args: string[], env: Record<string, string> = {}): Promise<RunResult> => {
  const proc = Bun.spawn([process.execPath, ...args], {
    cwd,
    env: { ...process.env, ...env },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [stdout, stderr] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);

  return { exitCode: await proc.exited, output: `${stdout}${stderr}` };
};

const scaffold = async (adapter: 'hono' | 'ergenecore', extraArgs: string[]) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `asena-scaffold-${adapter}-`));
  const projectName = 'scaffold-app';

  const created = await run(root, [CLI, 'create', projectName, '--adapter', adapter, ...extraArgs], {
    PATH: cliOnPath(root),
  });

  if (created.exitCode !== 0 || created.output.includes('Create failed')) {
    fs.rmSync(root, { recursive: true, force: true });
    throw new Error(`asena create failed (exit ${created.exitCode}):\n${created.output.slice(-2000)}`);
  }

  return { root, dir: path.join(root, projectName) };
};

const runChecks = async (dir: string, checks: [name: string, args: string[]][]) => {
  const failures: string[] = [];

  for (const [name, args] of checks) {
    const result = await run(dir, args);

    if (result.exitCode !== 0) {
      failures.push(`${name} exited ${result.exitCode}:\n${result.output.slice(-1500)}`);
    }
  }

  return failures;
};

const TSC = ['x', 'tsc', '--noEmit'];
const DOCTOR = [CLI, 'doctor'];

describe('asena create scaffold passes its own checks', () => {
  for (const adapter of ['hono', 'ergenecore'] as const) {
    it(
      `${adapter} with default options: lint, format:check, tsc and doctor exit 0`,
      async () => {
        const { root, dir } = await scaffold(adapter, []);

        try {
          const failures = await runChecks(dir, [
            ['lint', ['run', 'lint']],
            ['format:check', ['run', 'format:check']],
            ['tsc', TSC],
            ['doctor', DOCTOR],
          ]);

          expect(failures).toEqual([]);
        } finally {
          fs.rmSync(root, { recursive: true, force: true });
        }
      },
      SCAFFOLD_TIMEOUT,
    );
  }

  it(
    'hono with --no-eslint --no-prettier: tsc and doctor exit 0',
    async () => {
      const { root, dir } = await scaffold('hono', ['--no-eslint', '--no-prettier']);

      try {
        const failures = await runChecks(dir, [
          ['tsc', TSC],
          ['doctor', DOCTOR],
        ]);

        expect(failures).toEqual([]);
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    },
    SCAFFOLD_TIMEOUT,
  );
});
