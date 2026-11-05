import { afterEach, describe, expect, it } from 'bun:test';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { ConsoleHost, type ConsoleHostOptions } from '../../lib/console/ConsoleHost';
import { CONSOLE_REPLAY_LIMITS, type ConsoleHostMessage } from '../../lib/console/hostProtocol';
import snapshot from './fixtures/snapshot.json';
import { ConsoleClient, randomPort, waitUntil } from './helpers';

const FAKE_AGENT = path.join(import.meta.dir, 'fixtures', 'fake-agent.ts');

type Message<T extends ConsoleHostMessage['type']> = Extract<ConsoleHostMessage, { type: T }>;

// A browser that connects late sees the current child in its replay instead of as a `child` message.
const isChild =
  (state: string, gen?: number) =>
  (message: ConsoleHostMessage): boolean => {
    const child = message.type === 'snapshotState' ? message.child : message.type === 'child' ? message : null;

    return child !== null && child.state === state && (gen === undefined || child.gen === gen);
  };

const isAgent =
  (type: string) =>
  (message: ConsoleHostMessage): boolean =>
    message.type === 'agent' && message.message.type === type;

const isLog =
  (text: string) =>
  (message: ConsoleHostMessage): boolean =>
    message.type === 'log' && message.line.includes(text);

describe('ConsoleHost with a fake agent child', () => {
  let host: ConsoleHost | undefined;
  let clients: ConsoleClient[] = [];
  let tmpDirs: string[] = [];

  afterEach(async () => {
    for (const client of clients) client.close();

    await host?.stop();

    for (const dir of tmpDirs) fs.rmSync(dir, { recursive: true, force: true });

    host = undefined;
    clients = [];
    tmpDirs = [];
  });

  const tmpDir = (prefix: string) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));

    tmpDirs.push(dir);

    return dir;
  };

  const startHost = async (env: Record<string, string> = {}, options: Partial<ConsoleHostOptions> = {}) => {
    const warnings: string[] = [];

    host = new ConsoleHost({
      port: randomPort(),
      uiDir: null,
      warn: (message) => warnings.push(message),
      ...options,
      app: {
        cwd: import.meta.dir,
        prepare: () => [process.execPath, FAKE_AGENT],
        env: { ...process.env, ...env },
        ...options.app,
      },
    });

    await host.start();

    return { host, warnings };
  };

  const connect = async (query?: string) => {
    if (!host) throw new Error('no host');

    const client = await ConsoleClient.connect(`ws://127.0.0.1:${host.port}/ws?${query ?? `t=${host.token}`}`);

    clients.push(client);

    return client;
  };

  it('relays hello and snapshot from the child, then replays them to a browser that connects later', async () => {
    const { host } = await startHost({ FAKE_HELLO_DELAY_MS: '300' });
    const early = await connect();

    const first = await early.replay();

    expect(first.child.gen).toBe(1);

    const hello = (await early.waitFor(isAgent('hello'))) as Message<'agent'>;
    const snapshotMessage = (await early.waitFor(isAgent('snapshot'))) as Message<'agent'>;

    await early.waitFor(isChild('running', 1));

    expect(hello.message).toMatchObject({ v: 1, type: 'hello', payload: { coreVersion: '0.13.0', adapter: null } });
    expect(snapshotMessage.message.payload).toEqual(snapshot as never);
    expect(early.indexOf(isAgent('hello'))).toBeLessThan(early.indexOf(isChild('running', 1)));

    const late = await connect();
    const replay = await late.replay();

    expect(replay.child).toMatchObject({ gen: 1, state: 'running', pid: host.supervisor.pid });
    expect(replay.hello?.pid).toBe(host.supervisor.pid as number);
    expect(replay.snapshot).toEqual(snapshot as never);
    expect(replay.logs.some((line) => line.stream === 'stdout' && line.line.startsWith('fake app up'))).toBe(true);
  });

  it('forwards a browser command to the child and its commandResult back', async () => {
    await startHost();
    const client = await connect();

    await client.waitFor(isChild('running', 1));

    client.send({ v: 1, type: 'command', command: { id: 'c-1', command: 'emitEvent', event: 'item.created' } });

    const result = (await client.waitFor(isAgent('commandResult'))) as Message<'agent'>;

    expect(result.message).toEqual({
      v: 1,
      type: 'commandResult',
      payload: { id: 'c-1', ok: true, result: { echo: { id: 'c-1', command: 'emitEvent', event: 'item.created' } } },
    });
  });

  it('ignores a browser frame that is not a valid command', async () => {
    await startHost();
    const client = await connect();

    await client.waitFor(isChild('running', 1));

    client.send({ v: 1, type: 'command', command: { id: 'c-1', command: 'deleteEverything' } });
    client.send({ v: 2, type: 'command', command: { id: 'c-2', command: 'emitEvent', event: 'x' } });
    client.send('not json at all');
    client.send({ v: 1, type: 'command', command: { id: 'c-3', command: 'emitEvent', event: 'x' } });

    await client.waitFor(isAgent('commandResult'));
    await Bun.sleep(50);

    const ids = client.messages
      .filter(isAgent('commandResult'))
      .map((message) => ((message as Message<'agent'>).message.payload as { id: string }).id);

    expect(ids).toEqual(['c-3']);
  });

  it('reports a crash as an exited child with its stderr in the logs, and answers later commands itself', async () => {
    const { host } = await startHost();
    const client = await connect();

    await client.waitFor(isChild('running', 1));

    client.send({ v: 1, type: 'command', command: { id: 'c-1', command: 'runSchedule', name: 'crash' } });

    const exited = (await client.waitFor(isChild('exited', 1))) as Message<'child'>;
    const stderr = (await client.waitFor(isLog('crashing on demand'))) as Message<'log'>;

    expect(exited).toMatchObject({ gen: 1, state: 'exited', code: 3 });
    expect(stderr).toMatchObject({ gen: 1, stream: 'stderr' });
    expect(client.indexOf(isLog('crashing on demand'))).toBeLessThan(client.indexOf(isChild('exited', 1)));

    const replay = await (await connect()).replay();

    expect(replay.child).toMatchObject({ gen: 1, state: 'exited', code: 3 });
    expect(replay.logs.some((line) => line.stream === 'stderr' && line.line.includes('crashing on demand'))).toBe(true);

    client.send({ v: 1, type: 'command', command: { id: 'c-2', command: 'emitEvent', event: 'x' } });

    const refused = (await client.waitFor(isAgent('commandResult'))) as Message<'agent'>;

    expect(refused.message.payload).toEqual({
      id: 'c-2',
      ok: false,
      error: { name: 'ConsoleHostError', message: 'No app is running' },
    });
    expect(host.supervisor.generation).toBe(1);
  });

  it('respawns the child with the next generation when a watched file changes', async () => {
    const watchDir = tmpDir('asena-console-src-');
    const prepared: number[] = [];
    let preparations = 0;

    const { host } = await startHost(
      {},
      {
        watchDir,
        watchDebounceMs: 50,
        app: {
          cwd: import.meta.dir,
          prepare: () => {
            prepared.push(++preparations);

            return [process.execPath, FAKE_AGENT];
          },
        },
      },
    );
    const client = await connect();

    await client.waitFor(isChild('running', 1));

    const firstPid = host.supervisor.pid;

    fs.writeFileSync(path.join(watchDir, 'ItemService.ts'), 'export class ItemService {}\n');

    await client.waitFor(isChild('running', 2));

    const states = client.messages
      .filter((message): message is Message<'child'> => message.type === 'child')
      .map(({ gen, state }) => `${gen}:${state}`);

    expect(states.slice(states.indexOf('1:restarting'))).toEqual([
      '1:restarting',
      '1:exited',
      '2:starting',
      '2:running',
    ]);
    expect(client.messages.find(isChild('exited', 1))).toMatchObject({ code: 0 });
    expect(client.messages.some(isLog('fake app stopping'))).toBe(true);
    expect(host.supervisor.pid).not.toBe(firstPid);
    expect(prepared).toEqual([1, 2]);

    const helloGen2 = client.messages.filter(isAgent('hello')).at(-1) as Message<'agent'>;

    expect((helloGen2.message.payload as { pid: number }).pid).toBe(host.supervisor.pid as number);

    const replay = await (await connect()).replay();

    expect(replay.child).toMatchObject({ gen: 2, state: 'running' });
    expect(replay.logs.some((line) => line.gen === 1)).toBe(true);
  });

  it('folds restarts requested during a restart into one more generation', async () => {
    const { host } = await startHost();
    const client = await connect();

    await client.waitFor(isChild('running', 1));
    await Promise.all([host.restart(), host.restart(), host.restart()]);
    await client.waitFor(isChild('running', 3));

    expect(host.supervisor.generation).toBe(3);
  });

  it('kills a child that ignores SIGTERM once the grace period is over', async () => {
    const { host } = await startHost(
      { FAKE_IGNORE_SIGTERM: '1' },
      { app: { cwd: import.meta.dir, prepare: () => [process.execPath, FAKE_AGENT], killAfterMs: 200 } },
    );
    const client = await connect();

    await client.waitFor(isChild('running', 1));

    const started = Date.now();

    await host.restart();

    expect(Date.now() - started).toBeGreaterThanOrEqual(200);
    expect(await client.waitFor(isChild('exited', 1))).toMatchObject({ signal: 'SIGKILL' });
    expect(client.messages.some(isLog('ignores SIGTERM'))).toBe(true);

    await client.waitFor(isChild('running', 2));
  });

  it('reports a failed start as an exited generation with the reason in the logs', async () => {
    let attempts = 0;
    const { host } = await startHost(
      {},
      {
        app: {
          cwd: import.meta.dir,
          prepare: () => {
            attempts++;

            if (attempts === 1) throw new Error('Failed to import src/broken.ts: Unexpected token');

            return [process.execPath, FAKE_AGENT];
          },
        },
      },
    );
    const replay = await (await connect()).replay();

    expect(replay.child).toEqual({ gen: 1, state: 'exited' });
    expect(replay.logs.at(-1)).toMatchObject({ gen: 1, stream: 'stderr' });
    expect(replay.logs.at(-1)?.line).toContain('Failed to import src/broken.ts');

    await host.restart();

    const client = await connect();

    await client.waitFor(isChild('running', 2));
  });

  it('replays only the current child metrics to a browser that connects after a restart', async () => {
    const { host } = await startHost({ FAKE_METRICS: '2' });
    const client = await connect();

    await client.waitFor(isChild('running', 1));
    await host.restart();
    await waitUntil(() => client.messages.filter(isAgent('metrics')).length === 4, 5000, 'the second child metrics');

    const replay = await (await connect()).replay();

    expect(replay.child.gen).toBe(2);
    expect(replay.metrics.map((sample) => sample.rss)).toEqual([host.supervisor.pid, host.supervisor.pid] as number[]);
  });

  it('drops the previous child hello and snapshot when the next generation fails to start', async () => {
    let attempts = 0;
    const { host } = await startHost(
      { FAKE_METRICS: '1' },
      {
        app: {
          cwd: import.meta.dir,
          prepare: () => {
            if (++attempts === 2) throw new Error('Failed to import src/broken.ts: Unexpected token');

            return [process.execPath, FAKE_AGENT];
          },
        },
      },
    );
    const client = await connect();

    await client.waitFor(isAgent('metrics'));
    await host.restart();

    const replay = await (await connect()).replay();

    expect(replay.child).toEqual({ gen: 2, state: 'exited' });
    expect(replay.hello).toBeUndefined();
    expect(replay.snapshot).toBeUndefined();
    expect(replay.metrics).toEqual([]);
  });

  it('drops an IPC message that fails the protocol check and warns once', async () => {
    const { warnings } = await startHost({ FAKE_SEND_INVALID: '1' });
    const client = await connect();

    await client.waitFor(isChild('running', 1));

    expect(warnings.filter((warning) => warning.includes('does not understand'))).toHaveLength(1);
    expect(client.messages.filter(isAgent('hello'))).toHaveLength(1);
    expect(host?.snapshotState().logs.some((line) => line.line.includes('does not understand'))).toBe(true);
  });

  it('warns in the terminal and the UI when the core version is outside the supported range', async () => {
    const { warnings } = await startHost({ FAKE_CORE_VERSION: '0.12.4' });
    const client = await connect();

    await client.waitFor(isChild('running', 1));

    const log = (await client.waitFor(isLog('0.12.4 is outside the range'))) as Message<'log'>;

    expect(log).toMatchObject({ gen: 1, stream: 'stderr' });
    expect(warnings.some((warning) => warning.includes('0.12.4 is outside the range'))).toBe(true);
  });

  it('replays no more log lines than the contract allows, keeping the newest', async () => {
    const lines = CONSOLE_REPLAY_LIMITS.logs + 50;
    const { host } = await startHost({ FAKE_FLOOD_LINES: String(lines) });
    const client = await connect();

    await client.waitFor(isChild('running', 1));

    client.send({ v: 1, type: 'command', command: { id: 'c-1', command: 'emitEvent', event: 'flood' } });

    await client.waitFor(isLog(`flood ${lines - 1}`));

    const replay = host.snapshotState();

    expect(replay.logs).toHaveLength(CONSOLE_REPLAY_LIMITS.logs);
    expect(replay.logs.at(-1)?.line).toBe(`flood ${lines - 1}`);
  });

  describe('HTTP surface', () => {
    const get = (path: string, init?: RequestInit) => fetch(`http://127.0.0.1:${host?.port}${path}`, init);

    it('answers 403 to a missing or wrong token on the page, the WebSocket and the proxy', async () => {
      const { host } = await startHost();

      expect((await get('/')).status).toBe(403);
      expect((await get('/?t=wrong')).status).toBe(403);
      expect((await get(`/ws?t=wrong`)).status).toBe(403);
      expect((await get(`/api/http?t=wrong`, { method: 'POST', body: '{}' })).status).toBe(403);
      await expect(connect('t=wrong')).rejects.toThrow();

      const page = await get(`/?t=${host.token}`);

      expect(page.status).toBe(200);
      expect(page.headers.get('content-type')).toContain('text/html');
      expect(page.headers.get('referrer-policy')).toBe('no-referrer');
      expect(await page.text()).toContain('not built');
    });

    it('serves the built UI and its assets, and no file outside the assets folder', async () => {
      const uiDir = tmpDir('asena-console-ui-');

      fs.mkdirSync(path.join(uiDir, 'assets'));
      fs.writeFileSync(path.join(uiDir, 'index.html'), '<!doctype html><div id="root"></div>');
      fs.writeFileSync(path.join(uiDir, 'assets', 'main-abc.js'), 'console.log(1);');
      fs.writeFileSync(path.join(uiDir, 'secret.txt'), 'nope');

      const { host } = await startHost({}, { uiDir });

      expect(await (await get(`/?t=${host.token}`)).text()).toBe('<!doctype html><div id="root"></div>');

      const asset = await get('/assets/main-abc.js');

      expect(asset.status).toBe(200);
      expect(await asset.text()).toBe('console.log(1);');
      expect((await get('/assets/../secret.txt')).status).not.toBe(200);
      expect((await get('/assets/%2e%2e/secret.txt')).status).not.toBe(200);
      expect((await get('/assets/..%2fsecret.txt')).status).toBe(404);
      expect((await get('/assets/missing.js')).status).toBe(404);
    });

    it('proxies POST /api/http to the app port and returns status, headers, body and timing', async () => {
      const appPort = randomPort();
      const { host } = await startHost({ FAKE_APP_PORT: String(appPort) });
      const client = await connect();

      await client.waitFor(isChild('running', 1));

      const response = await get(`/api/http?t=${host.token}`, {
        method: 'POST',
        body: JSON.stringify({
          method: 'PUT',
          path: '/items/7',
          query: { dryRun: 'true' },
          headers: { 'x-probe': 'yes', host: 'example.org' },
          body: '{"name":"desk"}',
        }),
      });

      expect(response.status).toBe(200);

      const proxied = (await response.json()) as { status: number; headers: Record<string, string>; body: string };

      expect(proxied.status).toBe(201);
      expect(proxied.headers['x-from']).toBe('fake-app');
      expect(JSON.parse(proxied.body)).toEqual({
        method: 'PUT',
        path: '/items/7',
        query: { dryRun: 'true' },
        header: 'yes',
        host: `127.0.0.1:${appPort}`,
        body: '{"name":"desk"}',
      });
    });

    it('answers 400 to a body that is not a console HTTP request', async () => {
      const { host } = await startHost();
      const post = (body: string) => get(`/api/http?t=${host.token}`, { method: 'POST', body });

      expect((await post('nope')).status).toBe(400);
      expect(
        (await post(JSON.stringify({ method: 'GET', path: '//example.org/x', query: {}, headers: {}, body: '' })))
          .status,
      ).toBe(400);
      expect((await get(`/api/http?t=${host.token}`)).status).toBe(405);
    });

    it('answers 502 with a reason when the app is headless or not running', async () => {
      const { host } = await startHost();
      const client = await connect();
      const request = JSON.stringify({ method: 'GET', path: '/', query: {}, headers: {}, body: '' });
      const post = () => get(`/api/http?t=${host.token}`, { method: 'POST', body: request });

      await client.waitFor(isChild('running', 1));

      const headless = await post();

      expect(headless.status).toBe(502);
      expect(await headless.json()).toEqual({ reason: 'The app runs headless and serves no HTTP' });

      client.send({ v: 1, type: 'command', command: { id: 'c-1', command: 'runSchedule', name: 'crash' } });
      await client.waitFor(isChild('exited', 1));

      const stopped = await post();

      expect(stopped.status).toBe(502);
      expect(await stopped.json()).toEqual({ reason: 'No app is running' });
    });
  });

  it('stops the child and the server on stop()', async () => {
    const { host } = await startHost();
    const client = await connect();

    await client.waitFor(isChild('running', 1));

    const port = host.port;

    await host.stop();
    await waitUntil(() => client.messages.some(isChild('exited', 1)), 2000, 'the exited message');

    expect(host.supervisor.pid).toBeUndefined();
    await expect(fetch(`http://127.0.0.1:${port}/`)).rejects.toThrow();
  });
});
