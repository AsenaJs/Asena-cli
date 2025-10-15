import { describe, expect, it } from 'bun:test';
import { ImportHandler } from '../../lib/codeBuilder/ImportHandler';
import { ImportType } from '../../lib/types';

describe('ImportHandler', () => {
  describe('Constructor and Initialization', () => {
    it('should parse existing ES6 imports from code', () => {
      const code = `
import { AsenaServer } from '@asenajs/asena';
import { Controller } from '@asenajs/asena/server';

const x = 1;
`;
      const handler = new ImportHandler(code, ImportType.IMPORT);
      const imports = handler.getImports;

      expect(imports).toContain('AsenaServer');

      expect(imports).toContain('Controller');
    });

    it('should parse existing CommonJS requires from code', () => {
      const code = `
const { AsenaServer } = require('@asenajs/asena');
const { Controller } = require('@asenajs/asena/server');

const x = 1;
`;
      const handler = new ImportHandler(code, ImportType.REQUIRE);
      const imports = handler.getImports;

      expect(imports.length).toBeGreaterThan(0);
    });

    it('should handle code with no imports', () => {
      const code = `const x = 1;\nconsole.log(x);`;
      const handler = new ImportHandler(code, ImportType.IMPORT);
      const imports = handler.getImports;

      expect(imports).toEqual([]);
    });

    it('should handle empty code', () => {
      const handler = new ImportHandler('', ImportType.IMPORT);
      const imports = handler.getImports;

      expect(imports).toEqual([]);
    });
  });

  describe('importToCode - ES6 Imports', () => {
    it('should add new import to empty code', () => {
      const handler = new ImportHandler('', ImportType.IMPORT);
      const result = handler.importToCode(
        {
          '@asenajs/asena': ['AsenaServer'],
        },
        ImportType.IMPORT,
      );

      expect(result).toContain("import {AsenaServer} from '@asenajs/asena'");
    });

    it('should add multiple imports from same file', () => {
      const handler = new ImportHandler('', ImportType.IMPORT);
      const result = handler.importToCode(
        {
          '@asenajs/asena': ['AsenaServer', 'Controller', 'Service'],
        },
        ImportType.IMPORT,
      );

      expect(result).toContain('AsenaServer');

      expect(result).toContain('Controller');

      expect(result).toContain('Service');

      expect(result).toContain('@asenajs/asena');
    });

    it('should add imports from multiple files', () => {
      const handler = new ImportHandler('', ImportType.IMPORT);
      const result = handler.importToCode(
        {
          '@asenajs/asena': ['AsenaServer'],
          '@asenajs/hono-adapter': ['createHonoAdapter'],
        },
        ImportType.IMPORT,
      );

      expect(result).toContain('@asenajs/asena');

      expect(result).toContain('@asenajs/hono-adapter');

      expect(result).toContain('AsenaServer');

      expect(result).toContain('createHonoAdapter');
    });

    it('should prepend imports to existing code', () => {
      const existingCode = 'const x = 1;';
      const handler = new ImportHandler(existingCode, ImportType.IMPORT);
      const result = handler.importToCode(
        {
          '@asenajs/asena': ['AsenaServer'],
        },
        ImportType.IMPORT,
      );

      expect(result).toContain('import {AsenaServer}');

      expect(result).toContain('const x = 1;');

      expect(result.indexOf('import')).toBeLessThan(result.indexOf('const x'));
    });

    it('should handle scoped package imports (starting with @)', () => {
      const handler = new ImportHandler('', ImportType.IMPORT);
      const result = handler.importToCode(
        {
          '@asenajs/asena': ['AsenaServer'],
        },
        ImportType.IMPORT,
      );

      expect(result).toContain("from '@asenajs/asena'");

      expect(result).not.toContain("from './@asenajs/asena'");
    });

    it('should add ./ prefix for relative imports', () => {
      const handler = new ImportHandler('', ImportType.IMPORT);
      const result = handler.importToCode(
        {
          'controllers/UserController': ['UserController'],
        },
        ImportType.IMPORT,
      );

      expect(result).toContain("from './controllers/UserController'");
    });

    it('should skip .asena. files', () => {
      const handler = new ImportHandler('', ImportType.IMPORT);
      const result = handler.importToCode(
        {
          '.asena.ts': ['Something'],
          '@asenajs/asena': ['AsenaServer'],
        },
        ImportType.IMPORT,
      );

      expect(result).not.toContain('.asena.ts');

      expect(result).toContain('@asenajs/asena');
    });

    it('should skip empty import arrays', () => {
      const handler = new ImportHandler('', ImportType.IMPORT);
      const result = handler.importToCode(
        {
          '@asenajs/asena': [],
          '@asenajs/hono-adapter': ['createHonoAdapter'],
        },
        ImportType.IMPORT,
      );

      expect(result).not.toContain('@asenajs/asena');

      expect(result).toContain('@asenajs/hono-adapter');
    });
  });

  describe('importToCode - CommonJS Requires', () => {
    it('should add new require to empty code', () => {
      const handler = new ImportHandler('', ImportType.REQUIRE);
      const result = handler.importToCode(
        {
          '@asenajs/asena': ['AsenaServer'],
        },
        ImportType.REQUIRE,
      );

      expect(result).toContain("const {AsenaServer} = require('./@asenajs/asena')");
    });

    it('should add multiple requires from same file', () => {
      const handler = new ImportHandler('', ImportType.REQUIRE);
      const result = handler.importToCode(
        {
          '@asenajs/asena': ['AsenaServer', 'Controller'],
        },
        ImportType.REQUIRE,
      );

      expect(result).toContain('AsenaServer');

      expect(result).toContain('Controller');
    });

    it('should prepend requires to existing code', () => {
      const existingCode = 'const x = 1;';
      const handler = new ImportHandler(existingCode, ImportType.REQUIRE);
      const result = handler.importToCode(
        {
          '@asenajs/asena': ['AsenaServer'],
        },
        ImportType.REQUIRE,
      );

      expect(result).toContain('require');

      expect(result).toContain('const x = 1;');

      expect(result.indexOf('require')).toBeLessThan(result.indexOf('const x'));
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle type imports', () => {
      const code = `import type { Context } from 'hono';`;
      const handler = new ImportHandler(code, ImportType.IMPORT);

      // Should not throw
      expect(handler.getImports).toBeDefined();
    });

    it('should handle multiline imports', () => {
      const code = `
import {
  AsenaServer,
  Controller,
  Service
} from '@asenajs/asena';
`;
      const handler = new ImportHandler(code, ImportType.IMPORT);
      const imports = handler.getImports;

      expect(imports.length).toBeGreaterThan(0);
    });

    it('should update allImports when adding new imports', () => {
      const handler = new ImportHandler('', ImportType.IMPORT);

      handler.importToCode(
        {
          '@asenajs/asena': ['AsenaServer'],
        },
        ImportType.IMPORT,
      );

      const imports = handler.getImports;

      expect(imports).toContain('AsenaServer');
    });

    it('should handle consecutive importToCode calls', () => {
      const handler = new ImportHandler('', ImportType.IMPORT);

      const result1 = handler.importToCode(
        {
          '@asenajs/asena': ['AsenaServer'],
        },
        ImportType.IMPORT,
      );

      const result2 = handler.importToCode(
        {
          '@asenajs/hono-adapter': ['createHonoAdapter'],
        },
        ImportType.IMPORT,
      );

      expect(result2).toContain('AsenaServer');

      expect(result2).toContain('createHonoAdapter');
    });
  });

  describe('getImports getter', () => {
    it('should return all imports as array', () => {
      const code = `
import { AsenaServer } from '@asenajs/asena';
import { Controller } from '@asenajs/asena/server';
`;
      const handler = new ImportHandler(code, ImportType.IMPORT);
      const imports = handler.getImports;

      expect(Array.isArray(imports)).toBe(true);

      expect(imports.length).toBeGreaterThan(0);
    });

    it('should update after calling importToCode', () => {
      const handler = new ImportHandler('', ImportType.IMPORT);
      const initialImports = handler.getImports;

      expect(initialImports).toEqual([]);

      handler.importToCode(
        {
          '@asenajs/asena': ['AsenaServer', 'Controller'],
        },
        ImportType.IMPORT,
      );

      const updatedImports = handler.getImports;

      expect(updatedImports).toContain('AsenaServer');

      expect(updatedImports).toContain('Controller');
    });
  });
});
