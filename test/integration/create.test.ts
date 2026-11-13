import { describe, expect, it } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Runs the real scaffold and the checks a generated project is expected to pass. Needs the network
// for `bun install`; a missing network makes the install fail and the test fail - it never skips.
const REPO_ROOT = path.resolve(import.meta.dir, '../..');
const CLI = path.join(REPO_ROOT, 'bin/asena.ts');
// Well under the CI job budget (ci.yml timeout-minutes), so a hung install fails here with its output.
const SCAFFOLD_TIMEOUT = 240_000;

interface RunResult {
  exitCode: number;
  output: string;
}

const run = async (cwd: string, args: string[]): Promise<RunResult> => {
  const proc = Bun.spawn([process.execPath, ...args], {
    cwd,
    env: process.env,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [stdout, stderr] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);

  return { exitCode: await proc.exited, output: `${stdout}${stderr}` };
};

// The scaffold installs `@asenajs/asena-cli` at the version this checkout reports, which is not on npm
// until its release. Skip the scaffold's own install and point the CLI devDependency at this checkout,
// so the project is checked against the code under test and never fetches an unpublished version.
const scaffold = async (adapter: 'hono' | 'ergenecore', extraArgs: string[]) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `asena-scaffold-${adapter}-`));
  const projectName = 'scaffold-app';
  const dir = path.join(root, projectName);

  try {
    const created = await run(root, [CLI, 'create', projectName, '--adapter', adapter, '--skip-install', ...extraArgs]);

    if (created.exitCode !== 0 || created.output.includes('Create failed')) {
      throw new Error(`asena create failed (exit ${created.exitCode}):\n${created.output.slice(-2000)}`);
    }

    const packageJsonPath = path.join(dir, 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

    packageJson.devDependencies['@asenajs/asena-cli'] = `file:${REPO_ROOT}`;
    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');

    const installed = await run(dir, ['install']);

    if (installed.exitCode !== 0) {
      throw new Error(`bun install failed (exit ${installed.exitCode}):\n${installed.output.slice(-2000)}`);
    }

    return { root, dir };
  } catch (error) {
    fs.rmSync(root, { recursive: true, force: true });

    throw error;
  }
};

type Check = { name: string; args: string[]; expectOutput?: RegExp };

const runChecks = async (dir: string, checks: Check[]) => {
  const failures: string[] = [];

  for (const { name, args, expectOutput } of checks) {
    const result = await run(dir, args);

    if (result.exitCode !== 0) {
      failures.push(`${name} exited ${result.exitCode}:\n${result.output.slice(-1500)}`);
    } else if (expectOutput && !expectOutput.test(result.output)) {
      failures.push(`${name} output did not match ${expectOutput}:\n${result.output.slice(-1500)}`);
    }
  }

  return failures;
};

// Without a version check, `bun run tsc` would pass on whatever compiler the bin layout resolves to.
const TSC_VERSION_7: Check = {
  name: 'tsc --version',
  args: ['run', 'tsc', '--version'],
  expectOutput: /\b7\.\d+\.\d+/,
};
const TYPECHECK: Check = { name: 'typecheck', args: ['run', 'typecheck'] };
const DOCTOR: Check = { name: 'doctor', args: [CLI, 'doctor'] };

describe('asena create scaffold passes its own checks', () => {
  for (const adapter of ['hono', 'ergenecore'] as const) {
    it(
      `${adapter} with default options: lint, format:check, typecheck and doctor exit 0 on TypeScript 7`,
      async () => {
        const { root, dir } = await scaffold(adapter, []);

        try {
          const failures = await runChecks(dir, [
            { name: 'lint', args: ['run', 'lint'] },
            { name: 'format:check', args: ['run', 'format:check'] },
            TSC_VERSION_7,
            TYPECHECK,
            DOCTOR,
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
    'hono with --no-eslint --no-prettier: typecheck and doctor exit 0 on TypeScript 7',
    async () => {
      const { root, dir } = await scaffold('hono', ['--no-eslint', '--no-prettier']);

      try {
        const failures = await runChecks(dir, [TSC_VERSION_7, TYPECHECK, DOCTOR]);

        expect(failures).toEqual([]);
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    },
    SCAFFOLD_TIMEOUT,
  );
});
