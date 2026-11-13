import { describe, expect, it } from 'bun:test';
import * as prettier from 'prettier';
import { AsenaLoggerCreator } from '../../lib/codeBuilder/AsenaLoggerCreator';
import { AsenaServerHandler } from '../../lib/codeBuilder/AsenaServerHandler';
import { ControllerHandler } from '../../lib/codeBuilder/ControllerHandler';
import { ImportHandler } from '../../lib/codeBuilder/ImportHandler';
import { MiddlewareHandler } from '../../lib/codeBuilder/MiddlewareHandler';
import { ServerConfigHandler } from '../../lib/codeBuilder/ServerConfigHandler';
import { ServiceHandler } from '../../lib/codeBuilder/ServiceHandler';
import { WebSocketHandler } from '../../lib/codeBuilder/WebSocketHandler';
import { ImportType } from '../../lib/types';

// Mirrors the `.prettierrc.js` the scaffold writes (PRETTIER in lib/constants/create.ts).
const GENERATED_PRETTIER_OPTIONS: prettier.Options = {
  parser: 'typescript',
  printWidth: 120,
  tabWidth: 2,
  useTabs: false,
  semi: true,
  singleQuote: true,
  quoteProps: 'as-needed',
  trailingComma: 'all',
  bracketSpacing: true,
  arrowParens: 'always',
  endOfLine: 'lf',
};

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

  it('emits a WebSocket namespace with unused lifecycle parameters prefixed and no blank line at the head', () => {
    const namespace = new WebSocketHandler('').addWebSocketNamespace('ChatNamespace', '/chat').code;

    expect(namespace).toBe(
      [
        '',
        "@WebSocket({ path: '/chat', name: 'ChatNamespace' })",
        'export class ChatNamespace extends AsenaWebSocketService {',
        '  protected async onOpen(_ws: Socket): Promise<void> {',
        "    console.log('Client connected');",
        '  }',
        '',
        '  protected async onMessage(_ws: Socket, message: string): Promise<void> {',
        "    console.log('Message received:', message);",
        '  }',
        '',
        '  protected async onClose(_ws: Socket): Promise<void> {',
        "    console.log('Client disconnected');",
        '  }',
        '}',
        '',
      ].join('\n'),
    );
  });

  it('emits every generator output as Prettier-clean TypeScript under the generated Prettier config', async () => {
    const samples = {
      controller:
        new ImportHandler('', ImportType.IMPORT).importToCode(
          { '@asenajs/asena/decorators': ['Controller'] },
          ImportType.IMPORT,
        ) + new ControllerHandler('').addController('UserController', null).code,
      service:
        new ImportHandler('', ImportType.IMPORT).importToCode(
          { '@asenajs/asena/decorators': ['Service'] },
          ImportType.IMPORT,
        ) + new ServiceHandler('').addService('UserService').code,
      config:
        new ImportHandler('', ImportType.IMPORT).importToCode(
          { '@asenajs/asena': ['Config', 'ConfigService'] },
          ImportType.IMPORT,
        ) + new ServerConfigHandler('').addConfigClass('ServerConfig').code,
      middleware:
        new ImportHandler('', ImportType.IMPORT).importToCode(
          { '@asenajs/asena': ['Middleware', 'MiddlewareService', 'Context'] },
          ImportType.IMPORT,
        ) + new MiddlewareHandler('').addMiddleware('AuthMiddleware').addDefaultHandle('AuthMiddleware').code,
      websocket:
        new ImportHandler('', ImportType.IMPORT).importToCode(
          { '@asenajs/asena': ['AsenaWebSocketService', 'WebSocket'] },
          ImportType.IMPORT,
        ) + new WebSocketHandler('').addWebSocketNamespace('ChatNamespace', '/chat').code,
    };

    for (const [generator, code] of Object.entries(samples)) {
      expect({ generator, clean: await prettier.check(code, GENERATED_PRETTIER_OPTIONS) }).toEqual({
        generator,
        clean: true,
      });
    }
  });

  it('emits the logger module formatted', () => {
    expect(AsenaLoggerCreator.createLogger()).toBe(
      "import { AsenaLogger } from '@asenajs/asena-logger';\n\nexport const logger = new AsenaLogger();\n",
    );
  });
});
