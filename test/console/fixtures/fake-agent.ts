// Stands in for an app with the devtools agent attached, driven by the FAKE_* environment variables.
import snapshot from './snapshot.json';

const send = (type: string, payload: unknown) => process.send?.({ v: 1, type, payload });

const port = process.env['FAKE_APP_PORT'] ? Number(process.env['FAKE_APP_PORT']) : null;

const serve = (port: number | null) =>
  port === null
    ? null
    : Bun.serve({
        hostname: '127.0.0.1',
        port,
        fetch: async (request) => {
          const url = new URL(request.url);

          if (url.pathname === '/slow') await Bun.sleep(Number(process.env['FAKE_SLOW_MS'] ?? 0));

          return Response.json(
            {
              method: request.method,
              path: url.pathname,
              query: Object.fromEntries(url.searchParams),
              header: request.headers.get('x-probe'),
              host: request.headers.get('host'),
              body: await request.text(),
            },
            { status: 201, headers: { 'x-from': 'fake-app' } },
          );
        },
      });

const server = serve(port);
const second =
  process.env['FAKE_SECOND_SERVER'] === '1'
    ? serve(process.env['FAKE_SECOND_PORT'] ? Number(process.env['FAKE_SECOND_PORT']) : null)
    : null;
const lastServerId = process.env['FAKE_SECOND_SERVER'] === '1' ? 'server-2' : 'server-1';

process.on('SIGTERM', () => {
  if (process.env['FAKE_IGNORE_SIGTERM'] === '1') {
    console.log('fake app ignores SIGTERM');

    return;
  }

  console.log('fake app stopping');
  server?.stop(true);
  second?.stop(true);
  process.exit(0);
});

process.on('message', (message: { type?: string; payload?: Record<string, unknown> }) => {
  if (message?.type !== 'command' || !message.payload) return;

  const command = message.payload;

  if (command['command'] === 'runSchedule' && command['name'] === 'crash') {
    console.error('fake app crashing on demand');
    process.exit(3);
  }

  if (command['command'] === 'runSchedule' && command['name'] === 'hang') return;

  if (command['command'] === 'emitEvent' && command['event'] === 'flood') {
    const lines = Number(process.env['FAKE_FLOOD_LINES'] ?? 10);

    console.log(Array.from({ length: lines }, (_, i) => `flood ${i}`).join('\n'));
  }

  if (command['command'] === 'emitEvent' && command['event'] === 'stop-server') {
    send('serverStopped', { serverId: command['data'] });
  }

  send('commandResult', {
    id: command['id'],
    serverId: command['serverId'] ?? lastServerId,
    ok: true,
    result: { echo: command },
  });
});

if (process.env['FAKE_SEND_INVALID'] === 'v2') {
  process.send?.({ v: 2, type: 'hello', payload: {} });
}

if (process.env['FAKE_SEND_INVALID'] === 'type') {
  process.send?.({ v: 1, type: 'bogus', payload: {} });
}

if (process.env['FAKE_SEND_INVALID'] === 'payload') {
  process.send?.({ v: 1, type: 'metrics', payload: 'busy' });
}

console.log(`fake app up pid=${process.pid}`);

await Bun.sleep(Number(process.env['FAKE_HELLO_DELAY_MS'] ?? 0));

send('hello', {
  serverId: 'server-1',
  coreVersion: process.env['FAKE_CORE_VERSION'] ?? '0.13.0',
  adapter: server ? 'Fake' : null,
  port: server ? server.port : null,
  pid: process.pid,
});

send('snapshot', { ...snapshot, serverId: 'server-1' });

if (process.env['FAKE_SECOND_SERVER'] === '1') {
  send('hello', {
    serverId: 'server-2',
    coreVersion: '0.13.0',
    adapter: 'Second',
    port: second ? second.port : null,
    pid: process.pid,
  });
  send('snapshot', { ...snapshot, routes: [], serverId: 'server-2' });
}

for (let i = 0; i < Number(process.env['FAKE_METRICS'] ?? 0); i++) {
  send('metrics', {
    rss: process.pid,
    heapUsed: 1,
    heapTotal: 2,
    cpuPercent: 0,
    eventLoopLagMs: 0,
    uptimeSeconds: i,
    readiness: { status: 'up' },
    servers: { [lastServerId]: { readiness: { status: 'up' } } },
  });
}
