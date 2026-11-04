import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { Subprocess } from 'bun';
import { consoleUiDir, openCommand } from '../../lib/console/browser';
import { Commands } from '../../lib/commands/Commands';
import { Console, type ConsoleOptions } from '../../lib/commands/Console';
import type { ConsoleChildStatus, ConsoleHostMessage } from '../../lib/console/hostProtocol';
import { ConsoleClient, randomPort, waitUntil } from '../console/helpers';
import { copySampleApp } from '../utils/fixtureCopy';

const CLI = path.resolve(import.meta.dir, '../../bin/asena.ts');

// A project whose stub core ships the devtools subpath; its entry calls the hook the way AsenaServer.start() does.
const writeProject = (root: string, coreVersion = '0.13.0') => {
  const core = path.join(root, 'node_modules', '@asenajs', 'asena');
  const files: Record<string, string> = {
    'asena-config.ts': "export default { sourceFolder: 'src', rootFile: 'src/index.ts' };\n",
    'tsconfig.json': JSON.stringify({ compilerOptions: { experimentalDecorators: true, emitDecoratorMetadata: true } }),
    'src/index.ts': [
      "const hook = (globalThis as any)[Symbol.for('asena.devtools')];",
      "const attachment = typeof hook === 'function' && process.send ? hook({ port: null, adapter: null }) : undefined;",
      'console.log(`entry ran hook=${typeof hook}`);',
      'const stop = () => { attachment?.detach(); process.exit(0); };',
      "process.on('SIGTERM', stop);",
      "process.on('SIGINT', stop);",
      'setInterval(() => {}, 1000);',
      '',
    ].join('\n'),
    'node_modules/@asenajs/asena/package.json': JSON.stringify({
      name: '@asenajs/asena',
      version: coreVersion,
      exports: { './devtools': './devtools.js' },
    }),
    'node_modules/@asenajs/asena/devtools.js': [
      'export function attachDevtoolsAgent(context) {',
      "  const onMessage = (message) => { if (message?.type === 'command') process.send({ v: 1, type: 'commandResult', payload: { id: message.payload.id, ok: true } }); };",
      "  process.on('message', onMessage);",
      `  process.send({ v: 1, type: 'hello', payload: { coreVersion: '${coreVersion}', adapter: context.adapter, port: context.port, pid: process.pid } });`,
      "  return { detach() { process.off('message', onMessage); } };",
      '}',
      '',
    ].join('\n'),
    'node_modules/@asenajs/asena/dist/lib/ioc/constants/ComponentConstants.js':
      "export const ComponentConstants = { IOCObjectKey: Symbol('component:iocObject') };\n",
  };

  for (const [file, source] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), source);
  }

  return core;
};

const isAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);

    return true;
  } catch {
    return false;
  }
};

describe('asena console', () => {
  let root: string;
  let cli: Subprocess<'ignore', 'pipe', 'pipe'> | undefined;
  let client: ConsoleClient | undefined;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'asena-console-cmd-'));
  });

  afterEach(async () => {
    client?.close();

    if (cli && cli.exitCode === null) {
      cli.kill('SIGKILL');
      await cli.exited;
    }

    fs.rmSync(root, { recursive: true, force: true });
    cli = undefined;
    client = undefined;
  });

  const runCli = (args: string[], env: Record<string, string | undefined> = {}) =>
    Bun.spawn([process.execPath, CLI, 'console', ...args], {
      cwd: root,
      env: { ...process.env, NODE_ENV: 'development', ...env },
      stdin: 'ignore',
      stdout: 'pipe',
      stderr: 'pipe',
    });

  const finish = async (child: Subprocess<'ignore', 'pipe', 'pipe'>) => {
    const [stdout, stderr, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);

    return { stdout, stderr, code };
  };

  it('refuses to start when NODE_ENV=production', async () => {
    writeProject(root);

    const { stderr, code } = await finish(runCli(['--no-open'], { NODE_ENV: 'production' }));

    expect(code).toBe(1);
    expect(stderr).toContain('does not start when NODE_ENV=production');
  });

  it('names the core version it needs when the project core has no devtools subpath', async () => {
    copySampleApp(root);

    const { stderr, code } = await finish(runCli(['--no-open']));

    expect(code).toBe(1);
    expect(stderr).toContain('needs @asenajs/asena 0.13.0 or newer');
    expect(stderr).toContain('this project has 0.11.0');
  });

  it('starts the app with the agent hook, serves the console, respawns on a change and stops on SIGINT', async () => {
    writeProject(root);

    const port = randomPort();

    cli = runCli(['--no-open', '--port', String(port)]);

    let stdout = '';
    const decoder = new TextDecoder();

    void (async () => {
      for (const reader = cli.stdout.getReader(); ;) {
        const read = await reader.read();

        if (read.done) return;

        stdout += decoder.decode(read.value);
      }
    })();

    await waitUntil(() => /Asena console: (\S+)/.test(stdout), 10000, 'the console URL');

    const url = new URL(/Asena console: (\S+)/.exec(stdout)?.[1] as string);

    expect(url.host).toBe(`127.0.0.1:${port}`);
    expect((await fetch(`http://127.0.0.1:${port}/`)).status).toBe(403);
    expect((await fetch(url)).status).toBe(200);

    client = await ConsoleClient.connect(`ws://127.0.0.1:${port}/ws${url.search}`);

    const runningChild = (message: ConsoleHostMessage, gen: number): ConsoleChildStatus | undefined => {
      const child = message.type === 'snapshotState' ? message.child : message.type === 'child' ? message : undefined;

      return child?.state === 'running' && child.gen === gen ? child : undefined;
    };

    const first = runningChild(await client.waitFor((message) => !!runningChild(message, 1), 10000), 1);

    await waitUntil(() => stdout.includes('entry ran hook=function'), 5000, 'the entry output');

    client.send({ v: 1, type: 'command', command: { id: 'c-1', command: 'runSchedule', name: 'Nightly' } });
    await client.waitFor((message) => message.type === 'agent' && message.message.type === 'commandResult');

    fs.writeFileSync(path.join(root, 'src', 'helper.ts'), 'export const helper = 1;\n');

    const second = runningChild(await client.waitFor((message) => !!runningChild(message, 2), 10000), 2);

    expect(first?.pid).toBeNumber();
    expect(second?.pid).toBeNumber();
    expect(second?.pid).not.toBe(first?.pid as number);

    cli.kill('SIGINT');

    expect(await cli.exited).toBe(0);
    await waitUntil(() => !isAlive(second?.pid as number), 5000, 'the app to exit');
  });
});

describe('asena console options', () => {
  class ProbeConsole extends Console {
    public received?: ConsoleOptions;

    public override async exec(options: ConsoleOptions): Promise<number> {
      this.received = options;

      return 0;
    }
  }

  const parse = async (args: string[]) => {
    const probe = new ProbeConsole();
    const command = probe
      .command()
      .exitOverride()
      .configureOutput({ writeErr: () => {} });

    await command.parseAsync(args, { from: 'user' });

    return probe.received;
  };

  it('defaults to a free port, opening the browser and watching', async () => {
    expect(await parse([])).toEqual({ open: true, watch: true });
  });

  it('takes --port, --no-open and --no-watch', async () => {
    expect(await parse(['--port', '12345', '--no-open', '--no-watch'])).toEqual({
      port: 12345,
      open: false,
      watch: false,
    });
  });

  it('rejects a port that is not a port number', async () => {
    await expect(parse(['--port', 'abc'])).rejects.toThrow();
    await expect(parse(['--port', '70000'])).rejects.toThrow();
  });

  it('is registered with the CLI', () => {
    const program = new Commands()['program'];

    expect(program.commands.map((command) => command.name())).toContain('console');
  });
});

describe('console helpers', () => {
  it('opens the browser with the platform command', () => {
    expect(openCommand('http://x', 'darwin')).toEqual(['open', 'http://x']);
    expect(openCommand('http://x', 'linux')).toEqual(['xdg-open', 'http://x']);
    expect(openCommand('http://x', 'win32')).toEqual(['cmd', '/c', 'start', '""', 'http://x']);
  });

  it('finds dist/console-ui from a compiled file of the package, and null when it is not built', () => {
    const pkg = fs.mkdtempSync(path.join(os.tmpdir(), 'asena-cli-pkg-'));

    try {
      fs.writeFileSync(path.join(pkg, 'package.json'), '{}');
      fs.mkdirSync(path.join(pkg, 'dist', 'lib', 'console'), { recursive: true });

      expect(consoleUiDir(path.join(pkg, 'dist', 'lib', 'console'))).toBeNull();

      fs.mkdirSync(path.join(pkg, 'dist', 'console-ui'));
      fs.writeFileSync(path.join(pkg, 'dist', 'console-ui', 'index.html'), '');

      expect(consoleUiDir(path.join(pkg, 'dist', 'lib', 'console'))).toBe(path.join(pkg, 'dist', 'console-ui'));
      expect(consoleUiDir(path.join(pkg, 'lib', 'console'))).toBe(path.join(pkg, 'dist', 'console-ui'));
    } finally {
      fs.rmSync(pkg, { recursive: true, force: true });
    }
  });
});
