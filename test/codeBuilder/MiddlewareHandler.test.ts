import { describe, expect, it } from 'bun:test';
import { MiddlewareHandler } from '../../lib/codeBuilder/MiddlewareHandler';

describe('MiddlewareHandler', () => {
  describe('addMiddleware', () => {
    it('should create middleware with correct structure', () => {
      const handler = new MiddlewareHandler('');
      const result = handler.addMiddleware('AuthMiddleware');

      expect(result.code).toContain('@Middleware()');
      expect(result.code).toContain('export class AuthMiddleware extends MiddlewareService {');
    });

    it('should have space before opening brace', () => {
      const handler = new MiddlewareHandler('');
      const result = handler.addMiddleware('AuthMiddleware');

      expect(result.code).toContain('MiddlewareService {');
      expect(result.code).not.toMatch(/MiddlewareService\{/);
    });
  });

  describe('addDefaultHandle', () => {
    it('should use 2-space indentation, not tabs', () => {
      const handler = new MiddlewareHandler('');
      handler.addMiddleware('AuthMiddleware');
      handler.addDefaultHandle('AuthMiddleware');

      expect(handler.code).not.toContain('\t');
    });

    it('should use single quotes', () => {
      const handler = new MiddlewareHandler('');
      handler.addMiddleware('AuthMiddleware');
      handler.addDefaultHandle('AuthMiddleware');

      expect(handler.code).toContain("'testValue'");
      expect(handler.code).toContain("'test'");
      expect(handler.code).not.toContain('"testValue"');
      expect(handler.code).not.toContain('"test"');
    });

    it('should have proper spacing in method signature', () => {
      const handler = new MiddlewareHandler('');
      handler.addMiddleware('AuthMiddleware');
      handler.addDefaultHandle('AuthMiddleware');

      expect(handler.code).toContain('context: Context');
      expect(handler.code).toContain('next: Function');
    });

    it('should not have double newline before next()', () => {
      const handler = new MiddlewareHandler('');
      handler.addMiddleware('AuthMiddleware');
      handler.addDefaultHandle('AuthMiddleware');

      expect(handler.code).not.toContain(';\n\n    next()');
    });
  });
});
