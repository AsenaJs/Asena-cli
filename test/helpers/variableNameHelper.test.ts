import { describe, expect, it } from 'bun:test';
import { convertToPascalCase } from '../../lib/helpers';

describe('variableNameHelper', () => {
  describe('convertToPascalCase', () => {
    it('should convert kebab-case to PascalCase', () => {
      expect(convertToPascalCase('user-controller')).toBe('UserController');

      expect(convertToPascalCase('auth-service')).toBe('AuthService');
    });

    it('should convert snake_case to PascalCase', () => {
      expect(convertToPascalCase('user_controller')).toBe('UserController');

      expect(convertToPascalCase('auth_service')).toBe('AuthService');
    });

    it('should convert space-separated to PascalCase', () => {
      expect(convertToPascalCase('user controller')).toBe('UserController');

      expect(convertToPascalCase('auth service')).toBe('AuthService');
    });

    it('should handle single word', () => {
      expect(convertToPascalCase('user')).toBe('User');

      expect(convertToPascalCase('controller')).toBe('Controller');
    });

    it('should handle already PascalCase', () => {
      expect(convertToPascalCase('UserController')).toBe('UserController');

      expect(convertToPascalCase('AuthService')).toBe('AuthService');
    });

    it('should handle leading underscore', () => {
      expect(convertToPascalCase('_user_controller')).toBe('UserController');

      expect(convertToPascalCase('_auth-service')).toBe('AuthService');
    });

    it('should handle mixed separators', () => {
      expect(convertToPascalCase('user_controller-service')).toBe('UserControllerService');

      expect(convertToPascalCase('auth service_middleware')).toBe('AuthServiceMiddleware');
    });

    it('should handle multiple consecutive separators', () => {
      expect(convertToPascalCase('user--controller')).toBe('UserController');

      expect(convertToPascalCase('auth__service')).toBe('AuthService');
    });

    it('should throw error for empty string', () => {
      // eslint-disable-next-line max-nested-callbacks
      expect(() => convertToPascalCase('')).toThrow('Invalid variable name length');
    });

    it('should handle lowercase input', () => {
      expect(convertToPascalCase('user')).toBe('User');

      expect(convertToPascalCase('controller')).toBe('Controller');
    });

    it('should handle UPPERCASE input', () => {
      expect(convertToPascalCase('USER')).toBe('USER');

      expect(convertToPascalCase('CONTROLLER')).toBe('CONTROLLER');
    });

    it('should handle camelCase to PascalCase', () => {
      expect(convertToPascalCase('userController')).toBe('UserController');

      expect(convertToPascalCase('authService')).toBe('AuthService');
    });

    it('should preserve numbers in variable names', () => {
      expect(convertToPascalCase('user2-controller')).toBe('User2Controller');

      expect(convertToPascalCase('auth_service_v2')).toBe('AuthServiceV2');
    });
  });
});
