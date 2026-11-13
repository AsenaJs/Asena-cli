import { afterAll, describe, expect, it } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildConsoleUi } from '../../console-ui/build';
import { CLI_INSTALL_SOURCE_ENV } from '../../lib/commands/cliInstall';
import { installManifest, installSelection } from '../../lib/commands/createInstallCommands';

// Runs the real `asena create` with its default install path, then the checks a generated project is
// expected to pass. @asenajs/asena-cli is this checkout, packed; every other package comes from the
// registry, so the test needs the network: without it the install fails and the test fails - it never skips.
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

const run = async (
  cwd: string,
  args: string[],
  env: Record<string, string | undefined> = process.env,
): Promise<RunResult> => {
  const proc = Bun.spawn([process.execPath, ...args], {
    cwd,
    env,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [stdout, stderr] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);

  return { exitCode: await proc.exited, output: `${stdout}${stderr}` };
};

let packDir: string | undefined;
let packed: Promise<string> | undefined;

// Builds this checkout the way `bun run build` does, but into a temporary directory, and packs it there.
const packCheckout = async (): Promise<string> => {
  const destination = fs.mkdtempSync(path.join(os.tmpdir(), 'asena-cli-pack-'));

  packDir = destination;

  const packageDir = path.join(destination, 'package');
  const dist = path.join(packageDir, 'dist');

  fs.mkdirSync(packageDir);
  fs.copyFileSync(path.join(REPO_ROOT, 'package.json'), path.join(packageDir, 'package.json'));

  const compiled = await run(REPO_ROOT, ['run', 'tsc', '-p', 'tsconfig.json', '--outDir', dist]);

  if (compiled.exitCode !== 0) {
    throw new Error(`tsc failed (exit ${compiled.exitCode}):\n${compiled.output.slice(-2000)}`);
  }

  await buildConsoleUi(path.join(dist, 'console-ui'));

  const pack = await run(packageDir, ['pm', 'pack', '--destination', destination, '--ignore-scripts']);
  const tarballs = fs.readdirSync(destination).filter((file) => file.endsWith('.tgz'));

  if (pack.exitCode !== 0 || tarballs.length !== 1) {
    throw new Error(`bun pm pack failed (exit ${pack.exitCode}, ${tarballs.length} tarballs):\n${pack.output}`);
  }

  return path.join(destination, ...tarballs);
};

const packedCheckout = () => (packed ??= packCheckout());

// Runs the default install path of `asena create` (no --skip-install) and returns the project. Every
// package the install selection lists must be in the package.json that the install writes, and
// @asenajs/asena-cli must be the packed checkout.
const scaffold = async (adapter: 'hono' | 'ergenecore', extraArgs: string[], preference: InstallPreference) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `asena-scaffold-${adapter}-`));
  const projectName = 'scaffold-app';
  const dir = path.join(root, projectName);

  try {
    const tarball = await packedCheckout();
    const env = { ...process.env, [CLI_INSTALL_SOURCE_ENV]: tarball };
    const created = await run(root, [CLI, 'create', projectName, '--adapter', adapter, ...extraArgs], env);

    if (created.exitCode !== 0 || created.output.includes('Create failed')) {
      throw new Error(`asena create failed (exit ${created.exitCode}):\n${created.output.slice(-2000)}`);
    }

    const packageJson = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
    const { dependencies, devDependencies } = installManifest(installSelection(preference));
    const missing = [
      ...Object.keys(dependencies)
        .filter((name) => !(name in (packageJson.dependencies ?? {})))
        .map((name) => `dependencies.${name}`),
      ...Object.keys(devDependencies)
        .filter((name) => !(name in (packageJson.devDependencies ?? {})))
        .map((name) => `devDependencies.${name}`),
    ];

    if (missing.length > 0) {
      throw new Error(`asena create did not write to package.json: ${missing.join(', ')}`);
    }

    const cli = packageJson.devDependencies?.['@asenajs/asena-cli'];

    if (cli !== `file:${tarball}`) {
      throw new Error(`asena create installed @asenajs/asena-cli from ${cli}, not from ${tarball}`);
    }

    return { root, dir };
  } catch (error) {
    fs.rmSync(root, { recursive: true, force: true });

    throw error;
  }
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

type InstallPreference = Parameters<typeof installSelection>[0];

describe('asena create scaffold passes its own checks', () => {
  afterAll(() => {
    if (packDir) fs.rmSync(packDir, { recursive: true, force: true });
  });

  for (const adapter of ['hono', 'ergenecore'] as const) {
    it(
      `${adapter} with default options: default install, generators, lint, format:check, typecheck and doctor exit 0 on TypeScript 7`,
      async () => {
        const preference: InstallPreference = { adapter, logger: true, eslint: true, prettier: true };
        const { root, dir } = await scaffold(adapter, [], preference);

        try {
          const failures = [
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
      const { root, dir } = await scaffold('hono', ['--no-eslint', '--no-prettier'], preference);

      try {
        const failures = [
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
