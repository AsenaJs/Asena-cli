import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, spyOn } from 'bun:test';
import { Init } from '../../lib/commands/Init';
import * as configHelpers from '../../lib/helpers/configHelpers';

describe('asena-cli init test', () => {
  const TEST_DIR = path.join(import.meta.dir, '__test_init__');
  const ORIGINAL_CWD = process.cwd();

  beforeAll(async () => {
    await mkdir(TEST_DIR, { recursive: true });

    // Mock getAsenaCliVersion to return a version (prevents asena --version command)
    spyOn(configHelpers, 'getAsenaCliVersion').mockResolvedValue('^0.3.4');
  });

  afterAll(async () => {
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
    await init.exec('hono');

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
    await init.exec('hono');

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
      await expect(init.exec('hono')).rejects.toThrow('Failed to create asena config');
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
    await init.exec('hono');

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
