import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { defineConfig, isAsenaConfigExists, readJson } from '../../lib/helpers/configHelpers';
import type { AsenaConfig } from '../../lib';

describe('configHelpers', () => {
  describe('defineConfig', () => {
    it('should return the same config object', () => {
      const config: AsenaConfig = {
        rootFile: 'src/index.ts',
        sourceFolder: 'src',
        buildOptions: {
          outdir: 'dist',
        },
      };

      const result = defineConfig(config);

      expect(result).toBe(config);

      expect(result.rootFile).toBe('src/index.ts');

      expect(result.sourceFolder).toBe('src');
    });

    it('should work with minimal config', () => {
      const config: AsenaConfig = {
        rootFile: 'index.ts',
        sourceFolder: '.',
      };

      const result = defineConfig(config);

      expect(result).toEqual(config);
    });

    it('should preserve all config properties', () => {
      const config: AsenaConfig = {
        rootFile: 'src/main.ts',
        sourceFolder: 'src',
        buildOptions: {
          outdir: 'build',
          target: 'bun',
          minify: true,
        },
      };

      const result = defineConfig(config);

      expect(result.buildOptions?.outdir).toBe('build');

      expect(result.buildOptions?.target).toBe('bun');

      expect(result.buildOptions?.minify).toBe(true);
    });
  });

  describe('readJson', () => {
    const TEST_JSON_PATH = path.join(import.meta.dir, '__test_config__.json');

    beforeAll(async () => {
      const testData = {
        name: 'test-project',
        version: '1.0.0',
        dependencies: {
          '@asenajs/asena': '^0.3.0',
        },
      };

      await writeFile(TEST_JSON_PATH, JSON.stringify(testData, null, 2));
    });

    afterAll(async () => {
      await rm(TEST_JSON_PATH, { force: true });
    });

    it('should read and parse JSON file', async () => {
      const data = await readJson(TEST_JSON_PATH);

      expect(data).toBeDefined();

      expect(data.name).toBe('test-project');

      expect(data.version).toBe('1.0.0');
    });

    it('should read nested JSON properties', async () => {
      const data = await readJson(TEST_JSON_PATH);

      expect(data.dependencies).toBeDefined();

      expect(data.dependencies['@asenajs/asena']).toBe('^0.3.0');
    });
  });

  describe('isAsenaConfigExists', () => {
    const TEST_DIR = path.join(import.meta.dir, '__test_config_check__');
    const ORIGINAL_CWD = process.cwd();

    beforeAll(async () => {
      await mkdir(TEST_DIR, { recursive: true });
    });

    afterAll(async () => {
      process.chdir(ORIGINAL_CWD);

      await rm(TEST_DIR, { recursive: true, force: true });
    });

    it('should return true when asena-config.ts exists', async () => {
      process.chdir(TEST_DIR);

      await writeFile(path.join(TEST_DIR, 'asena-config.ts'), 'export default {}');

      const result = isAsenaConfigExists();

      expect(result).toBe(true);
    });

    it('should return false when asena-config.ts does not exist', async () => {
      // Change to a directory without config
      process.chdir(TEST_DIR);

      await rm(path.join(TEST_DIR, 'asena-config.ts'), { force: true });

      const result = isAsenaConfigExists();

      expect(result).toBe(false);

      // Restore
      process.chdir(ORIGINAL_CWD);
    });
  });
});
