import { describe, expect, it } from 'bun:test';
import { ValidatorHandler } from '../../lib/codeBuilder/ValidatorHandler';

describe('ValidatorHandler', () => {
  describe('addValidator', () => {
    it('should create validator with correct structure', () => {
      const handler = new ValidatorHandler('');
      const result = handler.addValidator('UserValidator');

      expect(result.code).toContain('@Middleware({ validator: true })');
      expect(result.code).toContain('export class UserValidator extends ValidationService {');
    });
  });

  describe('addExampleSchema', () => {
    it('should use 2-space indentation, not tabs', () => {
      const handler = new ValidatorHandler('');
      handler.addValidator('UserValidator');
      handler.addExampleSchema('UserValidator');

      expect(handler.code).not.toContain('\t');
    });

    it('should contain json() method', () => {
      const handler = new ValidatorHandler('');
      handler.addValidator('UserValidator');
      handler.addExampleSchema('UserValidator');

      expect(handler.code).toContain('json()');
      expect(handler.code).toContain('z.object');
      expect(handler.code).toContain('z.string()');
    });

    it('should contain commented query and param methods', () => {
      const handler = new ValidatorHandler('');
      handler.addValidator('UserValidator');
      handler.addExampleSchema('UserValidator');

      expect(handler.code).toContain('// query()');
      expect(handler.code).toContain('// param()');
    });

    it('should use consistent 2-space indentation for all schema lines', () => {
      const handler = new ValidatorHandler('');
      handler.addValidator('UserValidator');
      handler.addExampleSchema('UserValidator');

      const lines = handler.code.split('\n');
      const indentedLines = lines.filter((l) => l.startsWith('  ') || l.startsWith('//'));

      for (const line of indentedLines) {
        expect(line).not.toMatch(/^\t/);
      }
    });
  });
});
