import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, spyOn } from 'bun:test';
import inquirer from 'inquirer';
import { Create } from '../../lib/commands/Create';

const CLI = path.resolve(import.meta.dir, '../../bin/asena.ts');

const EXPECTED_FMT = {
  printWidth: 120,
  singleQuote: true,
  tabWidth: 2,
  useTabs: false,
  endOfLine: 'lf',
  semi: true,
  quoteProps: 'as-needed',
  jsxSingleQuote: false,
  trailingComma: 'all',
  bracketSpacing: true,
  bracketSameLine: false,
  arrowParens: 'always',
  proseWrap: 'preserve',
  htmlWhitespaceSensitivity: 'css',
  vueIndentScriptAndStyle: false,
  embeddedLanguageFormatting: 'auto',
  objectWrap: 'preserve',
  experimentalTernaries: false,
  experimentalOperatorPosition: 'end',
  singleAttributePerLine: false,
  requirePragma: false,
  insertPragma: false,
  checkIgnorePragma: false,
  insertFinalNewline: true,
  sortImports: false,
  jsdoc: false,
  sortTailwindcss: false,
  sortPackageJson: false,
  ignorePatterns: ['coverage/', 'bun.lockb', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', '*.md'],
};

interface Spawned {
  exitCode: number;
  stdout: string;
  stderr: string;
}

interface CreateRun {
  exitCode: number;
  stderr: string;
  files: Record<string, string>;
  formatCheck?: Spawned;
}

const spawn = async (cwd: string, args: string[]): Promise<Spawned> => {
  const proc = Bun.spawn([process.execPath, ...args], { cwd, stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  return { exitCode, stdout, stderr };
};

const readTree = (dir: string): Record<string, string> =>
  fs.existsSync(dir)
    ? Object.fromEntries(
        (fs.readdirSync(dir, { recursive: true }) as string[])
          .filter((file) => fs.statSync(path.join(dir, file)).isFile())
          .sort()
          .map((file) => [file, fs.readFileSync(path.join(dir, file), 'utf8')]),
      )
    : {};

// Runs the real `asena create app --skip-install` with `args` beside an `app` directory that already holds
// `existing`, returns every file it left there, and runs the project's format:check when it has one.
const runCreate = async (args: string[], existing: Record<string, string> = {}): Promise<CreateRun> => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'asena-create-format-'));
  const dir = path.join(root, 'app');

  try {
    for (const [file, text] of Object.entries(existing)) {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, file), text);
    }

    const created = await spawn(root, [CLI, 'create', 'app', '--skip-install', ...args]);
    const files = readTree(dir);
    const scripts = files['package.json'] ? JSON.parse(files['package.json']).scripts : undefined;
    const formatCheck = scripts?.['format:check'] ? await spawn(dir, ['run', 'format:check']) : undefined;

    return { exitCode: created.exitCode, stderr: created.stderr, files, formatCheck };
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
};

const createProject = (flags: string[], existing: Record<string, string> = {}) =>
  runCreate(['--adapter', 'hono', ...flags], existing);

const prettierEntries = (names: string[]) => names.filter((name) => name.includes('prettier'));

describe('asena create formatting setup', () => {
  it('formats with bun fmt by default: a [fmt] table in bunfig.toml, bun fmt scripts and no Prettier', async () => {
    const { exitCode, stderr, files, formatCheck } = await createProject([]);

    expect(exitCode).toBe(0);
    expect(stderr).not.toContain('Create failed');
    expect(prettierEntries(Object.keys(files))).toEqual([]);
    expect(Bun.TOML.parse(files['bunfig.toml'] ?? '')).toEqual({ fmt: EXPECTED_FMT });

    const { scripts, devDependencies } = JSON.parse(files['package.json'] ?? '{}');

    expect(scripts).toMatchObject({
      format: 'bun fmt --no-config',
      'format:check': 'bun fmt --check --no-config',
      check: 'bun run lint && bun run format:check',
      'check:fix': 'bun run lint:fix && bun run format',
    });
    expect(scripts.fmt).toBeUndefined();
    expect(prettierEntries(Object.keys(devDependencies))).toEqual(['eslint-config-prettier']);
    expect(files['eslint.config.cjs']).toContain("require('eslint-config-prettier')");
    expect(formatCheck).toMatchObject({ exitCode: 0 });
  });

  it('sets up no formatting with --no-format', async () => {
    const { exitCode, files } = await createProject(['--no-format']);

    expect(exitCode).toBe(0);
    expect(files['bunfig.toml']).toBeUndefined();

    const { scripts, devDependencies } = JSON.parse(files['package.json'] ?? '{}');

    expect(Object.keys(scripts).filter((name) => /^(format|check)/.test(name))).toEqual([]);
    expect(prettierEntries([...Object.keys(devDependencies), ...Object.keys(files)])).toEqual([]);
    expect(files['eslint.config.cjs']).not.toContain('prettier');
  });

  it('adds the [fmt] table to a bunfig.toml that is already there and keeps what it holds', async () => {
    const existing = '[install]\nexact = true\n';
    const { exitCode, files, formatCheck } = await createProject([], { 'bunfig.toml': existing });

    expect(exitCode).toBe(0);
    expect(files['bunfig.toml']?.startsWith(existing)).toBe(true);
    expect(Bun.TOML.parse(files['bunfig.toml'] ?? '')).toEqual({ install: { exact: true }, fmt: EXPECTED_FMT });
    expect(formatCheck).toMatchObject({ exitCode: 0 });
  });

  it('formats a bunfig.toml that is already there, so the project passes its own format:check', async () => {
    const existing = '# install settings\n[install]\nexact=true\n';
    const { exitCode, files, formatCheck } = await createProject([], { 'bunfig.toml': existing });

    expect(exitCode).toBe(0);
    expect(files['bunfig.toml']).toStartWith('# install settings\n[install]\nexact = true\n\n[fmt]\n');
    expect(Bun.TOML.parse(files['bunfig.toml'] ?? '')).toEqual({ install: { exact: true }, fmt: EXPECTED_FMT });
    expect(formatCheck).toMatchObject({ exitCode: 0 });
  });

  it('formats that bunfig.toml with bun fmt, not with a fmt script of a package.json that is already there', async () => {
    const { files, formatCheck } = await createProject([], {
      'bunfig.toml': '[install]\nexact=true\n',
      'package.json': JSON.stringify({ scripts: { fmt: 'echo not the formatter' } }),
    });

    expect(files['bunfig.toml']).toStartWith('[install]\nexact = true\n\n[fmt]\n');
    expect(formatCheck).toMatchObject({ exitCode: 0 });
  });

  it('leaves a bunfig.toml that bun fmt cannot format as it was and exits 1 before it writes anything else', async () => {
    const existing = 'logLevel="nope"\n';
    const { exitCode, stderr, files } = await createProject([], { 'bunfig.toml': existing });

    expect(exitCode).toBe(1);
    expect(stderr).toContain('bunfig.toml could not be formatted by bun fmt, left it unchanged');
    expect(stderr).toContain('Invalid log level');
    expect(files).toEqual({ 'bunfig.toml': existing });
  });

  it('adds the keys that a [fmt] table already in bunfig.toml does not set, so the project passes its own format:check', async () => {
    const existing = '[install]\nexact = true\n\n[fmt]\n# wide lines\nprintWidth = 120\n';
    const { exitCode, stderr, files, formatCheck } = await createProject([], { 'bunfig.toml': existing });

    expect(exitCode).toBe(0);
    expect(Bun.TOML.parse(files['bunfig.toml'] ?? '')).toEqual({ install: { exact: true }, fmt: EXPECTED_FMT });
    expect(files['bunfig.toml']).toContain('# wide lines\nprintWidth = 120\n');
    expect(stderr).not.toContain('[fmt]');
    expect(formatCheck).toMatchObject({ exitCode: 0 });
  });

  it('keeps the values that a [fmt] table already in bunfig.toml sets, names those that differ, and format:check follows them', async () => {
    const existing = '[fmt]\nprintWidth = 80\nsingleQuote = false\n';
    const { exitCode, stderr, files, formatCheck } = await createProject([], { 'bunfig.toml': existing });

    expect(exitCode).toBe(0);
    expect(Bun.TOML.parse(files['bunfig.toml'] ?? '')).toEqual({
      fmt: { ...EXPECTED_FMT, printWidth: 80, singleQuote: false },
    });
    expect(stderr).toContain(
      'bunfig.toml keeps what its [fmt] table sets for printWidth, singleQuote (asena create sets printWidth = 120, ' +
        'singleQuote = true); bun run format:check follows the table, so run bun run format if it reports the generated files',
    );
    expect(formatCheck).toMatchObject({ exitCode: 1 });
    expect(formatCheck?.stdout).toContain('src/index.ts');
  });

  it('refuses a fmt table that bunfig.toml defines without a [fmt] header and exits 1 before it writes anything', async () => {
    const existing = 'fmt = { printWidth = 120 }\n';
    const { exitCode, stderr, files } = await createProject([], { 'bunfig.toml': existing });

    expect(exitCode).toBe(1);
    expect(stderr).toContain(
      'bunfig.toml defines fmt without a [fmt] header, so asena create cannot add its keys to it',
    );
    expect(files).toEqual({ 'bunfig.toml': existing });
  });

  it('refuses a bunfig.toml that is not valid TOML and exits 1 before it writes anything', async () => {
    const { exitCode, stderr, files } = await createProject([], { 'bunfig.toml': '[fmt\n' });

    expect(exitCode).toBe(1);
    expect(stderr).toContain('bunfig.toml is not valid TOML');
    expect(files).toEqual({ 'bunfig.toml': '[fmt\n' });
  });

  it('asks "Set up formatting (bun fmt)?", yes by default, and keeps the answer', async () => {
    type Question = { name: string; [key: string]: unknown };
    let asked: Question[] = [];
    const prompt = spyOn(inquirer, 'prompt').mockImplementation((async (questions: Question[]) => {
      asked = questions;

      return { adapter: 'hono', logger: true, eslint: true, format: false };
    }) as unknown as typeof inquirer.prompt);

    try {
      const preference = await (new Create() as any).askQuestions(false, {}, 'app');

      expect(asked.find((question) => question.name === 'format')).toEqual({
        type: 'confirm',
        name: 'format',
        message: 'Set up formatting (bun fmt)?',
        default: true,
      });
      expect(prettierEntries(asked.map((question) => question.name))).toEqual([]);
      expect(preference.format).toBe(false);
    } finally {
      prompt.mockRestore();
    }
  });
});

describe('asena create formatting flags', () => {
  const runs = new Map<string, Promise<CreateRun>>();
  const createOnce = (flags: string[]) => {
    const key = flags.join(' ');
    const run = runs.get(key) ?? createProject(flags);

    runs.set(key, run);

    return run;
  };

  const warnings = ({ stderr }: CreateRun) => stderr.split('\n').filter((line) => line.includes('deprecated'));

  const PRETTIER_WARNING = '--prettier is deprecated, use --format (formatting is done by bun fmt)';
  const NO_PRETTIER_WARNING = '--no-prettier is deprecated, use --no-format (formatting is done by bun fmt)';

  it('--format and --no-format set formatting up or not, without a warning', async () => {
    const on = await createOnce(['--format']);
    const off = await createOnce(['--no-format']);

    expect([on.exitCode, off.exitCode]).toEqual([0, 0]);
    expect([...warnings(on), ...warnings(off)]).toEqual([]);
    expect(on.files['bunfig.toml']).toBeDefined();
    expect(JSON.parse(on.files['package.json'] ?? '{}').scripts.format).toBe('bun fmt --no-config');
    expect(off.files['bunfig.toml']).toBeUndefined();
    expect(JSON.parse(off.files['package.json'] ?? '{}').scripts.format).toBeUndefined();
  });

  it('sets formatting up when neither flag is passed', async () => {
    const neither = await createOnce([]);

    expect(neither.exitCode).toBe(0);
    expect(warnings(neither)).toEqual([]);
    expect(neither.files).toEqual((await createOnce(['--format'])).files);
  });

  it('--prettier prints one deprecation warning and does what --format does', async () => {
    const run = await createOnce(['--prettier']);

    expect(run.exitCode).toBe(0);
    expect(warnings(run)).toEqual([PRETTIER_WARNING]);
    expect(run.files).toEqual((await createOnce(['--format'])).files);
  });

  it('--no-prettier prints one deprecation warning and does what --no-format does', async () => {
    const run = await createOnce(['--no-prettier']);

    expect(run.exitCode).toBe(0);
    expect(warnings(run)).toEqual([NO_PRETTIER_WARNING]);
    expect(run.files).toEqual((await createOnce(['--no-format'])).files);
  });

  it('accepts --format with --prettier and --no-format with --no-prettier', async () => {
    const on = await createOnce(['--format', '--prettier']);
    const off = await createOnce(['--no-prettier', '--no-format']);

    expect([on.exitCode, off.exitCode]).toEqual([0, 0]);
    expect([warnings(on), warnings(off)]).toEqual([[PRETTIER_WARNING], [NO_PRETTIER_WARNING]]);
    expect(on.files).toEqual((await createOnce(['--format'])).files);
    expect(off.files).toEqual((await createOnce(['--no-format'])).files);
  });

  for (const flags of [
    ['--format', '--no-prettier'],
    ['--prettier', '--no-format'],
  ]) {
    it(`fails with exit code 1 and writes nothing when ${flags.join(' and ')} disagree`, async () => {
      const run = await createOnce(flags);
      const [format, alias] = flags[0] === '--format' ? flags : [flags[1], flags[0]];

      expect(run.exitCode).toBe(1);
      expect(run.stderr).toContain(`error: ${format} and ${alias} disagree`);
      expect(run.files).toEqual({});
    });
  }

  const ALONE: [string, string][] = [
    ['--format', '--format'],
    ['--no-format', '--no-format'],
    ['--prettier', '--format'],
    ['--no-prettier', '--no-format'],
  ];

  for (const [flag, same] of ALONE) {
    it(`${flag} alone, without --adapter, asks nothing and creates what --adapter hono ${same} creates`, async () => {
      const run = await runCreate([flag]);

      expect(run.exitCode).toBe(0);
      expect(run.files).toEqual((await createOnce([same])).files);
    });
  }
});
