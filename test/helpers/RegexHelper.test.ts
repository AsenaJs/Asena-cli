import { describe, expect, it } from 'bun:test';
import { RegexHelper } from '../../lib/helpers';

describe('RegexHelper', () => {
  describe('Import/Require Detection', () => {
    it('should extract import lines', () => {
      const code = `
import { AsenaServer } from '@asenajs/asena';
import { Controller } from '@asenajs/asena/decorators';
import type { Context } from 'hono';

const x = 1;
`;
      const imports = RegexHelper.getImportLines(code);

      expect(imports).toHaveLength(3);

      expect(imports[0]).toContain('@asenajs/asena');
    });

    it('should extract require lines', () => {
      const code = `
const { AsenaServer } = require('@asenajs/asena');
const controller = require('./controller');

const x = 1;
`;
      const requires = RegexHelper.getRequireLines(code);

      expect(requires).toHaveLength(2);
    });

    it('should extract import file paths', () => {
      const code = `import { AsenaServer } from '@asenajs/asena';`;
      const paths = RegexHelper.getImportFilePath(code);

      expect(paths).toContain('@asenajs/asena');
    });

    it('should extract require file paths', () => {
      const code = `const x = require('@asenajs/asena');`;
      const paths = RegexHelper.getRequireFilePath(code);

      expect(paths).toContain('@asenajs/asena');
    });
  });

  describe('Class Element Detection', () => {
    it('should find controller class closing brace index', () => {
      const code = `
@Controller()
export class UserController {
  getUsers() {
    return [];
  }
}

export class OtherClass {}
`;
      const index = RegexHelper.getElementIndexByName(code, 'Controller', 'UserController');

      expect(index).not.toBeNull();

      expect(index).toBeGreaterThan(0);
    });

    it('should return null for non-existent class', () => {
      const code = `
@Controller()
export class UserController {}
`;
      const index = RegexHelper.getElementIndexByName(code, 'Controller', 'NonExistent');

      expect(index).toBeNull();
    });

    it('should handle nested braces in class body', () => {
      const code = `
@Service()
export class UserService {
  async getUser() {
    if (true) {
      const obj = { key: 'value' };
      return obj;
    }
  }
}
`;
      const index = RegexHelper.getElementIndexByName(code, 'Service', 'UserService');

      expect(index).not.toBeNull();

      expect(index).toBeGreaterThan(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle code with no imports', () => {
      const code = `const x = 1;`;
      const imports = RegexHelper.getImportLines(code);

      expect(imports).toHaveLength(0);
    });

    it('should handle multiline imports', () => {
      const code = `
import {
  AsenaServer,
  Controller
} from '@asenajs/asena';
`;
      const imports = RegexHelper.getImportLines(code);

      expect(imports.length).toBeGreaterThan(0);
    });
  });
});
