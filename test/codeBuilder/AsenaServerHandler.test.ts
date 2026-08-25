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
});
