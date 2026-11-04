import { afterEach, describe, expect, it } from 'bun:test';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { buildAppUrl, proxyHttpRequest } from '../../lib/console/httpProxy';
import { pipeLines } from '../../lib/console/lines';
import { ReplayBuffer } from '../../lib/console/ReplayBuffer';
import { createConsoleToken, hasConsoleToken } from '../../lib/console/token';
import { isIgnoredChange, watchSourceFolder } from '../../lib/console/watch';
import type { ConsoleHttpRequest } from '../../lib/console/hostProtocol';
import { randomPort, waitUntil } from './helpers';

describe('ReplayBuffer', () => {
  it('keeps everything below the limit, oldest first', () => {
    const buffer = new ReplayBuffer<number>(3);

    buffer.push(1);
    buffer.push(2);

    expect(buffer.toArray()).toEqual([1, 2]);
    expect(buffer.size).toBe(2);
  });

  it('drops the oldest items past the limit and keeps their order', () => {
    const buffer = new ReplayBuffer<number>(3);

    for (let i = 1; i <= 8; i++) buffer.push(i);

    expect(buffer.toArray()).toEqual([6, 7, 8]);
    expect(buffer.size).toBe(3);
  });

  it('returns a copy', () => {
    const buffer = new ReplayBuffer<number>(2);

    buffer.push(1);
    buffer.toArray().push(99);

    expect(buffer.toArray()).toEqual([1]);
  });
});

describe('console token', () => {
  const url = (query: string) => new URL(`http://127.0.0.1:1234/${query}`);

  it('creates distinct url-safe tokens of at least 32 characters', () => {
    const first = createConsoleToken();
    const second = createConsoleToken();

    expect(first).not.toBe(second);
    expect(first.length).toBeGreaterThanOrEqual(32);
    expect(first).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('accepts only the exact token in the t parameter', () => {
    expect(hasConsoleToken(url('?t=secret-token'), 'secret-token')).toBe(true);
    expect(hasConsoleToken(url(''), 'secret-token')).toBe(false);
    expect(hasConsoleToken(url('?t='), 'secret-token')).toBe(false);
    expect(hasConsoleToken(url('?t=secret-toke'), 'secret-token')).toBe(false);
    expect(hasConsoleToken(url('?t=secret-tokenX'), 'secret-token')).toBe(false);
    expect(hasConsoleToken(url('?t=SECRET-TOKEN'), 'secret-token')).toBe(false);
    expect(hasConsoleToken(url('?token=secret-token'), 'secret-token')).toBe(false);
  });
});

describe('pipeLines', () => {
  const streamOf = (...chunks: (string | Uint8Array)[]) =>
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);

        controller.close();
      },
    });

  it('splits on LF and CRLF across chunk boundaries and flushes a last line without a break', async () => {
    const lines: string[] = [];
    const chunks: Uint8Array[] = [];

    await pipeLines(
      streamOf('one\ntw', 'o\r\nthree\n\nfo', 'ur'),
      (line) => lines.push(line),
      (chunk) => chunks.push(chunk),
    );

    expect(lines).toEqual(['one', 'two', 'three', '', 'four']);
    expect(chunks).toHaveLength(3);
  });

  it('decodes a multi-byte character split between chunks', async () => {
    const bytes = Buffer.from('ğüş\n');
    const lines: string[] = [];

    await pipeLines(streamOf(bytes.subarray(0, 1), bytes.subarray(1)), (line) => lines.push(line));

    expect(lines).toEqual(['ğüş']);
  });
});

describe('buildAppUrl', () => {
  it('appends the path and the encoded query to a fixed loopback origin', () => {
    expect(buildAppUrl(3000, { path: '/items/7', query: { q: 'a b', tag: 'x&y' } })).toBe(
      'http://127.0.0.1:3000/items/7?q=a+b&tag=x%26y',
    );
    expect(buildAppUrl(3000, { path: '/', query: {} })).toBe('http://127.0.0.1:3000/');
  });

  it('keeps a path that would be another host under new URL(path, base) on the app origin', () => {
    expect(new URL(buildAppUrl(3000, { path: '/@example.org/x', query: {} })).host).toBe('127.0.0.1:3000');
    expect(new URL(buildAppUrl(3000, { path: '/..\\example.org', query: {} })).host).toBe('127.0.0.1:3000');
  });
});

describe('proxyHttpRequest', () => {
  let app: ReturnType<typeof Bun.serve> | undefined;

  afterEach(() => {
    app?.stop(true);
    app = undefined;
  });

  const startApp = () => {
    app = Bun.serve({
      hostname: '127.0.0.1',
      port: randomPort(),
      fetch: async (request) => {
        const url = new URL(request.url);

        if (url.pathname === '/redirect') return Response.redirect('/elsewhere', 302);

        const headers = new Headers({ 'x-reply': 'yes' });

        headers.append('set-cookie', 'a=1');
        headers.append('set-cookie', 'b=2');

        return Response.json(
          {
            method: request.method,
            path: url.pathname,
            search: url.search,
            probe: request.headers.get('x-probe'),
            host: request.headers.get('host'),
            body: await request.text(),
          },
          { status: 418, headers },
        );
      },
    });

    return app.port as number;
  };

  const request = (overrides: Partial<ConsoleHttpRequest> = {}): ConsoleHttpRequest => ({
    method: 'POST',
    path: '/items',
    query: { page: '2' },
    headers: { 'x-probe': 'p', host: 'evil.example', 'content-type': 'text/plain' },
    body: 'hello',
    ...overrides,
  });

  it('forwards method, path, query, headers and body, and returns status, headers, body and timing', async () => {
    const port = startApp();
    const response = await proxyHttpRequest(request(), port);
    const echoed = JSON.parse(response.body);

    expect(response.status).toBe(418);
    expect(response.headers['x-reply']).toBe('yes');
    expect(response.headers['set-cookie']).toBe('a=1, b=2');
    expect(response.durationMs).toBeGreaterThanOrEqual(0);
    expect(echoed).toEqual({
      method: 'POST',
      path: '/items',
      search: '?page=2',
      probe: 'p',
      host: `127.0.0.1:${port}`,
      body: 'hello',
    });
  });

  it('sends no body with GET and uppercases the method', async () => {
    const port = startApp();
    const response = await proxyHttpRequest(request({ method: 'get' }), port);

    expect(JSON.parse(response.body)).toMatchObject({ method: 'GET', body: '' });
  });

  it('returns a redirect instead of following it', async () => {
    const port = startApp();
    const response = await proxyHttpRequest(request({ method: 'GET', path: '/redirect' }), port);

    expect(response.status).toBe(302);
    expect(response.headers['location']).toContain('/elsewhere');
  });

  it('rejects when nothing listens on the port', async () => {
    await expect(proxyHttpRequest(request(), randomPort())).rejects.toThrow();
  });
});

describe('watchSourceFolder', () => {
  let dir: string | undefined;

  afterEach(() => {
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
    dir = undefined;
  });

  it('ignores dot directories, dot files and backup files', () => {
    expect(isIgnoredChange('.git/index')).toBe(true);
    expect(isIgnoredChange('services/.ItemService.ts.swp')).toBe(true);
    expect(isIgnoredChange('ItemService.ts~')).toBe(true);
    expect(isIgnoredChange('services/ItemService.ts')).toBe(false);
  });

  it('reports a burst of changes, nested ones included, as one call', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'asena-watch-'));

    dir = root;
    fs.mkdirSync(path.join(root, 'nested'));

    const calls: string[][] = [];
    const watcher = watchSourceFolder(root, (files) => calls.push(files), 50);

    try {
      fs.writeFileSync(path.join(root, 'a.ts'), 'export {};');
      fs.writeFileSync(path.join(root, 'nested', 'b.ts'), 'export {};');
      fs.writeFileSync(path.join(root, '.hidden'), 'x');

      await waitUntil(() => calls.length > 0, 2000, 'the watcher');
      await Bun.sleep(150);

      expect(calls).toHaveLength(1);
      expect(calls[0]).toContain('a.ts');
      expect(calls[0]).toContain(path.join('nested', 'b.ts'));
      expect(calls[0]).not.toContain('.hidden');
    } finally {
      watcher.close();
    }
  });
});
