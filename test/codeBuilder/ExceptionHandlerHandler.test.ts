import { describe, expect, it } from 'bun:test';
import { ExceptionHandlerHandler } from '../../lib/codeBuilder/ExceptionHandlerHandler';

describe('ExceptionHandlerHandler', () => {
  it('should create an @ExceptionHandler class with a single catch-all', () => {
    const result = new ExceptionHandlerHandler('').addExceptionHandler('AppExceptionHandler');

    expect(result.code).toContain('@ExceptionHandler()');
    expect(result.code).toContain('export class AppExceptionHandler {');
    expect(result.code.match(/@Catch\(/g)).toHaveLength(1);
    expect(result.code).toContain('@Catch()');
    expect(result.code).toContain('ctx: ExceptionContext<Context>');
  });

  // A returned value is a reply in @MessagePattern and is ignored with a warning in event scopes, so
  // the catch-all has to hand every non-HTTP failure back to the framework untouched.
  it('should decline every scope other than http', () => {
    const { code } = new ExceptionHandlerHandler('').addExceptionHandler('AppExceptionHandler');

    expect(code).toContain("ctx.scope !== 'http'");
    expect(code.indexOf("ctx.scope !== 'http'")).toBeLessThan(code.indexOf('ctx.context.send('));
  });

  // A catch-all receives HttpException and validation errors too; without declining them a scaffolded
  // project would turn every 400/401/404 into a 500.
  it('should decline HttpException so the adapter keeps its status envelopes', () => {
    const { code } = new ExceptionHandlerHandler('').addExceptionHandler('AppExceptionHandler');

    expect(code).toContain('isHttpException(error)');
    expect(code.indexOf('isHttpException(error)')).toBeLessThan(code.indexOf('ctx.context.send('));
  });

  // The handler that answers is the one that logs; the adapter stays silent once a Response is returned.
  it('should log the error before answering with a 500 JSON body', () => {
    const { code } = new ExceptionHandlerHandler('').addExceptionHandler('AppExceptionHandler');

    expect(code).toContain('console.error(');
    expect(code.indexOf('console.error(')).toBeLessThan(code.indexOf('ctx.context.send('));
    expect(code).toContain("ctx.context.send({ error: 'Internal Server Error' }, 500)");
  });

  it('should allow custom class names', () => {
    const result = new ExceptionHandlerHandler('').addExceptionHandler('OrderErrors');

    expect(result.code).toContain('export class OrderErrors {');
    expect(result.code).not.toContain('AppExceptionHandler');
  });

  it('should not start with leading blank line when appended to empty code', () => {
    const result = new ExceptionHandlerHandler('').addExceptionHandler('AppExceptionHandler');

    expect(result.code).not.toMatch(/^\n\n/);
  });

  it('should append to existing code', () => {
    const result = new ExceptionHandlerHandler('// Existing code\n').addExceptionHandler('AppExceptionHandler');

    expect(result.code.startsWith('// Existing code\n')).toBe(true);
    expect(result.code).toContain('@ExceptionHandler()');
  });

  it('should return handler instance for chaining', () => {
    const result = new ExceptionHandlerHandler('').addExceptionHandler('AppExceptionHandler');

    expect(result).toBeInstanceOf(ExceptionHandlerHandler);
  });
});
