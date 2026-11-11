import { afterEach, describe, expect, it } from 'bun:test';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { ConsoleHost } from '../../lib/console/ConsoleHost';
import type { ConsoleHostMessage, ConsoleRequestRecord } from '../../lib/console/hostProtocol';
import type { DevtoolsAgentMessage, DevtoolsCommandResult } from '../../lib/console/protocol';
import { appCommand, writeConsoleWrapper } from '../../lib/console/wrapper';
import type { ComponentExports } from '../../lib/helpers/wrapperHelper';
import { ConsoleClient, randomPort, waitUntil } from './helpers';

// ASENA_CORE_DIR names a built core checkout; without it these tests are skipped, as the CLI has no core dependency.
const coreDir = process.env['ASENA_CORE_DIR'] ? path.resolve(process.env['ASENA_CORE_DIR']) : null;
const core = (file: string) => (coreDir ? path.join(coreDir, 'dist', file) : '');
const agentPath = core('lib/devtools/index.js');

// Two headless servers at most, each with a job of its own; StopSecondServer stops the second from the first.
const APP = `import { AsenaServerFactory } from '${core('index.js')}';
import { Schedule } from '${core('lib/server/decorators/index.js')}';

if (process.env.APP_PRODUCTION === '1') process.env.NODE_ENV = 'production';

const logger = {
  info: (message: string) => console.log(message),
  warn: (message: string) => console.warn(message),
  error: (message: string) => console.error(message),
  profile: () => undefined,
};
const servers: { stop(): Promise<void> }[] = [];

@Schedule({ cron: '0 4 * * *' })
class FirstJob {
  public execute() {
    console.log('first job ran');
  }
}

@Schedule({ cron: '0 4 * * *' })
class StopSecondServer {
  public async execute() {
    await servers[1]?.stop();
  }
}

@Schedule({ cron: '0 4 * * *' })
class SecondJob {
  public execute() {
    console.log('second job ran');
  }
}

for (const components of [[FirstJob, StopSecondServer], [SecondJob]].slice(0, Number(process.env.APP_SERVERS ?? 1))) {
  const server = await AsenaServerFactory.create({ headless: true, components, logger });

  await server.start();
  servers.push(server);
}
`;

// A component module that installs a console wrapper when it loads, and a handler that logs a secret through it.
const REDACTING_COMPONENT = `import { EventService } from '${core('lib/server/decorators/index.js')}';
import { On } from '${core('lib/server/event/index.js')}';

const print = console.log;

console.log = (...args: unknown[]) => print(...args.map((arg) => String(arg).replace(/token=\\S+/, 'token=[redacted]')));

@EventService()
export class LoginEvents {
  @On('login')
  public onLogin() {
    console.log('login token=s3cret');
  }
}
`;

const SCANNED_APP = `import { AsenaServerFactory } from '${core('index.js')}';

const logger = { info: () => undefined, warn: () => undefined, error: () => undefined, profile: () => undefined };
const server = await AsenaServerFactory.create({ headless: true, logger });

await server.start();
`;

const isChild =
  (state: string) =>
  (message: ConsoleHostMessage): boolean =>
    (message.type === 'child' && message.state === state) ||
    (message.type === 'snapshotState' && message.child.state === state);

const agentMessages = <T extends DevtoolsAgentMessage['type']>(client: ConsoleClient, type: T) =>
  client.messages.flatMap((message) =>
    message.type === 'agent' && message.message.type === type
      ? [message.message as Extract<DevtoolsAgentMessage, { type: T }>]
      : [],
  );

const resultsOf = (client: ConsoleClient, id: string): DevtoolsCommandResult[] =>
  agentMessages(client, 'commandResult').flatMap(({ payload }) => (payload.id === id ? [payload] : []));

const recordsOf = (client: ConsoleClient, method: string, name: string): ConsoleRequestRecord[] =>
  agentMessages(client, 'request').flatMap(({ payload }) =>
    payload.method === method && payload.path === name ? [payload] : [],
  );

describe.skipIf(coreDir === null)('ConsoleHost with the agent of a real core', () => {
  let host: ConsoleHost | undefined;
  let client: ConsoleClient | undefined;
  let dirs: string[] = [];

  afterEach(async () => {
    client?.close();
    await host?.stop();

    for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true });

    host = undefined;
    client = undefined;
    dirs = [];
  });

  const start = async (
    env: Record<string, string> = {},
    options: { agentTimeoutMs?: number; files?: Record<string, string>; controllers?: ComponentExports } = {},
  ) => {
    expect(fs.existsSync(agentPath)).toBe(true);

    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'asena-console-core-app-'));
    const wrapperDir = fs.mkdtempSync(path.join(os.tmpdir(), 'asena-console-core-wrapper-'));

    dirs.push(root, wrapperDir);
    fs.mkdirSync(path.join(root, 'src'));
    fs.writeFileSync(
      path.join(root, 'tsconfig.json'),
      JSON.stringify({ compilerOptions: { experimentalDecorators: true, emitDecoratorMetadata: true } }),
    );

    for (const [file, source] of Object.entries(options.files ?? { 'index.ts': APP })) {
      fs.writeFileSync(path.join(root, 'src', file), source);
    }

    const warnings: string[] = [];

    host = new ConsoleHost({
      port: randomPort(),
      uiDir: null,
      warn: (message) => warnings.push(message),
      ...(options.agentTimeoutMs === undefined ? {} : { agentTimeoutMs: options.agentTimeoutMs }),
      app: {
        cwd: root,
        env: { ...process.env, NODE_ENV: 'development', ...env },
        prepare: () =>
          appCommand(
            root,
            writeConsoleWrapper(wrapperDir, {
              root,
              sourceFolder: 'src',
              rootFile: 'src/index.ts',
              controllers: options.controllers ?? {},
              agentPath,
            }),
          ),
      },
    });

    await host.start();
    client = await ConsoleClient.connect(`ws://127.0.0.1:${host.port}/ws?t=${host.token}`);

    return { host, client, warnings };
  };

  const command = (id: string, fields: Record<string, unknown>) => ({
    v: 1,
    type: 'command',
    command: { id, ...fields },
  });

  const send = async (client: ConsoleClient, id: string, fields: Record<string, unknown>) => {
    client.send(command(id, fields));
    await waitUntil(() => resultsOf(client, id).length > 0, 5000, `the result of ${id}`);

    return resultsOf(client, id);
  };

  it('attaches through the wrapper hook, reports the app under a server id and answers commands with it', async () => {
    const { host, client, warnings } = await start();

    await client.waitFor(isChild('running'), 15_000);
    await waitUntil(() => host.snapshotState().servers[0]?.snapshot !== undefined, 5000, 'the snapshot');
    await waitUntil(() => host.snapshotState().metrics.length > 0, 5000, 'a metrics sample');

    const { version } = JSON.parse(fs.readFileSync(path.join(coreDir as string, 'package.json'), 'utf-8')) as {
      version: string;
    };
    const [server] = host.snapshotState().servers;
    const serverId = server?.hello.serverId as string;

    expect(host.snapshotState().servers).toHaveLength(1);
    expect(typeof serverId).toBe('string');
    expect(server?.hello).toMatchObject({ coreVersion: version, adapter: null, port: null });
    expect(server?.snapshot).toMatchObject({ serverId, components: expect.any(Array), routes: [] });
    expect(server?.snapshot?.schedules.map((schedule) => schedule.name)).toEqual(['FirstJob', 'StopSecondServer']);
    expect(host.snapshotState().metrics.at(-1)?.servers[serverId]?.readiness).toEqual({ status: 'up' });

    expect(await send(client, 'c-1', { command: 'emitEvent', event: 'item.created', serverId })).toEqual([
      { id: 'c-1', serverId, ok: true, result: { delivered: false } },
    ]);
    expect(await send(client, 'c-2', { command: 'runSchedule', name: 'Missing' })).toMatchObject([
      { id: 'c-2', serverId, ok: false, error: { name: 'Error' } },
    ]);
    expect(await send(client, 'c-3', { command: 'runSchedule', name: 'FirstJob', serverId })).toMatchObject([
      { id: 'c-3', serverId, ok: true },
    ]);
    await waitUntil(() => recordsOf(client, '@Schedule', 'FirstJob').length > 0, 5000, 'the job record');

    expect(recordsOf(client, '@Schedule', 'FirstJob')).toMatchObject([{ serverId, status: 200 }]);
    expect(warnings).toEqual([]);
  }, 30_000);

  it('gets no agent from an app under NODE_ENV=production, says so and answers commands itself', async () => {
    const { host, client, warnings } = await start({ APP_PRODUCTION: '1' }, { agentTimeoutMs: 1500 });

    await client.waitFor((message) => message.type === 'child' && message.unattached === true, 15_000);

    expect(host.snapshotState().servers).toEqual([]);
    expect(host.snapshotState().logs.some((line) => line.line.includes('NODE_ENV is production'))).toBe(true);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('never under NODE_ENV=production');

    expect(await send(client, 'c-1', { command: 'emitEvent', event: 'item.created' })).toMatchObject([
      { ok: false, error: { name: 'ConsoleHostError', message: 'The devtools agent has not attached to the app' } },
    ]);
  }, 30_000);

  it('keeps both servers of one app apart: their snapshots, their state, their records and their commands', async () => {
    const { host, client, warnings } = await start({ APP_SERVERS: '2' });

    await waitUntil(() => agentMessages(client, 'snapshot').length === 2, 15_000, 'both snapshots');
    await waitUntil(
      () => Object.keys(host.snapshotState().metrics.at(-1)?.servers ?? {}).length === 2,
      5000,
      'a sample with both servers',
    );

    const replay = await (await ConsoleClient.connect(`ws://127.0.0.1:${host.port}/ws?t=${host.token}`)).replay();
    const [first, second] = replay.servers.map((server) => server.hello.serverId) as [string, string];

    expect(replay.servers).toHaveLength(2);
    expect(first).not.toBe(second);
    expect(replay.servers.map((server) => server.snapshot?.schedules.map((schedule) => schedule.name))).toEqual([
      ['FirstJob', 'StopSecondServer'],
      ['SecondJob'],
    ]);
    expect(replay.servers.map((server) => server.snapshot?.serverId)).toEqual([first, second]);
    expect(Object.keys(replay.metrics.at(-1)?.servers ?? {}).sort()).toEqual([first, second].sort());

    // The older server's job is out of reach without its id: such a command goes to the most recent server.
    expect(await send(client, 'c-1', { command: 'runSchedule', name: 'FirstJob' })).toMatchObject([
      { serverId: second, ok: false },
    ]);
    expect(await send(client, 'c-2', { command: 'runSchedule', name: 'FirstJob', serverId: first })).toEqual([
      { id: 'c-2', serverId: first, ok: true, result: { ran: 'FirstJob' } },
    ]);
    expect(await send(client, 'c-3', { command: 'runSchedule', name: 'SecondJob', serverId: second })).toMatchObject([
      { serverId: second, ok: true },
    ]);

    const unknown = await send(client, 'c-4', { command: 'runSchedule', name: 'FirstJob', serverId: 'server-none' });

    expect(unknown).toMatchObject([{ id: 'c-4', ok: false }]);
    expect(unknown[0]).not.toHaveProperty('serverId');

    await waitUntil(() => recordsOf(client, '@Schedule', 'SecondJob').length > 0, 5000, 'the job records');

    expect(recordsOf(client, '@Schedule', 'FirstJob')).toMatchObject([{ serverId: first }]);
    expect(recordsOf(client, '@Schedule', 'SecondJob')).toMatchObject([{ serverId: second }]);
    expect(agentMessages(client, 'hello')).toHaveLength(2);
    expect(host.snapshotState().runs).toEqual([expect.objectContaining({ gen: 1, state: 'running' })]);
    expect(host.snapshotState().child).toMatchObject({ gen: 1, state: 'running' });
    expect(warnings).toEqual([]);
  }, 30_000);

  it('is told when one server stops, marks it and keeps the other one reachable', async () => {
    const { host, client, warnings } = await start({ APP_SERVERS: '2' });

    await waitUntil(() => agentMessages(client, 'snapshot').length === 2, 15_000, 'both snapshots');

    const [first, second] = host.snapshotState().servers.map((server) => server.hello.serverId) as [string, string];

    expect(await send(client, 'c-1', { command: 'runSchedule', name: 'StopSecondServer', serverId: first })).toEqual([
      { id: 'c-1', serverId: first, ok: true, result: { ran: 'StopSecondServer' } },
    ]);
    await waitUntil(() => agentMessages(client, 'serverStopped').length > 0, 5000, 'serverStopped');

    expect(agentMessages(client, 'serverStopped').map((message) => message.payload)).toEqual([{ serverId: second }]);
    expect(host.snapshotState().servers.map(({ hello, stopped }) => [hello.serverId, stopped])).toEqual([
      [first, undefined],
      [second, true],
    ]);
    expect(host.snapshotState().child).toMatchObject({ gen: 1, state: 'running' });

    const refused = await send(client, 'c-2', { command: 'runSchedule', name: 'SecondJob', serverId: second });

    expect(refused).toMatchObject([{ id: 'c-2', ok: false }]);
    expect(refused[0]).not.toHaveProperty('serverId');
    expect(await send(client, 'c-3', { command: 'runSchedule', name: 'FirstJob' })).toMatchObject([
      { serverId: first, ok: true },
    ]);
    // The message is one this host reads, not one it drops with a warning.
    expect(warnings).toEqual([]);
  }, 30_000);

  it('records what a console wrapper of a component module prints, not what the app handed to it', async () => {
    const { host, client, warnings } = await start(
      {},
      {
        files: { 'index.ts': SCANNED_APP, 'LoginEvents.ts': REDACTING_COMPONENT },
        controllers: { 'LoginEvents.ts': [{ exportName: 'LoginEvents' }] },
      },
    );

    await client.waitFor(isChild('running'), 15_000);

    expect(await send(client, 'c-1', { command: 'emitEvent', event: 'login' })).toMatchObject([
      { ok: true, result: { delivered: true } },
    ]);
    await waitUntil(() => recordsOf(client, '@On', 'login').length > 0, 5000, 'the record of the handler');

    const [record] = recordsOf(client, '@On', 'login');

    await waitUntil(
      () => host.snapshotState().logs.some((line) => line.line.includes('token=[redacted]')),
      5000,
      'the line in the app output',
    );

    expect(record?.logs?.map((entry) => entry.text)).toEqual(['login token=[redacted]\n']);
    expect(host.snapshotState().logs.some((line) => line.line.includes('s3cret'))).toBe(false);
    expect(warnings).toEqual([]);
  }, 30_000);
});
