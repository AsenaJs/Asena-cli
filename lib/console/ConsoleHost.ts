import fs from 'fs';
import path from 'path';
import type { Server, ServerWebSocket } from 'bun';
import { AppSupervisor, type AppSupervisorOptions } from './AppSupervisor';
import {
  CONSOLE_ASSETS_PREFIX,
  CONSOLE_HTTP_PROXY_PATH,
  CONSOLE_PROTOCOL_VERSION,
  CONSOLE_REPLAY_LIMITS,
  CONSOLE_TOKEN_PARAM,
  CONSOLE_WS_PATH,
  type ConsoleChildStatus,
  type ConsoleHostMessage,
  type ConsoleHttpError,
  type ConsoleLogLine,
  type ConsoleRun,
  type ConsoleRunCause,
  type ConsoleSnapshotStateMessage,
  isConsoleBrowserMessage,
  isConsoleHttpRequest,
} from './hostProtocol';
import { proxyHttpRequest } from './httpProxy';
import {
  type DevtoolsAgentMessage,
  type DevtoolsHello,
  type DevtoolsMetrics,
  type DevtoolsRequestRecord,
  type DevtoolsSnapshot,
  agentMessage,
  DEVTOOLS_PROTOCOL_VERSION,
  hostMessage,
} from './protocol';
import { ReplayBuffer } from './ReplayBuffer';
import { createConsoleToken, hasConsoleToken } from './token';
import { watchSourceFolder, type SourceWatcher } from './watch';

export interface ConsoleHostOptions {
  /** The console's own port; 0 picks a free one. */
  port?: number;
  token?: string;
  /** The built console UI (`index.html` and `assets/`); null serves a placeholder page. */
  uiDir?: string | null;
  /** Restarts the app on a change below this directory. */
  watchDir?: string;
  watchDebounceMs?: number;
  /** Bun's idle timeout for the console's own connections; proxied app requests are exempt. */
  idleTimeoutSeconds?: number;
  app: Omit<AppSupervisorOptions, 'onStatus' | 'onLog' | 'onAgentMessage' | 'onInvalidMessage'>;
  /** Where the host's own warnings go; defaults to `console.warn`. */
  warn?: (message: string) => void;
  /** The app's IANA time zone; defaults to this process's, which an app spawned with its env shares. */
  timeZone?: string;
}

const TOPIC = 'console';

const UI_NOT_BUILT = `<!doctype html><html><head><meta charset="utf-8"><title>Asena console</title></head>
<body><p>The console UI is not built. Run <code>bun run build</code> in the CLI package.</p></body></html>`;

const PAGE_HEADERS = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' };

const json = (status: number, body: unknown): Response => Response.json(body, { status, headers: PAGE_HEADERS });

const proxyError = (status: number, reason: string): Response => json(status, { reason } satisfies ConsoleHttpError);

const listAssets = (uiDir: string | null | undefined): Map<string, string> => {
  const assets = new Map<string, string>();

  if (!uiDir) return assets;

  const dir = path.join(uiDir, 'assets');

  if (!fs.existsSync(dir)) return assets;

  for (const file of fs.readdirSync(dir, { recursive: true, encoding: 'utf-8' })) {
    const absolute = path.join(dir, file);

    if (fs.statSync(absolute).isFile()) {
      assets.set(`${CONSOLE_ASSETS_PREFIX}${file.split(path.sep).join('/')}`, absolute);
    }
  }

  return assets;
};

/** The `asena console` host: serves the UI, relays the app's agent to every browser and owns the app's restarts. */
export class ConsoleHost {
  public readonly token: string;

  public readonly supervisor: AppSupervisor;

  private server?: Server<unknown>;

  private watcher?: SourceWatcher;

  private readonly assets: Map<string, string>;

  private readonly indexHtml: string | null;

  private child: ConsoleChildStatus = { gen: 0, state: 'starting' };

  private hello?: DevtoolsHello;

  private snapshot?: DevtoolsSnapshot;

  private readonly metrics = new ReplayBuffer<DevtoolsMetrics>(CONSOLE_REPLAY_LIMITS.metrics);

  private readonly logs = new ReplayBuffer<ConsoleLogLine>(CONSOLE_REPLAY_LIMITS.logs);

  private readonly requests = new ReplayBuffer<DevtoolsRequestRecord>(CONSOLE_REPLAY_LIMITS.requests);

  private readonly warnedInvalid = new Set<number>();

  private readonly runs: ConsoleRun[] = [];

  private pendingCause?: ConsoleRunCause;

  private nextLogSeq = 0;

  public constructor(private readonly options: ConsoleHostOptions) {
    this.token = options.token ?? createConsoleToken();
    this.assets = listAssets(options.uiDir);

    const index = options.uiDir ? path.join(options.uiDir, 'index.html') : null;

    this.indexHtml = index && fs.existsSync(index) ? fs.readFileSync(index, 'utf-8') : null;

    this.supervisor = new AppSupervisor({
      ...options.app,
      onStatus: (status) => this.onStatus(status),
      onLog: (line) => this.onLog(line),
      onAgentMessage: (message, gen) => this.onAgentMessage(message, gen),
      onInvalidMessage: (message, gen) => this.onInvalidMessage(message, gen),
    });
  }

  public get port(): number {
    if (!this.server?.port) throw new Error('The console host is not started');

    return this.server.port;
  }

  public get url(): string {
    return `http://127.0.0.1:${this.port}/?${CONSOLE_TOKEN_PARAM}=${this.token}`;
  }

  public async start(): Promise<void> {
    this.server = Bun.serve<unknown>({
      hostname: '127.0.0.1',
      port: this.options.port ?? 0,
      ...(this.options.idleTimeoutSeconds === undefined ? {} : { idleTimeout: this.options.idleTimeoutSeconds }),
      fetch: (request, server) => this.handle(request, server),
      websocket: {
        open: (ws) => this.onBrowserOpen(ws),
        message: (ws, data) => this.onBrowserMessage(ws, data),
      },
    });

    await this.supervisor.start();

    if (this.options.watchDir) {
      this.watcher = watchSourceFolder(
        this.options.watchDir,
        (files) => void this.restart({ kind: 'change', files }),
        this.options.watchDebounceMs,
        this.options.app.cwd,
      );
    }
  }

  /** Restarts the app; restarts asked for while one runs fold into it, saved files adding up. */
  public restart(cause: ConsoleRunCause = { kind: 'restart' }): Promise<void> {
    this.pendingCause =
      this.pendingCause?.kind === 'change' && cause.kind === 'change'
        ? { kind: 'change', files: [...new Set([...this.pendingCause.files, ...cause.files])] }
        : cause;

    return this.supervisor.restart();
  }

  public async stop(): Promise<void> {
    this.watcher?.close();
    await this.supervisor.stop();
    await this.server?.stop(true);
  }

  public snapshotState(): ConsoleSnapshotStateMessage {
    return {
      v: CONSOLE_PROTOCOL_VERSION,
      type: 'snapshotState',
      child: this.child,
      ...(this.hello ? { hello: this.hello } : {}),
      ...(this.snapshot ? { snapshot: this.snapshot } : {}),
      runs: [...this.runs],
      metrics: this.metrics.toArray(),
      logs: this.logs.toArray(),
      requests: this.requests.toArray(),
      timeZone: this.options.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
    };
  }

  private warn(message: string): void {
    (this.options.warn ?? console.warn)(message);
  }

  private broadcast(message: ConsoleHostMessage): void {
    this.server?.publish(TOPIC, JSON.stringify(message));
  }

  private onStatus(reported: ConsoleChildStatus): void {
    const at = Date.now();
    let status: ConsoleChildStatus = { ...reported, at };

    // A failed start reports only `exited` for its generation, so the boundary is the generation, not `starting`.
    if (status.gen !== this.child.gen) {
      this.hello = undefined;
      this.snapshot = undefined;
      this.metrics.clear();

      const cause = this.pendingCause ?? (this.runs.length === 0 ? { kind: 'start' } : { kind: 'restart' });

      this.pendingCause = undefined;
      status = { ...status, cause };
      this.runs.push({ gen: status.gen, startedAt: at, cause, state: status.state });
      this.runs.splice(0, Math.max(0, this.runs.length - CONSOLE_REPLAY_LIMITS.runs));
    }

    const run = this.runs.at(-1);

    if (run?.gen === status.gen) {
      const { code, signal } = status;

      this.runs[this.runs.length - 1] = {
        gen: run.gen,
        startedAt: run.startedAt,
        cause: run.cause,
        state: status.state,
        ...(code === undefined ? {} : { code }),
        ...(signal === undefined ? {} : { signal }),
      };
    }

    this.child = status;
    this.broadcast({ v: CONSOLE_PROTOCOL_VERSION, type: 'child', ...status });
  }

  private onLog(line: Omit<ConsoleLogLine, 'seq'>): void {
    const numbered: ConsoleLogLine = { seq: this.nextLogSeq++, ...line };

    this.logs.push(numbered);
    this.broadcast({ v: CONSOLE_PROTOCOL_VERSION, type: 'log', ...numbered });
  }

  /** A warning shown in the terminal and, as a stderr line of the app, in the UI. */
  private hostWarning(gen: number, message: string): void {
    this.warn(message);
    this.onLog({ gen, stream: 'stderr', line: message, at: Date.now() });
  }

  private onAgentMessage(message: DevtoolsAgentMessage, gen: number): void {
    switch (message.type) {
      case 'hello':
        this.hello = message.payload;
        break;
      case 'snapshot':
        this.snapshot = message.payload;
        break;
      case 'metrics':
        this.metrics.push(message.payload);
        break;
      case 'request':
        this.requests.push(message.payload);
        break;
      default:
        break;
    }

    this.broadcast({ v: CONSOLE_PROTOCOL_VERSION, type: 'agent', message });

    if (message.type === 'hello' && this.child.gen === gen && this.child.state === 'starting') {
      this.onStatus({ gen, state: 'running', pid: message.payload.pid });
    }
  }

  private onInvalidMessage(message: unknown, gen: number): void {
    if (this.warnedInvalid.has(gen)) return;

    this.warnedInvalid.add(gen);

    const version = typeof message === 'object' && message !== null ? (message as { v?: unknown }).v : undefined;

    this.hostWarning(
      gen,
      typeof version === 'number' && version !== DEVTOOLS_PROTOCOL_VERSION
        ? `[asena console] The app's devtools agent speaks protocol v${version}; this CLI speaks v${DEVTOOLS_PROTOCOL_VERSION}. Its messages are dropped; update @asenajs/asena-cli or @asenajs/asena so both speak the same version.`
        : '[asena console] Dropped a devtools message this CLI does not understand.',
    );
  }

  private onBrowserOpen(ws: ServerWebSocket<unknown>): void {
    ws.send(JSON.stringify(this.snapshotState()));
    ws.subscribe(TOPIC);
  }

  private onBrowserMessage(ws: ServerWebSocket<unknown>, data: string | Buffer): void {
    let message: unknown;

    try {
      message = JSON.parse(typeof data === 'string' ? data : data.toString('utf-8'));
    } catch {
      return;
    }

    if (!isConsoleBrowserMessage(message)) return;

    if (message.type === 'restart') {
      void this.restart({ kind: 'restart' });

      return;
    }

    if (this.supervisor.send(hostMessage('command', message.command))) return;

    const failed = agentMessage('commandResult', {
      id: message.command.id,
      ok: false,
      error: { name: 'ConsoleHostError', message: 'No app is running' },
    });

    ws.send(
      JSON.stringify({ v: CONSOLE_PROTOCOL_VERSION, type: 'agent', message: failed } satisfies ConsoleHostMessage),
    );
  }

  private async handle(request: Request, server: Server<unknown>): Promise<Response | undefined> {
    const url = new URL(request.url);

    if (url.pathname.startsWith(CONSOLE_ASSETS_PREFIX)) {
      const asset = this.assets.get(url.pathname);

      return asset ? new Response(Bun.file(asset)) : new Response('Not Found', { status: 404 });
    }

    if (!hasConsoleToken(url, this.token)) {
      return new Response('Forbidden', { status: 403 });
    }

    if (url.pathname === CONSOLE_WS_PATH) {
      return server.upgrade(request, { data: undefined })
        ? undefined
        : new Response('Expected a WebSocket upgrade', { status: 426 });
    }

    if (url.pathname === CONSOLE_HTTP_PROXY_PATH) {
      if (request.method !== 'POST') {
        return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'POST' } });
      }

      // The proxy's own timeout bounds the request, not the console server's idle timeout.
      server.timeout(request, 0);

      return this.proxy(request);
    }

    if (url.pathname === '/' && (request.method === 'GET' || request.method === 'HEAD')) {
      return new Response(this.indexHtml ?? UI_NOT_BUILT, {
        headers: { ...PAGE_HEADERS, 'Content-Type': 'text/html; charset=utf-8' },
      });
    }

    return new Response('Not Found', { status: 404 });
  }

  private async proxy(request: Request): Promise<Response> {
    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return proxyError(400, 'The body is not JSON');
    }

    if (!isConsoleHttpRequest(body)) {
      return proxyError(400, 'The body is not a console HTTP request');
    }

    if (this.child.state !== 'running' || !this.hello) {
      return proxyError(502, 'No app is running');
    }

    if (this.hello.port === null) {
      return proxyError(502, 'The app runs headless and serves no HTTP');
    }

    try {
      return json(200, await proxyHttpRequest(body, this.hello.port));
    } catch (error) {
      return proxyError(502, error instanceof Error ? error.message : String(error));
    }
  }
}
