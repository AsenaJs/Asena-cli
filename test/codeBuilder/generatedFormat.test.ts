import { describe, expect, it } from 'bun:test';
import * as prettier from 'prettier';
import { AsenaLoggerCreator } from '../../lib/codeBuilder/AsenaLoggerCreator';
import { AsenaServerHandler } from '../../lib/codeBuilder/AsenaServerHandler';
import { ControllerHandler } from '../../lib/codeBuilder/ControllerHandler';
import { ExceptionHandlerHandler } from '../../lib/codeBuilder/ExceptionHandlerHandler';
import { ImportHandler } from '../../lib/codeBuilder/ImportHandler';
import { MiddlewareHandler } from '../../lib/codeBuilder/MiddlewareHandler';
import { ServerConfigHandler } from '../../lib/codeBuilder/ServerConfigHandler';
import { ServiceHandler } from '../../lib/codeBuilder/ServiceHandler';
import { ValidatorHandler } from '../../lib/codeBuilder/ValidatorHandler';
import { WebSocketHandler } from '../../lib/codeBuilder/WebSocketHandler';
import { PRETTIER } from '../../lib/constants/create';
import {
  getConfigImports,
  getExceptionHandlerImports,
  getMiddlewareImports,
  getValidatorImports,
  getWebSocketImports,
} from '../../lib/helpers/adapterImportHelper';
import { ImportType } from '../../lib/types';
import type { ImportsByFiles } from '../../lib/types';
import type { AdapterType } from '../../lib/types/adapterConfig';

// Evaluates the `.prettierrc.js` source the scaffold writes, so this test follows the shipped config.
const generatedPrettierOptions = (): prettier.Options => {
  const shipped: { exports: prettier.Options } = { exports: {} };

  new Function('module', PRETTIER)(shipped);

  return { ...shipped.exports, parser: 'typescript' };
};

const importsOf = (imports: ImportsByFiles): string =>
  new ImportHandler('', ImportType.IMPORT).importToCode(imports, ImportType.IMPORT);

// Built the way `asena generate` builds each file: the same import helpers and handlers, in the same order.
const generatorOutputs = (adapter: AdapterType): Record<string, string> => ({
  controller:
    importsOf({ '@asenajs/asena/decorators': ['Controller'] }) +
    new ControllerHandler('').addController('UserController', null).code,
  service:
    importsOf({ '@asenajs/asena/decorators': ['Service'] }) + new ServiceHandler('').addService('UserService').code,
  config: importsOf(getConfigImports(adapter)) + new ServerConfigHandler('').addConfigClass('ServerConfig').code,
  middleware:
    importsOf(getMiddlewareImports(adapter)) +
    new MiddlewareHandler('').addMiddleware('AuthMiddleware').addDefaultHandle('AuthMiddleware').code,
  websocket:
    importsOf(getWebSocketImports()) + new WebSocketHandler('').addWebSocketNamespace('ChatNamespace', '/chat').code,
  'exception-handler':
    importsOf(getExceptionHandlerImports(adapter)) +
    new ExceptionHandlerHandler('').addExceptionHandler('GlobalExceptionHandler').code,
  validator:
    importsOf(getValidatorImports(adapter)) +
    new ValidatorHandler('').addValidator('CreateValidator').addExampleSchema('CreateValidator').code,
});

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

  for (const adapter of ['hono', 'ergenecore'] as const) {
    it(`emits every ${adapter} generator output as Prettier-clean TypeScript under the shipped Prettier config`, async () => {
      const options = generatedPrettierOptions();
      const dirty: string[] = [];

      for (const [generator, code] of Object.entries(generatorOutputs(adapter))) {
        // Generate writes each file with exactly one final newline; check what it would write.
        if (!(await prettier.check(code.replace(/\n*$/, '\n'), options))) dirty.push(generator);
      }

      expect(dirty).toEqual([]);
    });
  }

  it('emits the logger module formatted', () => {
    expect(AsenaLoggerCreator.createLogger()).toBe(
      "import { AsenaLogger } from '@asenajs/asena-logger';\n\nexport const logger = new AsenaLogger();\n",
    );
  });
});
