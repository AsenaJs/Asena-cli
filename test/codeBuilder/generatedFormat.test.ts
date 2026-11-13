import { describe, expect, it } from 'bun:test';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { AsenaLoggerCreator } from '../../lib/codeBuilder/AsenaLoggerCreator';
import { AsenaServerHandler } from '../../lib/codeBuilder/AsenaServerHandler';
import { ControllerHandler } from '../../lib/codeBuilder/ControllerHandler';
import { ImportHandler } from '../../lib/codeBuilder/ImportHandler';
import { MiddlewareHandler } from '../../lib/codeBuilder/MiddlewareHandler';
import { ServerConfigHandler } from '../../lib/codeBuilder/ServerConfigHandler';
import { ServiceHandler } from '../../lib/codeBuilder/ServiceHandler';
import { WebSocketHandler } from '../../lib/codeBuilder/WebSocketHandler';
import { Generate } from '../../lib/commands/Generate';
import { BUNFIG_FMT } from '../../lib/constants/create';
import { ImportType } from '../../lib/types';
import type { AdapterType } from '../../lib/types/adapterConfig';

// Runs the generated project's format:check command over `files`, beside the bunfig.toml the scaffold writes
// (which it checks too). `bun fmt --check` lists the unformatted files on stdout and its summary on stderr.
const bunFmtCheck = async (files: Record<string, string>) => {
  const dir = await mkdtemp(join(tmpdir(), 'asena-bun-fmt-'));

  try {
    await Bun.write(join(dir, 'bunfig.toml'), BUNFIG_FMT);

    for (const [file, text] of Object.entries(files)) await Bun.write(join(dir, file), text);

    const result = Bun.spawnSync([process.execPath, 'fmt', '--check', '--no-config'], {
      cwd: dir,
      stdout: 'pipe',
      stderr: 'pipe',
    });

    return {
      exitCode: result.exitCode,
      unformatted: result.stdout.toString().split('\n').filter(Boolean),
      summary: result.stderr.toString().trim(),
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
};

const GENERATOR_METHODS = {
  controller: 'generateController',
  service: 'addService',
  config: 'addConfig',
  middleware: 'addMiddleware',
  websocket: 'addWebSocket',
  'exception-handler': 'addExceptionHandler',
  validator: 'addValidator',
} as const;

type GeneratorMethod = (typeof GENERATOR_METHODS)[keyof typeof GENERATOR_METHODS];

// The private generator steps, with the prompts and the file write replaced so the real code builds the output.
type GenerateInternals = Record<GeneratorMethod, () => Promise<void>> & {
  askQuestions: () => Promise<{ elementName: string }>;
  askWebSocketPath: () => Promise<string>;
  generate: (code: string) => Promise<void>;
};

// Runs each generator's real build path in a project for the given adapter and captures what it would write.
const generatorOutputs = async (adapter: AdapterType): Promise<Record<string, string>> => {
  const projectDir = await mkdtemp(join(tmpdir(), 'asena-format-'));
  const previousCwd = process.cwd();

  try {
    await Bun.write(join(projectDir, 'tsconfig.json'), JSON.stringify({ compilerOptions: { module: 'ESNext' } }));
    await Bun.write(join(projectDir, '.asena/config.json'), JSON.stringify({ adapter }));
    process.chdir(projectDir);

    const generator = new Generate() as unknown as GenerateInternals;
    const outputs: Record<string, string> = {};
    let captured = '';

    generator.askQuestions = async () => ({ elementName: 'Sample' });
    generator.askWebSocketPath = async () => '/sample';
    generator.generate = async (code: string) => {
      captured = code;
    };

    for (const [name, method] of Object.entries(GENERATOR_METHODS)) {
      await generator[method]();

      outputs[name] = captured;
    }

    return outputs;
  } finally {
    process.chdir(previousCwd);
    await rm(projectDir, { recursive: true, force: true });
  }
};

// The emitted text is what a generated project's format:check, tsc and lint read. These pin the
// exact output so a template that drifts from the formatter's style fails here, not in a scaffold.
describe('generated source is written in the style bun fmt expects', () => {
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
    it(`emits every ${adapter} generator output formatted for bun fmt under the shipped [fmt] table`, async () => {
      const outputs = await generatorOutputs(adapter);
      // Generate writes each file with exactly one final newline; check what it would write.
      const files = Object.fromEntries(
        Object.entries(outputs).map(([generator, code]) => [`src/${generator}.ts`, code.replace(/\n*$/, '\n')]),
      );

      expect(Object.keys(files)).toHaveLength(Object.keys(GENERATOR_METHODS).length);
      expect(await bunFmtCheck(files)).toEqual({
        exitCode: 0,
        unformatted: [],
        summary: `All ${Object.keys(files).length + 1} files are formatted.`,
      });
    });
  }

  it('reports a generator output that is not formatted, so the check above can fail', async () => {
    const result = await bunFmtCheck({ 'src/service.ts': '@Service()\nexport class UserService {\n\n}\n' });

    expect(result.exitCode).toBe(1);
    expect(result.unformatted).toEqual(['src/service.ts']);
  });

  it('emits the logger module formatted', () => {
    expect(AsenaLoggerCreator.createLogger()).toBe(
      "import { AsenaLogger } from '@asenajs/asena-logger';\n\nexport const logger = new AsenaLogger();\n",
    );
  });
});
