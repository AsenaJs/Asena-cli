import { describe, expect, it } from 'bun:test';
import { checkControllerExistence } from '../../lib/helpers';
import type { ControllerPath } from '../../lib/types';

describe('controllerHelper', () => {
  describe('checkControllerExistence', () => {
    it('should return true when components exist', () => {
      const mockComponents: ControllerPath = {
        'controllers/UserController.ts': [class UserController {}],
        'services/UserService.ts': [class UserService {}],
      };

      const result = checkControllerExistence(mockComponents);

      expect(result).toBe(true);
    });

    it('should return false when no components exist', () => {
      const mockComponents: ControllerPath = {
        'controllers/UserController.ts': [],
        'services/UserService.ts': [],
      };

      const result = checkControllerExistence(mockComponents);

      expect(result).toBe(false);
    });

    it('should return true when at least one file has components', () => {
      const mockComponents: ControllerPath = {
        'controllers/UserController.ts': [],
        'services/UserService.ts': [class UserService {}],
      };

      const result = checkControllerExistence(mockComponents);

      expect(result).toBe(true);
    });

    it('should return false for empty object', () => {
      const mockComponents: ControllerPath = {};

      const result = checkControllerExistence(mockComponents);

      expect(result).toBe(false);
    });

    it('should return false when all arrays are empty', () => {
      const mockComponents: ControllerPath = {
        'file1.ts': [],
        'file2.ts': [],
        'file3.ts': [],
      };

      const result = checkControllerExistence(mockComponents);

      expect(result).toBe(false);
    });
  });
});
