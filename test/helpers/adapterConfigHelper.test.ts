import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import {
  readAdapterConfig,
  writeAdapterConfig,
  getAdapterConfig,
  isAdapterConfigExists,
} from '../../lib/helpers/adapterConfigHelper';

describe('adapterConfigHelper', () => {
  const TEST_DIR = path.join(import.meta.dir, '__test_adapter_config__');
  const ORIGINAL_CWD = process.cwd();

  beforeAll(async () => {
    await mkdir(TEST_DIR, { recursive: true });
  });

  afterAll(async () => {
    process.chdir(ORIGINAL_CWD);
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  describe('writeAdapterConfig', () => {
    it('should create .asena/config.json with adapter', async () => {
      process.chdir(TEST_DIR);
      await rm(path.join(TEST_DIR, '.asena'), { recursive: true, force: true });

      await writeAdapterConfig({ adapter: 'hono' });

      const configPath = path.join(TEST_DIR, '.asena/config.json');
      const exists = await Bun.file(configPath).exists();

      expect(exists).toBe(true);

      const content = await Bun.file(configPath).json();

      expect(content.adapter).toBe('hono');

      process.chdir(ORIGINAL_CWD);
    });

    it('should create .asena directory if not exists', async () => {
      process.chdir(TEST_DIR);
      await rm(path.join(TEST_DIR, '.asena'), { recursive: true, force: true });

      await writeAdapterConfig({ adapter: 'ergenecore' });

      // Check if config.json file exists (which means directory was created)
      const configExists = await Bun.file(path.join(TEST_DIR, '.asena/config.json')).exists();

      expect(configExists).toBe(true);

      process.chdir(ORIGINAL_CWD);
    });

    it('should write correctly formatted JSON', async () => {
      process.chdir(TEST_DIR);
      await rm(path.join(TEST_DIR, '.asena'), { recursive: true, force: true });

      await writeAdapterConfig({ adapter: 'hono' });

      const content = await Bun.file(path.join(TEST_DIR, '.asena/config.json')).text();

      // Check if it's pretty-printed (has newlines and spaces)
      expect(content).toContain('\n');
      expect(content).toContain('  ');

      process.chdir(ORIGINAL_CWD);
    });
  });

  describe('readAdapterConfig', () => {
    it('should read adapter config from .asena/config.json', async () => {
      process.chdir(TEST_DIR);
      await rm(path.join(TEST_DIR, '.asena'), { recursive: true, force: true });

      await writeAdapterConfig({ adapter: 'ergenecore' });

      const config = await readAdapterConfig();

      expect(config.adapter).toBe('ergenecore');

      process.chdir(ORIGINAL_CWD);
    });

    it('should return default hono if config does not exist', async () => {
      process.chdir(TEST_DIR);
      await rm(path.join(TEST_DIR, '.asena'), { recursive: true, force: true });

      const config = await readAdapterConfig();

      expect(config.adapter).toBe('hono');

      process.chdir(ORIGINAL_CWD);
    });

    it('should return default adapter if config is invalid', async () => {
      process.chdir(TEST_DIR);
      await rm(path.join(TEST_DIR, '.asena'), { recursive: true, force: true });
      await mkdir(path.join(TEST_DIR, '.asena'), { recursive: true });

      // Write invalid JSON
      await Bun.write(path.join(TEST_DIR, '.asena/config.json'), 'invalid json');

      const config = await readAdapterConfig();

      // Should fallback to default 'hono' on parse error
      expect(config.adapter).toBe('hono');

      process.chdir(ORIGINAL_CWD);
    });
  });

  describe('getAdapterConfig', () => {
    it('should return adapter type from config', async () => {
      process.chdir(TEST_DIR);
      await rm(path.join(TEST_DIR, '.asena'), { recursive: true, force: true });

      await writeAdapterConfig({ adapter: 'hono' });

      const adapter = await getAdapterConfig();

      expect(adapter).toBe('hono');

      process.chdir(ORIGINAL_CWD);
    });

    it('should return default hono if config does not exist', async () => {
      process.chdir(TEST_DIR);
      await rm(path.join(TEST_DIR, '.asena'), { recursive: true, force: true });

      const adapter = await getAdapterConfig();

      expect(adapter).toBe('hono');

      process.chdir(ORIGINAL_CWD);
    });
  });

  describe('isAdapterConfigExists', () => {
    it('should return true if config exists', async () => {
      process.chdir(TEST_DIR);
      await rm(path.join(TEST_DIR, '.asena'), { recursive: true, force: true });

      await writeAdapterConfig({ adapter: 'hono' });

      const exists = await isAdapterConfigExists();

      expect(exists).toBe(true);

      process.chdir(ORIGINAL_CWD);
    });

    it('should return false if config does not exist', async () => {
      process.chdir(TEST_DIR);
      await rm(path.join(TEST_DIR, '.asena'), { recursive: true, force: true });

      const exists = await isAdapterConfigExists();

      expect(exists).toBe(false);

      process.chdir(ORIGINAL_CWD);
    });
  });
});
