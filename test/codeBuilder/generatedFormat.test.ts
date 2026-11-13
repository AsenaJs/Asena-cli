import { describe, expect, it } from 'bun:test';
import { AsenaLoggerCreator } from '../../lib/codeBuilder/AsenaLoggerCreator';
import { AsenaServerHandler } from '../../lib/codeBuilder/AsenaServerHandler';
import { ControllerHandler } from '../../lib/codeBuilder/ControllerHandler';
import { ImportHandler } from '../../lib/codeBuilder/ImportHandler';
import { MiddlewareHandler } from '../../lib/codeBuilder/MiddlewareHandler';
import { ServerConfigHandler } from '../../lib/codeBuilder/ServerConfigHandler';
import { ServiceHandler } from '../../lib/codeBuilder/ServiceHandler';
import { ImportType } from '../../lib/types';

// The emitted text is what a generated project's format:check, tsc and lint read. These pin the
// exact output so a template that drifts from Prettier's style fails here, not in a scaffold.
describe('generated source is written in the style Prettier expects', () => {
  it('emits imports as `import { A, B } from` with a final newline', () => {
    const code = new ImportHandler('', ImportType.IMPORT).importToCode(
      { '@asenajs/asena': ['AsenaServer', 'Controller'] },
      ImportType.IMPORT,
    );

    expect(code).toBe("import { AsenaServer, Controller } from '@asenajs/asena';\n");
  });

  it('emits an empty controller with no blank lines in its body and routes inserted into it', () => {
    const controller = new ControllerHandler('')
      .addController('AsenaController', null)
      .addGetRouterToController('AsenaController', '', 'helloAsena');

    expect(controller).toBe(
      [
        '',
        '@Controller()',
        'export class AsenaController {',
        "  @Get('/')",
        '  public async helloAsena(context: Context) {',
        "    return context.send('Hello asena');",
        '  }',
        '}',
        '',
      ].join('\n'),
    );
  });

  it('emits an empty service as a one-line class body', () => {
    expect(new ServiceHandler('').addService('UserService').code).toBe('\n@Service()\nexport class UserService {}\n');
  });

  it('emits an empty config class as a one-line class body', () => {
    expect(new ServerConfigHandler('').addConfigClass('ServerConfig').code).toBe(
      '\n@Config()\nexport class ServerConfig extends ConfigService {}\n',
    );
  });

  it('emits a middleware with its handle method and no blank lines around it', () => {
    const middleware = new MiddlewareHandler('')
      .addMiddleware('AuthMiddleware')
      .addDefaultHandle('AuthMiddleware').code;

    expect(middleware).toBe(
      [
        '',
        '@Middleware()',
        'export class AuthMiddleware extends MiddlewareService {',
        '  public async handle(context: Context, next: () => Promise<void>) {',
        "    context.setValue('testValue', 'test');",
        '    await next();',
        '  }',
        '}',
        '',
      ].join('\n'),
    );
  });

  it('ends the server bootstrap with a newline and a trailing comma in the factory options', () => {
    const server = new AsenaServerHandler('').createEmptyAsenaServer('honoAdapter', 'asenaLogger').asenaServer;

    expect(server).toContain('  port: 3000,\n});');
    expect(server.endsWith('await server.start();\n')).toBe(true);
  });

  it('emits the logger module formatted', () => {
    expect(AsenaLoggerCreator.createLogger()).toBe(
      "import { AsenaLogger } from '@asenajs/asena-logger';\n\nexport const logger = new AsenaLogger();\n",
    );
  });
});
