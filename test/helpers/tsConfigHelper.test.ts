import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { getImportType } from '../../lib/helpers';
import { ImportType } from '../../lib/types';

describe('tsConfigHelper', () => {
  describe('getImportType', () => {
    const TEST_DIR = path.join(import.meta.dir, '__test_tsconfig__');
    const ORIGINAL_CWD = process.cwd();

    beforeAll(async () => {
      await mkdir(TEST_DIR, { recursive: true });
    });

    afterAll(async () => {
      process.chdir(ORIGINAL_CWD);

      await rm(TEST_DIR, { recursive: true, force: true });
    });

    it('should return REQUIRE when tsconfig.json does not exist', async () => {
      process.chdir(TEST_DIR);

      await rm(path.join(TEST_DIR, 'tsconfig.json'), { force: true });

      const result = await getImportType();

      expect(result).toBe(ImportType.REQUIRE);

      process.chdir(ORIGINAL_CWD);
    });

    it('should return IMPORT when module is ESNext', async () => {
      process.chdir(TEST_DIR);

      const tsconfig = {
        compilerOptions: {
          module: 'ESNext',
          target: 'ES2020',
        },
      };

      await writeFile(path.join(TEST_DIR, 'tsconfig.json'), JSON.stringify(tsconfig, null, 2));

      const result = await getImportType();

      expect(result).toBe(ImportType.IMPORT);

      process.chdir(ORIGINAL_CWD);
    });

    it('should return IMPORT when module is ES6', async () => {
      process.chdir(TEST_DIR);

      const tsconfig = {
        compilerOptions: {
          module: 'ES6',
        },
      };

      await writeFile(path.join(TEST_DIR, 'tsconfig.json'), JSON.stringify(tsconfig, null, 2));

      const result = await getImportType();

      expect(result).toBe(ImportType.IMPORT);

      process.chdir(ORIGINAL_CWD);
    });

    it('should return REQUIRE when module is CommonJS', async () => {
      process.chdir(TEST_DIR);

      const tsconfig = {
        compilerOptions: {
          module: 'CommonJS',
        },
      };

      await writeFile(path.join(TEST_DIR, 'tsconfig.json'), JSON.stringify(tsconfig, null, 2));

      const result = await getImportType();

      expect(result).toBe(ImportType.REQUIRE);

      process.chdir(ORIGINAL_CWD);
    });

    it('should handle tsconfig with comments', async () => {
      process.chdir(TEST_DIR);

      const tsconfigWithComments = `{
  // This is a comment
  "compilerOptions": {
    "module": "ESNext", // ES modules
    "target": "ES2020"
  }
}`;

      await writeFile(path.join(TEST_DIR, 'tsconfig.json'), tsconfigWithComments);

      const result = await getImportType();

      expect(result).toBe(ImportType.IMPORT);

      process.chdir(ORIGINAL_CWD);
    });

    it('should return IMPORT for case-insensitive module name', async () => {
      process.chdir(TEST_DIR);

      const tsconfig = {
        compilerOptions: {
          module: 'esnext', // lowercase
        },
      };

      await writeFile(path.join(TEST_DIR, 'tsconfig.json'), JSON.stringify(tsconfig, null, 2));

      const result = await getImportType();

      expect(result).toBe(ImportType.IMPORT);

      process.chdir(ORIGINAL_CWD);
    });

    it('should return REQUIRE when compilerOptions is missing', async () => {
      process.chdir(TEST_DIR);

      const tsconfig = {
        include: ['src/**/*'],
      };

      await writeFile(path.join(TEST_DIR, 'tsconfig.json'), JSON.stringify(tsconfig, null, 2));

      const result = await getImportType();

      expect(result).toBe(ImportType.REQUIRE);

      process.chdir(ORIGINAL_CWD);
    });
  });
});
