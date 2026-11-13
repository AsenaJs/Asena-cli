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
  const proc = Bun.spawn([process.execPath, ...args], { cwd, stdout: 'pipe', stderr: 'pipe' });
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

// Runs the real `asena create app --skip-install` beside an `app` directory that already holds `existing`,
// returns every file it left there, and runs the project's format:check when it has one.
const createProject = async (flags: string[], existing: Record<string, string> = {}): Promise<CreateRun> => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'asena-create-format-'));
  const dir = path.join(root, 'app');

  try {
    for (const [file, text] of Object.entries(existing)) {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, file), text);
    }

    const created = await spawn(root, [CLI, 'create', 'app', '--adapter', 'hono', '--skip-install', ...flags]);
    const files = readTree(dir);
    const scripts = files['package.json'] ? JSON.parse(files['package.json']).scripts : undefined;
    const formatCheck = scripts?.['format:check'] ? await spawn(dir, ['run', 'format:check']) : undefined;

    return { exitCode: created.exitCode, stderr: created.stderr, files, formatCheck };
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
};

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

  it('sets up no formatting with --no-prettier', async () => {
    const { exitCode, files } = await createProject(['--no-prettier']);

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

  it('leaves a [fmt] table that bunfig.toml already has as it is and says so', async () => {
    const existing = '[fmt]\nprintWidth = 80\n';
    const { exitCode, stderr, files } = await createProject([], { 'bunfig.toml': existing });

    expect(exitCode).toBe(0);
    expect(files['bunfig.toml']).toBe(existing);
    expect(stderr).toContain('bunfig.toml already has a [fmt] table, left it unchanged');
  });

  it('refuses a bunfig.toml that is not valid TOML before it writes anything', async () => {
    const { stderr, files } = await createProject([], { 'bunfig.toml': '[fmt\n' });

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
