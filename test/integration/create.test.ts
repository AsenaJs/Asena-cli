import { describe, expect, it } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { eslintInstallCommands, preRequestInstallCommands } from '../../lib/commands/createInstallCommands';

// Runs the real scaffold and the checks a generated project is expected to pass. Needs the network
// for `bun install`; a missing network makes the install fail and the test fail - it never skips.
const REPO_ROOT = path.resolve(import.meta.dir, '../..');
const CLI = path.join(REPO_ROOT, 'bin/asena.ts');
const GENERATE_MODULE = path.join(REPO_ROOT, 'lib/commands/Generate.ts');
const INQUIRER_MODULE = Bun.resolveSync('inquirer', REPO_ROOT);
// Well under the CI job budget (ci.yml timeout-minutes), so a hung install fails here with its output.
const SCAFFOLD_TIMEOUT = 240_000;

const GENERATOR_KINDS = [
  'controller',
  'service',
  'middleware',
  'validator',
  'config',
  'exception-handler',
  'websocket',
] as const;

// Answers every prompt the generators ask, so the real `asena generate` code runs unattended.
const GENERATOR_DRIVER = `import inquirer from ${JSON.stringify(INQUIRER_MODULE)};
import { Generate } from ${JSON.stringify(GENERATE_MODULE)};

inquirer.prompt = async () => ({ elementName: 'Sample', path: '/sample' });

await new Generate().command().parseAsync([process.argv[2]], { from: 'user' });
`;

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

// The `bun add` calls `asena create` makes on its default install path, which `--skip-install` bypasses.
const installDefaultPath = async (dir: string, preference: InstallPreference): Promise<string[]> => {
  const commands = [
    ...preRequestInstallCommands(preference),
    ...(preference.eslint ? eslintInstallCommands(preference) : []),
  ];
  const failures: string[] = [];

  for (const command of commands) {
    const result = await run(dir, command.slice(1));

    if (result.exitCode !== 0) {
      failures.push(`${command.join(' ')} exited ${result.exitCode}:\n${result.output.slice(-1500)}`);
    }
  }

  return failures;
};

const runGenerators = async (root: string, dir: string): Promise<string[]> => {
  const driver = path.join(root, 'generate-driver.mjs');
  const failures: string[] = [];

  fs.writeFileSync(driver, GENERATOR_DRIVER);

  for (const kind of GENERATOR_KINDS) {
    const result = await run(dir, [driver, kind]);

    if (result.exitCode !== 0 || /Build failed|already exists/.test(result.output)) {
      failures.push(`generate ${kind} exited ${result.exitCode}:\n${result.output.slice(-1500)}`);
    }
  }

  const generated = (fs.readdirSync(path.join(dir, 'src'), { recursive: true }) as string[]).filter((file) =>
    path.basename(file).startsWith('Sample'),
  );

  if (generated.length !== GENERATOR_KINDS.length) {
    failures.push(`expected ${GENERATOR_KINDS.length} generated Sample files, found: ${generated.join(', ')}`);
  }

  return failures;
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

type InstallPreference = Parameters<typeof preRequestInstallCommands>[0];

describe('asena create scaffold passes its own checks', () => {
  for (const adapter of ['hono', 'ergenecore'] as const) {
    it(
      `${adapter} with default options: default install, generators, lint, format:check, typecheck and doctor exit 0 on TypeScript 7`,
      async () => {
        const preference: InstallPreference = { adapter, logger: true, eslint: true, prettier: true };
        const { root, dir } = await scaffold(adapter, []);

        try {
          const failures = [
            ...(await installDefaultPath(dir, preference)),
            ...(await runGenerators(root, dir)),
            ...(await runChecks(dir, [
              { name: 'lint', args: ['run', 'lint'] },
              { name: 'format:check', args: ['run', 'format:check'] },
              TSC_VERSION_7,
              TYPECHECK,
              DOCTOR,
            ])),
          ];

          expect(failures).toEqual([]);
        } finally {
          fs.rmSync(root, { recursive: true, force: true });
        }
      },
      SCAFFOLD_TIMEOUT,
    );
  }

  it(
    'hono with --no-eslint --no-prettier: default install, generators, typecheck and doctor exit 0 on TypeScript 7',
    async () => {
      const preference: InstallPreference = { adapter: 'hono', logger: true, eslint: false, prettier: false };
      const { root, dir } = await scaffold('hono', ['--no-eslint', '--no-prettier']);

      try {
        const failures = [
          ...(await installDefaultPath(dir, preference)),
          ...(await runGenerators(root, dir)),
          ...(await runChecks(dir, [TSC_VERSION_7, TYPECHECK, DOCTOR])),
        ];

        expect(failures).toEqual([]);
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    },
    SCAFFOLD_TIMEOUT,
  );
});
