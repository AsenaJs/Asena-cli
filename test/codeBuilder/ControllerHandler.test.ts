import { describe, expect, it } from 'bun:test';
import { ControllerHandler } from '../../lib/codeBuilder/ControllerHandler';

describe('ControllerHandler', () => {
  describe('addController', () => {
    it('should create controller with correct structure', () => {
      const handler = new ControllerHandler('');
      const result = handler.addController('UserController', "'/users'");

      expect(result.code).toContain("@Controller('/users')");
      expect(result.code).toContain('export class UserController {');
    });

    it('should create controller without path', () => {
      const handler = new ControllerHandler('');
      const result = handler.addController('UserController', null);

      expect(result.code).toContain('@Controller()');
      expect(result.code).toContain('export class UserController {');
    });

    it('should use 2-space indentation, not tabs', () => {
      const handler = new ControllerHandler('');
      const result = handler.addController('TestController', null);

      expect(result.code).not.toContain('\t');
    });

    it('should have space before opening brace', () => {
      const handler = new ControllerHandler('');
      const result = handler.addController('TestController', null);

      expect(result.code).toContain('TestController {');
      expect(result.code).not.toMatch(/TestController\{/);
    });

    it('should not have extra space before export keyword', () => {
      const handler = new ControllerHandler('');
      const result = handler.addController('TestController', null);

      expect(result.code).toContain('\nexport class');
      expect(result.code).not.toContain('\n export class');
    });
  });

  describe('addGetRouterToController', () => {
    it('should use 2-space indentation, not tabs', () => {
      const handler = new ControllerHandler('');
      handler.addController('TestController', null);
      const code = handler.addGetRouterToController('TestController', 'users', 'getUsers');

      expect(code).not.toContain('\t');
    });

    it('should use single quotes', () => {
      const handler = new ControllerHandler('');
      handler.addController('TestController', null);
      const code = handler.addGetRouterToController('TestController', 'users', 'getUsers');

      expect(code).toContain("@Get('/users')");
      expect(code).toContain("'Hello asena'");
      expect(code).not.toContain('"Hello asena"');
    });

    it('should have proper spacing in method signature', () => {
      const handler = new ControllerHandler('');
      handler.addController('TestController', null);
      const code = handler.addGetRouterToController('TestController', 'users', 'getUsers');

      expect(code).toContain('context: Context');
      expect(code).not.toContain('context:Context');
    });
  });
});
