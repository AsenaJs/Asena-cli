import { describe, expect, it } from 'bun:test';
import { ServerConfigHandler } from '../../lib/codeBuilder/ServerConfigHandler';

describe('ServerConfigHandler', () => {
  it('should create config class with correct structure', () => {
    const handler = new ServerConfigHandler('');
    const result = handler.addConfigClass('ServerConfig');

    expect(result.code).toContain('@Config()');
    expect(result.code).toContain('export class ServerConfig extends ConfigService');
  });

  // Errors belong to `asena generate exception-handler`; a scaffolded onError would steer every new
  // project onto the hook that is deprecated in core 0.13.
  it('should not emit an onError hook', () => {
    const handler = new ServerConfigHandler('');
    const result = handler.addConfigClass('ServerConfig');

    expect(result.code).not.toContain('onError');
    expect(result.code).not.toContain('Context');
  });

  it('should allow custom class names', () => {
    const handler = new ServerConfigHandler('');
    const result = handler.addConfigClass('MyCustomConfig');

    expect(result.code).toContain('export class MyCustomConfig extends ConfigService');
    expect(result.code).not.toContain('ServerConfig');
  });

  it('should not start with leading blank line when appended to empty code', () => {
    const handler = new ServerConfigHandler('');
    const result = handler.addConfigClass('ServerConfig');

    // Should start with \n (for separation) then directly @Config, not \n\n
    expect(result.code).not.toMatch(/^\n\n/);
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
