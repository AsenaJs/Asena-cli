import { describe, expect, it } from 'bun:test';
import { AsenaServerHandler } from '../../lib/codeBuilder/AsenaServerHandler';

describe('AsenaServerHandler', () => {
  describe('createEmptyAsenaServer', () => {
    it('should create empty server with default port 3000', () => {
      const handler = new AsenaServerHandler('');
      const result = handler.createEmptyAsenaServer('honoAdapter', 'asenaLogger');

      expect(result.asenaServer).toContain('AsenaServerFactory.create');

      expect(result.asenaServer).toContain('adapter: honoAdapter');

      expect(result.asenaServer).toContain('logger: asenaLogger');

      expect(result.asenaServer).toContain('port: 3000');

      expect(result.asenaServer).toContain('await server.start()');
    });

    it('should create empty server with custom port', () => {
      const handler = new AsenaServerHandler('');
      const result = handler.createEmptyAsenaServer('honoAdapter', 'asenaLogger', 8080);

      expect(result.asenaServer).toContain('port: 8080');
    });

    it('should return handler instance for chaining', () => {
      const handler = new AsenaServerHandler('');
      const result = handler.createEmptyAsenaServer('honoAdapter', 'asenaLogger');

      expect(result).toBeInstanceOf(AsenaServerHandler);
    });

    it('should generate valid TypeScript syntax', () => {
      const handler = new AsenaServerHandler('');

      handler.createEmptyAsenaServer('honoAdapter', 'asenaLogger', 3000);

      const code = handler.asenaServer;

      // Check for valid object syntax
      expect(code).toContain('{');

      expect(code).toContain('}');

      expect(code).toMatch(/adapter:\s*honoAdapter/);

      expect(code).toMatch(/logger:\s*asenaLogger/);

      expect(code).toMatch(/port:\s*3000/);
    });
  });

  describe('addComponents', () => {
    it('should add components to options object', () => {
      const handler = new AsenaServerHandler('');

      handler.createEmptyAsenaServer('honoAdapter', 'asenaLogger', 3000);

      const result = handler.addComponents(['UserController', 'UserService']);

      expect(result).toContain('components: [UserController, UserService]');

      expect(result).toContain('port: 3000');
    });

    it('should handle single component', () => {
      const handler = new AsenaServerHandler('');

      handler.createEmptyAsenaServer('honoAdapter', 'asenaLogger');

      const result = handler.addComponents(['UserController']);

      expect(result).toContain('components: [UserController]');
    });

    it('should handle multiple components', () => {
      const handler = new AsenaServerHandler('');

      handler.createEmptyAsenaServer('honoAdapter', 'asenaLogger');

      const result = handler.addComponents(['UserController', 'UserService', 'AuthMiddleware', 'LoggerService']);

      expect(result).toContain('UserController');

      expect(result).toContain('UserService');

      expect(result).toContain('AuthMiddleware');

      expect(result).toContain('LoggerService');
    });

    it('should replace existing components', () => {
      const codeWithComponents = `
const server = await AsenaServerFactory.create({
  adapter: honoAdapter,
  logger: asenaLogger,
  port: 3000,
  components: [OldController]
});

await server.start();`;

      const handler = new AsenaServerHandler(codeWithComponents);
      const result = handler.addComponents(['NewController', 'NewService']);

      expect(result).toContain('NewController');

      expect(result).toContain('NewService');

      expect(result).not.toContain('OldController');
    });

    it('should maintain valid object syntax after adding components', () => {
      const handler = new AsenaServerHandler('');

      handler.createEmptyAsenaServer('honoAdapter', 'asenaLogger');

      const result = handler.addComponents(['UserController']);

      // Should have proper comma placement
      expect(result).toMatch(/port:\s*3000,/);

      expect(result).toMatch(/components:\s*\[UserController\]/);

      expect(result).not.toContain(',,'); // No double commas
    });

    it('should throw error when no AsenaServerFactory.create() found', () => {
      const handler = new AsenaServerHandler('const x = 1;');

      expect(() => {
        handler.addComponents(['UserController']);
      }).toThrow('No AsenaServerFactory.create() call found');
    });

    it('should handle empty components array', () => {
      const handler = new AsenaServerHandler('');

      handler.createEmptyAsenaServer('honoAdapter', 'asenaLogger');

      const result = handler.addComponents([]);

      expect(result).toContain('components: []');
    });
  });

  describe('asenaServer getter', () => {
    it('should return the current server code', () => {
      const initialCode = 'initial code';
      const handler = new AsenaServerHandler(initialCode);

      expect(handler.asenaServer).toBe(initialCode);
    });

    it('should return updated code after createEmptyAsenaServer', () => {
      const handler = new AsenaServerHandler('');

      handler.createEmptyAsenaServer('honoAdapter', 'asenaLogger');

      const code = handler.asenaServer;

      expect(code).toContain('AsenaServerFactory.create');

      expect(code).not.toBe('');
    });
  });

  describe('Integration scenarios', () => {
    it('should support full workflow: create -> add components', () => {
      const handler = new AsenaServerHandler('');

      handler.createEmptyAsenaServer('honoAdapter', 'asenaLogger', 3000);

      const result = handler.addComponents([
        'UserController',
        'AuthController',
        'UserService',
        'AuthService',
        'LoggingMiddleware',
      ]);

      expect(result).toContain('AsenaServerFactory.create');

      expect(result).toContain('adapter: honoAdapter');

      expect(result).toContain('logger: asenaLogger');

      expect(result).toContain('port: 3000');

      expect(result).toContain('components: [');

      expect(result).toContain('UserController');

      expect(result).toContain('AuthController');

      expect(result).toContain('UserService');

      expect(result).toContain('AuthService');

      expect(result).toContain('LoggingMiddleware');

      expect(result).toContain('await server.start()');
    });

    it('should produce valid multiline formatted code', () => {
      const handler = new AsenaServerHandler('');

      handler.createEmptyAsenaServer('honoAdapter', 'asenaLogger', 3000);

      const result = handler.addComponents(['UserController']);

      const lines = result
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l);

      expect(lines).toContain('const server = await AsenaServerFactory.create({');

      expect(lines).toContain('adapter: honoAdapter,');

      expect(lines).toContain('logger: asenaLogger,');

      expect(lines).toContain('port: 3000,');

      expect(lines).toContain('components: [UserController]');

      expect(lines).toContain('});');

      expect(lines).toContain('await server.start();');
    });
  });
});
