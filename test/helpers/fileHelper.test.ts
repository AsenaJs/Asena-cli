import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import {
  changeFileExtensionToAsenaJs,
  getAllFiles,
  getFileExtension,
  removeExtension,
  simplifyPath,
} from '../../lib/helpers';

const TEST_DIR = path.join(import.meta.dir, '__test_temp__');

describe('fileHelper', () => {
  describe('getFileExtension', () => {
    it('should return .js for JavaScript files', () => {
      expect(getFileExtension('index.js')).toBe('.js');

      expect(getFileExtension('controller.js')).toBe('.js');
    });

    it('should return .ts for TypeScript files', () => {
      expect(getFileExtension('index.ts')).toBe('.ts');

      expect(getFileExtension('controller.ts')).toBe('.ts');
    });

    it('should handle files with multiple dots', () => {
      expect(getFileExtension('user.controller.ts')).toBe('.ts');

      expect(getFileExtension('auth.service.js')).toBe('.js');
    });

    it('should throw error for invalid extensions', () => {
      // eslint-disable-next-line max-nested-callbacks
      expect(() => getFileExtension('file.txt')).toThrow('Invalid file extension');

      // eslint-disable-next-line max-nested-callbacks
      expect(() => getFileExtension('file.json')).toThrow('Invalid file extension');

      // eslint-disable-next-line max-nested-callbacks
      expect(() => getFileExtension('file')).toThrow('Invalid file extension');
    });
  });

  describe('removeExtension', () => {
    it('should remove file extension', () => {
      expect(removeExtension('index.ts')).toBe('index');

      expect(removeExtension('controller.js')).toBe('controller');
    });

    it('should handle files with multiple dots', () => {
      expect(removeExtension('user.controller.ts')).toBe('user.controller');

      expect(removeExtension('auth.service.js')).toBe('auth.service');
    });

    it('should return original name if no extension', () => {
      expect(removeExtension('README')).toBe('README');

      expect(removeExtension('Makefile')).toBe('Makefile');
    });

    it('should handle empty string', () => {
      expect(removeExtension('')).toBe('');
    });

    it('should handle paths with extension', () => {
      expect(removeExtension('src/index.ts')).toBe('src/index');

      expect(removeExtension('/path/to/file.js')).toBe('/path/to/file');
    });
  });

  describe('simplifyPath', () => {
    it('should simplify path with 2 parts', () => {
      expect(simplifyPath('/index')).toBe('/index');

      expect(simplifyPath('/user')).toBe('/user');
    });

    it('should simplify path with more than 2 parts', () => {
      expect(simplifyPath('/src/index.ts')).toBe('src/index.ts');

      expect(simplifyPath('/src/controllers/UserController.ts')).toBe('src/controllers/UserController.ts');
    });

    it('should return original path if less than 2 parts', () => {
      expect(simplifyPath('index')).toBe('index');

      expect(simplifyPath('')).toBe('');
    });

    it('should handle complex paths', () => {
      expect(simplifyPath('/home/user/project/src/index.ts')).toBe('home/user/project/src/index.ts');
    });
  });

  describe('changeFileExtensionToAsenaJs', () => {
    it('should change .ts to .asena.js', () => {
      const result = changeFileExtensionToAsenaJs('index.ts');

      expect(result).toContain('index.asena.js');
    });

    it('should change .js to .asena.js', () => {
      const result = changeFileExtensionToAsenaJs('index.js');

      expect(result).toContain('index.asena.js');
    });

    it('should handle files with multiple dots', () => {
      const result = changeFileExtensionToAsenaJs('user.controller.ts');

      expect(result).toContain('user.controller.asena.js');
    });

    it('should handle full paths', () => {
      const result = changeFileExtensionToAsenaJs('src/controllers/UserController.ts');

      expect(result).toContain('UserController.asena.js');

      expect(result).toContain('controllers');
    });

    it('should preserve directory structure', () => {
      const input = path.join('src', 'app', 'index.ts');
      const result = changeFileExtensionToAsenaJs(input);
      const parsed = path.parse(result);

      expect(parsed.ext).toBe('.js');

      expect(parsed.name).toContain('.asena');
    });
  });

  describe('getAllFiles', () => {
    beforeAll(async () => {
      // Create test directory structure
      await mkdir(TEST_DIR, { recursive: true });

      await mkdir(path.join(TEST_DIR, 'src'), { recursive: true });

      await mkdir(path.join(TEST_DIR, 'src', 'controllers'), { recursive: true });

      await mkdir(path.join(TEST_DIR, 'node_modules'), { recursive: true });

      await mkdir(path.join(TEST_DIR, 'dist'), { recursive: true });

      // Create test files
      await writeFile(path.join(TEST_DIR, 'index.ts'), 'console.log("index")');

      await writeFile(path.join(TEST_DIR, 'src', 'app.ts'), 'console.log("app")');

      await writeFile(path.join(TEST_DIR, 'src', 'controllers', 'UserController.ts'), 'export class UserController {}');

      await writeFile(path.join(TEST_DIR, 'node_modules', 'package.json'), '{}');

      await writeFile(path.join(TEST_DIR, 'dist', 'index.js'), 'console.log("compiled")');
    });

    afterAll(async () => {
      // Clean up test directory
      await rm(TEST_DIR, { recursive: true, force: true });
    });

    it('should get all files recursively', () => {
      const files = getAllFiles(TEST_DIR);

      expect(files.length).toBeGreaterThan(0);

      // eslint-disable-next-line max-nested-callbacks
      expect(files.some((f) => f.includes('index.ts'))).toBe(true);

      // eslint-disable-next-line max-nested-callbacks
      expect(files.some((f) => f.includes('app.ts'))).toBe(true);
    });

    it('should exclude node_modules directory', () => {
      const files = getAllFiles(TEST_DIR);

      // node_modules directory should be excluded
      // eslint-disable-next-line max-nested-callbacks
      const hasNodeModules = files.some((f) => f.includes(path.join('node_modules', 'package.json')));

      expect(hasNodeModules).toBe(false);
    });

    it('should include dist directory (not excluded by default)', () => {
      const files = getAllFiles(TEST_DIR);

      // dist is not in EXCLUDE_DIR_LIST, so it should be included
      // eslint-disable-next-line max-nested-callbacks
      expect(files.some((f) => f.includes(path.join('dist', 'index.js')))).toBe(true);
    });

    it('should include nested files', () => {
      const files = getAllFiles(TEST_DIR);

      // eslint-disable-next-line max-nested-callbacks
      expect(files.some((f) => f.includes('UserController.ts'))).toBe(true);
    });

    it('should throw error for invalid directory', () => {
      // eslint-disable-next-line max-nested-callbacks
      expect(() => getAllFiles('/nonexistent/directory/path')).toThrow('Invalid sourceFolder');
    });

    it('should return array of absolute paths', () => {
      const files = getAllFiles(TEST_DIR);

      // eslint-disable-next-line max-nested-callbacks
      files.forEach((file) => {
        expect(path.isAbsolute(file)).toBe(true);
      });
    });
  });
});
