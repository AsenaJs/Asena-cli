import { describe, expect, it } from 'bun:test';
import { ServerConfigHandler } from '../../lib/codeBuilder/ServerConfigHandler';

describe('ServerConfigHandler', () => {
  it('should create config class with correct structure', () => {
    const handler = new ServerConfigHandler('');
    const result = handler.addConfigClass('ServerConfig');

    expect(result.code).toContain('@Config()');
    expect(result.code).toContain('export class ServerConfig extends ConfigService');
    expect(result.code).toContain('onError');
    expect(result.code).toContain('error: Error');
    expect(result.code).toContain('context: Context');
  });

  it('should have minimal onError implementation', () => {
    const handler = new ServerConfigHandler('');
    const result = handler.addConfigClass('ServerConfig');

    expect(result.code).toContain('console.error');
    expect(result.code).toContain('error.message');
    expect(result.code).toContain('context.send');
  });

  it('should allow custom class names', () => {
    const handler = new ServerConfigHandler('');
    const result = handler.addConfigClass('MyCustomConfig');

    expect(result.code).toContain('export class MyCustomConfig extends ConfigService');
    expect(result.code).not.toContain('ServerConfig');
  });

  it('should append to existing code', () => {
    const existingCode = '// Existing code\n';
    const handler = new ServerConfigHandler(existingCode);
    const result = handler.addConfigClass('ServerConfig');

    expect(result.code).toContain('// Existing code');
    expect(result.code).toContain('@Config()');
  });

  it('should return handler instance for chaining', () => {
    const handler = new ServerConfigHandler('');
    const result = handler.addConfigClass('ServerConfig');

    expect(result).toBeInstanceOf(ServerConfigHandler);
  });
});
