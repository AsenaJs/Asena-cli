import { describe, expect, it } from 'bun:test';
import { RegexHelper } from '../../lib/helpers';

describe('RegexHelper', () => {
  describe('New API Pattern Detection (v1.0.0+)', () => {
    it('should detect AsenaServerFactory.create() pattern', () => {
      const code = `
const server = await AsenaServerFactory.create({
  adapter: honoAdapter,
  logger: asenaLogger,
  port: 3000
});

await server.start();
`;
      const result = RegexHelper.getAsenaServerCodeBlock(code);

      expect(result).not.toBeNull();

      expect(result).toContain('AsenaServerFactory.create');
    });

    it('should detect AsenaServerFactory with components', () => {
      const code = `
const server = await AsenaServerFactory.create({
  adapter: honoAdapter,
  logger: asenaLogger,
  port: 3000,
  components: [UserController, UserService]
});

await server.start();
`;
      const result = RegexHelper.getAsenaServerCodeBlock(code);

      expect(result).not.toBeNull();

      expect(result).toContain('components');
    });

    it('should get AsenaServerFactory.create() block', () => {
      const code = `
const server = await AsenaServerFactory.create({
  adapter: honoAdapter,
  logger: asenaLogger,
  port: 3000
});
`;
      const result = RegexHelper.getAsenaServerFactoryCreateBlock(code);

      expect(result).not.toBeNull();

      expect(result).toContain('await AsenaServerFactory.create');
    });

    it('should find options object closing brace position', () => {
      const code = `const server = await AsenaServerFactory.create({
  adapter: honoAdapter,
  logger: asenaLogger,
  port: 3000
});`;
      const position = RegexHelper.getAsenaServerFactoryOptionsEnd(code);

      expect(position).not.toBeNull();

      expect(position).toBeGreaterThan(0);
    });

    it('should remove components field from options', () => {
      const code = `
const server = await AsenaServerFactory.create({
  adapter: honoAdapter,
  logger: asenaLogger,
  port: 3000,
  components: [UserController, UserService]
});
`;
      const result = RegexHelper.removeComponentsFromOptions(code);

      expect(result).not.toContain('components');

      expect(result).toContain('port: 3000');
    });

    it('should handle components field at the end without comma', () => {
      const code = `{
  adapter: honoAdapter,
  port: 3000,
  components: [UserController]
}`;
      const result = RegexHelper.removeComponentsFromOptions(code);

      expect(result).not.toContain('components');

      expect(result).toContain('port: 3000');
    });

    it('should remove entire AsenaServerFactory code block', () => {
      const code = `
import { AsenaServerFactory } from '@asenajs/asena';

const [adapter, logger] = createHonoAdapter();

const server = await AsenaServerFactory.create({
  adapter: adapter,
  logger: logger,
  port: 3000
});

await server.start();

console.log('Server started');
`;
      const result = RegexHelper.removeAsenaServerFromCode(code);

      expect(result).not.toContain('AsenaServerFactory.create');

      expect(result).not.toContain('server.start()');

      expect(result).toContain('createHonoAdapter');

      expect(result).toContain('console.log');
    });
  });

  describe('Legacy API Pattern Detection (v0.x)', () => {
    it('should detect legacy new AsenaServer pattern', () => {
      const code = `await new AsenaServer(adapter, logger).port(3000).start();`;
      const result = RegexHelper.getAsenaServerCodeBlock(code);

      expect(result).not.toBeNull();

      expect(result).toContain('new AsenaServer');
    });

    it('should detect legacy pattern with components', () => {
      const code = `await new AsenaServer(adapter, logger).port(3000).components([UserController]).start();`;
      const result = RegexHelper.getAsenaServerCodeBlock(code);

      expect(result).not.toBeNull();

      expect(result).toContain('components');
    });

    it('should remove legacy AsenaServer code block', () => {
      const code = `
import { AsenaServer } from '@asenajs/asena';

const adapter = createAdapter();

await new AsenaServer(adapter, console).port(3000).start();

console.log('Done');
`;
      const result = RegexHelper.removeAsenaServerFromCode(code);

      expect(result).not.toContain('new AsenaServer');

      expect(result).toContain('createAdapter');

      expect(result).toContain('console.log');
    });

    it('should get legacy AsenaServer offset', () => {
      const code = `const server = new AsenaServer(adapter, logger)`;
      const offset = RegexHelper.getAsenaServerOffset(code);

      expect(offset).not.toBeNull();

      expect(offset).toBeGreaterThan(0);
    });
  });

  describe('Import/Require Detection', () => {
    it('should extract import lines', () => {
      const code = `
import { AsenaServer } from '@asenajs/asena';
import { Controller } from '@asenajs/asena/server';
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
    it('should return null when no AsenaServer found', () => {
      const code = `console.log('Hello World');`;
      const result = RegexHelper.getAsenaServerCodeBlock(code);

      expect(result).toBeNull();
    });

    it('should handle empty code', () => {
      const result = RegexHelper.getAsenaServerCodeBlock('');

      expect(result).toBeNull();
    });

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
