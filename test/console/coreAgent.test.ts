import { afterEach, describe, expect, it } from 'bun:test';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { ConsoleHost } from '../../lib/console/ConsoleHost';
import type { ConsoleHostMessage } from '../../lib/console/hostProtocol';
import type { DevtoolsCommandResult } from '../../lib/console/protocol';
import { appCommand, writeConsoleWrapper } from '../../lib/console/wrapper';
import { ConsoleClient, randomPort, waitUntil } from './helpers';

// ASENA_CORE_DIR names a built core checkout; without it these tests are skipped, as the CLI has no core dependency.
const coreDir = process.env['ASENA_CORE_DIR'] ? path.resolve(process.env['ASENA_CORE_DIR']) : null;
const coreEntry = coreDir ? path.join(coreDir, 'dist', 'index.js') : '';
const agentPath = coreDir ? path.join(coreDir, 'dist', 'lib', 'devtools', 'index.js') : '';

const APP = `import { AsenaServerFactory } from '${coreEntry}';

if (process.env.APP_PRODUCTION === '1') process.env.NODE_ENV = 'production';

const logger = {
  info: (message) => console.log(message),
  warn: (message) => console.warn(message),
  error: (message) => console.error(message),
  profile: () => undefined,
};

for (let i = 0; i < Number(process.env.APP_SERVERS ?? 1); i++) {
  const server = await AsenaServerFactory.create({ headless: true, components: [], logger });

  await server.start();
}
`;

const isChild =
  (state: string) =>
  (message: ConsoleHostMessage): boolean =>
    (message.type === 'child' && message.state === state) ||
    (message.type === 'snapshotState' && message.child.state === state);

const resultsOf = (client: ConsoleClient, id: string): DevtoolsCommandResult[] =>
  client.messages.flatMap((message) =>
    message.type === 'agent' && message.message.type === 'commandResult' && message.message.payload.id === id
      ? [message.message.payload]
      : [],
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

  const start = async (env: Record<string, string> = {}, agentTimeoutMs?: number) => {
    expect(fs.existsSync(agentPath)).toBe(true);

    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'asena-console-core-app-'));
    const wrapperDir = fs.mkdtempSync(path.join(os.tmpdir(), 'asena-console-core-wrapper-'));

    dirs.push(root, wrapperDir);
    fs.mkdirSync(path.join(root, 'src'));
    fs.writeFileSync(path.join(root, 'src', 'index.js'), APP);

    const warnings: string[] = [];

    host = new ConsoleHost({
      port: randomPort(),
      uiDir: null,
      warn: (message) => warnings.push(message),
      ...(agentTimeoutMs === undefined ? {} : { agentTimeoutMs }),
      app: {
        cwd: root,
        env: { ...process.env, NODE_ENV: 'development', ...env },
        prepare: () =>
          appCommand(
            root,
            writeConsoleWrapper(wrapperDir, {
              root,
              sourceFolder: 'src',
              rootFile: 'src/index.js',
              controllers: {},
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

  it('attaches through the wrapper hook, reports the app and answers commands, failed ones included', async () => {
    const { host, client, warnings } = await start();

    await client.waitFor(isChild('running'), 15_000);
    await waitUntil(() => host.snapshotState().snapshot !== undefined, 5000, 'the snapshot');

    const { version } = JSON.parse(fs.readFileSync(path.join(coreDir as string, 'package.json'), 'utf-8')) as {
      version: string;
    };

    expect(host.snapshotState().hello).toMatchObject({ coreVersion: version, adapter: null, port: null });
    expect(host.snapshotState().snapshot).toMatchObject({ components: [], routes: [], schedules: [] });

    client.send(command('c-1', { command: 'emitEvent', event: 'item.created' }));
    client.send(command('c-2', { command: 'runSchedule', name: 'Missing' }));

    await waitUntil(() => resultsOf(client, 'c-2').length > 0, 5000, 'both results');

    expect(resultsOf(client, 'c-1')).toEqual([{ id: 'c-1', ok: true, result: { delivered: false } }]);
    expect(resultsOf(client, 'c-2')).toMatchObject([{ id: 'c-2', ok: false, error: { name: 'Error' } }]);
    expect(warnings).toEqual([]);
  }, 30_000);

  it('gets no agent from an app under NODE_ENV=production, says so and answers commands itself', async () => {
    const { host, client, warnings } = await start({ APP_PRODUCTION: '1' }, 1500);

    await client.waitFor((message) => message.type === 'child' && message.unattached === true, 15_000);

    expect(host.snapshotState().hello).toBeUndefined();
    expect(host.snapshotState().logs.some((line) => line.line.includes('NODE_ENV is production'))).toBe(true);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('NODE_ENV=production');

    client.send(command('c-1', { command: 'emitEvent', event: 'item.created' }));
    await waitUntil(() => resultsOf(client, 'c-1').length > 0, 5000, 'the refusal');

    expect(resultsOf(client, 'c-1')).toMatchObject([{ ok: false, error: { name: 'ConsoleHostError' } }]);
  }, 30_000);

  it('keeps one running app when two servers start in it, and gets each command answered once', async () => {
    const { host, client, warnings } = await start({ APP_SERVERS: '2' });
    const count = (type: string) =>
      client.messages.filter((message) => message.type === 'agent' && message.message.type === type).length;

    await waitUntil(() => count('snapshot') === 2, 15_000, 'both snapshots');

    client.send(command('c-1', { command: 'emitEvent', event: 'item.created' }));
    await waitUntil(() => resultsOf(client, 'c-1').length > 0, 5000, 'the result');
    await Bun.sleep(200);

    expect(count('hello')).toBe(2);
    expect(resultsOf(client, 'c-1')).toEqual([{ id: 'c-1', ok: true, result: { delivered: false } }]);
    expect(host.snapshotState().runs).toEqual([expect.objectContaining({ gen: 1, state: 'running' })]);
    expect(host.snapshotState().child).toMatchObject({ gen: 1, state: 'running' });
    expect(warnings).toEqual([]);
  }, 30_000);
});
