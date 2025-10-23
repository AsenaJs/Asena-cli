import { describe, expect, it } from 'bun:test';
import { WebSocketHandler } from '../../lib/codeBuilder/WebSocketHandler';

describe('WebSocketHandler', () => {
  it('should create WebSocket namespace with correct structure', () => {
    const handler = new WebSocketHandler('');
    const result = handler.addWebSocketNamespace('AdminNamespace', '/admin');

    expect(result.code).toContain('@WebSocket');
    expect(result.code).toContain("path: '/admin'");
    expect(result.code).toContain("name: 'AdminNamespace'");
    expect(result.code).toContain('export class AdminNamespace extends AsenaWebSocketService');
  });

  it('should have all required lifecycle methods', () => {
    const handler = new WebSocketHandler('');
    const result = handler.addWebSocketNamespace('ChatNamespace', '/chat');

    expect(result.code).toContain('protected async onOpen(ws: Socket)');
    expect(result.code).toContain('protected async onMessage(ws: Socket, message: string)');
    expect(result.code).toContain('protected async onClose(ws: Socket)');
  });

  it('should have minimal implementation in methods', () => {
    const handler = new WebSocketHandler('');
    const result = handler.addWebSocketNamespace('TestNamespace', '/test');

    expect(result.code).toContain("console.log('Client connected')");
    expect(result.code).toContain("console.log('Message received:', message)");
    expect(result.code).toContain("console.log('Client disconnected')");
  });

  it('should allow custom namespace names and paths', () => {
    const handler = new WebSocketHandler('');
    const result = handler.addWebSocketNamespace('CustomNamespace', '/custom/path');

    expect(result.code).toContain("path: '/custom/path'");
    expect(result.code).toContain("name: 'CustomNamespace'");
    expect(result.code).toContain('export class CustomNamespace');
  });

  it('should append to existing code', () => {
    const existingCode = '// Existing code\n';
    const handler = new WebSocketHandler(existingCode);
    const result = handler.addWebSocketNamespace('TestNamespace', '/test');

    expect(result.code).toContain('// Existing code');
    expect(result.code).toContain('@WebSocket');
  });

  it('should return handler instance for chaining', () => {
    const handler = new WebSocketHandler('');
    const result = handler.addWebSocketNamespace('TestNamespace', '/test');

    expect(result).toBeInstanceOf(WebSocketHandler);
  });
});
