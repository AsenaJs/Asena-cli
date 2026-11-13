import fs from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import type { Command } from 'commander';
import inquirer from 'inquirer';
import { Commands } from '../../lib/commands/Commands';
import { Init } from '../../lib/commands/Init';
import * as configHelpers from '../../lib/helpers/configHelpers';

const OWN_VERSION: string = JSON.parse(
  fs.readFileSync(path.resolve(import.meta.dir, '../../package.json'), 'utf8'),
).version;

describe('asena-cli init test', () => {
  const TEST_DIR = path.join(import.meta.dir, '__test_init__');
  const ORIGINAL_CWD = process.cwd();
  let projectCliVersion: ReturnType<typeof spyOn>;

  beforeAll(async () => {
    await mkdir(TEST_DIR, { recursive: true });

    // Mock getAsenaCliVersion to return a version (skips the CLI install)
    projectCliVersion = spyOn(configHelpers, 'getAsenaCliVersion').mockResolvedValue('^0.3.4');
  });

  afterAll(async () => {
    projectCliVersion.mockRestore();

    process.chdir(ORIGINAL_CWD);

    await rm(TEST_DIR, { recursive: true, force: true });
  });

  it('should create asena-config.ts when it does not exist', async () => {
    process.chdir(TEST_DIR);

    // Ensure config doesn't exist
    await rm(path.join(TEST_DIR, 'asena-config.ts'), { force: true });
    await rm(path.join(TEST_DIR, '.asena'), { recursive: true, force: true });

    const init = new Init();

    // Pass adapter to avoid inquirer prompt
    await init.exec(OWN_VERSION, 'hono');

    // Verify config file was created
    const configPath = path.join(TEST_DIR, 'asena-config.ts');
    const file = Bun.file(configPath);
    const exists = await file.exists();

    expect(exists).toBe(true);

    // Verify .asena/config.json was created
    const adapterConfigPath = path.join(TEST_DIR, '.asena/config.json');
    const adapterConfigFile = Bun.file(adapterConfigPath);
    const adapterConfigExists = await adapterConfigFile.exists();

    expect(adapterConfigExists).toBe(true);

    // Verify adapter config content
    const adapterConfigContent = await adapterConfigFile.json();

    expect(adapterConfigContent.adapter).toBe('hono');

    // Verify content
    const content = await file.text();

    expect(content).toContain('defineConfig');

    expect(content).toContain('sourceFolder');

    expect(content).toContain('rootFile');

    process.chdir(ORIGINAL_CWD);
  });

  it('should log warning when asena-config.ts already exists', async () => {
    process.chdir(TEST_DIR);

    // Create existing config
    await writeFile(
      path.join(TEST_DIR, 'asena-config.ts'),
      'export default { sourceFolder: "src", rootFile: "index.ts" }',
    );

    // Spy on console.log to capture warning
    const consoleSpy = spyOn(console, 'log');

    const init = new Init();

    // Pass adapter to avoid inquirer prompt
    await init.exec(OWN_VERSION, 'hono');

    // Verify warning was logged
    expect(consoleSpy).toHaveBeenCalled();

    const calls = consoleSpy.mock.calls;
    const hasWarning = calls.some((call) =>
      // eslint-disable-next-line max-nested-callbacks
      call.some((arg) => typeof arg === 'string' && arg.includes('Config file already exists')),
    );

    expect(hasWarning).toBe(true);

    consoleSpy.mockRestore();

    process.chdir(ORIGINAL_CWD);
  });

  it('should throw error if file write fails', async () => {
    process.chdir(TEST_DIR);

    // Remove config to trigger creation
    await rm(path.join(TEST_DIR, 'asena-config.ts'), { force: true });
    await rm(path.join(TEST_DIR, '.asena'), { recursive: true, force: true });

    // Mock Bun.write to return 0 bytes (failure)
    const originalWrite = Bun.write;

    (Bun.write as any) = async () => 0;

    const init = new Init();

    try {
      // Pass adapter to avoid inquirer prompt
      await expect(init.exec(OWN_VERSION, 'hono')).rejects.toThrow('Failed to create asena config');
    } finally {
      // Restore original Bun.write
      Bun.write = originalWrite;

      process.chdir(ORIGINAL_CWD);
    }
  });

  it('should create config with correct default content', async () => {
    process.chdir(TEST_DIR);

    // Clean up
    await rm(path.join(TEST_DIR, 'asena-config.ts'), { force: true });
    await rm(path.join(TEST_DIR, '.asena'), { recursive: true, force: true });

    const init = new Init();

    // Pass adapter to avoid inquirer prompt
    await init.exec(OWN_VERSION, 'hono');

    const configPath = path.join(TEST_DIR, 'asena-config.ts');
    const content = await Bun.file(configPath).text();

    // Check for required fields in default config
    expect(content).toContain('defineConfig');

    expect(content).toContain('@asenajs/asena-cli');

    expect(content).toContain('export default defineConfig');

    expect(content).toContain('sourceFolder');

    expect(content).toContain('rootFile');

    expect(content).toContain('buildOptions');

    process.chdir(ORIGINAL_CWD);
  });

  it('should return command instance with correct description', () => {
    const init = new Init();
    const command = init.command();

    expect(command).toBeDefined();

    expect(command.description()).toContain('asena-config.ts');

    expect(command.description()).toContain('default values');
  });
});

describe('the @asenajs/asena-cli that init installs', () => {
  const ORIGINAL_CWD = process.cwd();
  const ORIGINAL_PATH = process.env['PATH'];
  const OWN_CLI_INSTALL = [['add', '-D', `@asenajs/asena-cli@${OWN_VERSION}`]];
  let root: string;
  let callLog: string;
  let prompt: ReturnType<typeof spyOn>;

  const setEnv = (name: string, value: string | undefined) => {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  };

  // PATH holds nothing but stubs: `bun` records its arguments instead of installing, and `asena`, when
  // given a version, prints it.
  const stubPath = (asenaVersion?: string) => {
    const bin = path.join(root, 'bin');
    const recorder = path.join(root, 'record-bun-call.js');

    fs.mkdirSync(bin);
    fs.writeFileSync(
      recorder,
      `require('node:fs').appendFileSync(${JSON.stringify(callLog)}, JSON.stringify(process.argv.slice(2)) + '\\n');\n`,
    );
    fs.writeFileSync(path.join(bin, 'bun'), `#!/bin/sh\nexec '${process.execPath}' '${recorder}' "$@"\n`, {
      mode: 0o755,
    });

    if (asenaVersion) {
      fs.writeFileSync(path.join(bin, 'asena'), `#!/bin/sh\necho ${asenaVersion}\n`, { mode: 0o755 });
    }

    process.env['PATH'] = bin;
  };

  const bunCalls = (): string[][] =>
    fs.existsSync(callLog)
      ? fs
          .readFileSync(callLog, 'utf8')
          .trim()
          .split('\n')
          .map((line) => JSON.parse(line))
      : [];

  const asena = async (...args: string[]) => {
    const program = (new Commands() as unknown as { program: Command }).program;

    await program.parseAsync(args, { from: 'user' });
  };

  beforeEach(() => {
    root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'asena-init-')));
    callLog = path.join(root, 'bun-calls.jsonl');

    fs.mkdirSync(path.join(root, 'project'));
    process.chdir(path.join(root, 'project'));

    prompt = spyOn(inquirer, 'prompt').mockImplementation((async () => ({
      adapter: 'hono',
    })) as unknown as typeof inquirer.prompt);
  });

  afterEach(() => {
    prompt.mockRestore();
    setEnv('PATH', ORIGINAL_PATH);
    process.chdir(ORIGINAL_CWD);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('asena init installs its own version when no asena is on PATH', async () => {
    stubPath();

    await asena('init');

    expect(bunCalls()).toEqual(OWN_CLI_INSTALL);
    expect(fs.existsSync('asena-config.ts')).toBe(true);
  });

  it('asena init installs its own version, not the one an asena on PATH prints', async () => {
    stubPath('9.9.9');

    await asena('init');

    expect(bunCalls()).toEqual(OWN_CLI_INSTALL);
    expect(fs.existsSync('asena-config.ts')).toBe(true);
  });

  it('asena create installs its own version, not the one an asena on PATH prints', async () => {
    stubPath('9.9.9');

    await asena('create', 'app', '--adapter', 'hono', '--no-logger', '--no-eslint', '--no-prettier');

    expect(bunCalls().filter((call) => call.some((arg) => arg.includes('asena-cli')))).toEqual(OWN_CLI_INSTALL);
    expect(fs.existsSync(path.join(root, 'project', 'app', 'asena-config.ts'))).toBe(true);
  });

  it('installs and writes nothing when init runs outside the versioned asena program', async () => {
    stubPath();

    const error = spyOn(console, 'error').mockImplementation(() => {});
    let reported: unknown[][];

    try {
      await new Init().command().parseAsync([], { from: 'user' });
    } finally {
      reported = [...error.mock.calls];
      error.mockRestore();
    }

    expect(bunCalls()).toEqual([]);
    expect(fs.readdirSync('.')).toEqual([]);
    expect(String(reported[0]?.[1])).toContain('Cannot tell which version of @asenajs/asena-cli is running');
  });
});
