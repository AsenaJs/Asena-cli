import {
  CONSOLE_TOKEN_PARAM,
  CONSOLE_WS_PATH,
  type ConsoleHostMessage,
  isConsoleHostMessage,
} from '../../lib/console/hostProtocol';
import type { ConnectionStatus } from './store';

export interface SocketLike {
  onopen: ((event: unknown) => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: ((event: unknown) => void) | null;
  close(): void;
}

export interface ConsoleClientOptions {
  url: string;
  onMessage: (message: ConsoleHostMessage) => void;
  onStatus: (status: ConnectionStatus) => void;
  createSocket?: (url: string) => SocketLike;
  setTimer?: (callback: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  initialDelayMs?: number;
  maxDelayMs?: number;
}

export interface ConsoleClient {
  close(): void;
}

export const readToken = (search: string): string | null => {
  const token = new URLSearchParams(search).get(CONSOLE_TOKEN_PARAM);

  return token ? token : null;
};

export const consoleWsUrl = (location: { protocol: string; host: string }, token: string): string => {
  const scheme = location.protocol === 'https:' ? 'wss:' : 'ws:';

  return `${scheme}//${location.host}${CONSOLE_WS_PATH}?${CONSOLE_TOKEN_PARAM}=${encodeURIComponent(token)}`;
};

export const reconnectDelay = (attempt: number, initialMs: number, maxMs: number): number =>
  Math.min(maxMs, initialMs * 2 ** attempt);

const parse = (data: unknown): ConsoleHostMessage | null => {
  if (typeof data !== 'string') return null;

  try {
    const value: unknown = JSON.parse(data);

    return isConsoleHostMessage(value) ? value : null;
  } catch {
    return null;
  }
};

/** Keeps one socket to the host open, reconnecting with exponential backoff until `close()`. */
export const createConsoleClient = (options: ConsoleClientOptions): ConsoleClient => {
  const {
    url,
    onMessage,
    onStatus,
    createSocket = (target) => new WebSocket(target) as unknown as SocketLike,
    setTimer = (callback, ms) => setTimeout(callback, ms),
    clearTimer = (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
    initialDelayMs = 500,
    maxDelayMs = 10_000,
  } = options;

  let socket: SocketLike | null = null;
  let timer: unknown = null;
  let attempt = 0;
  let closed = false;

  const connect = () => {
    timer = null;
    onStatus('connecting');

    const current = createSocket(url);

    socket = current;
    current.onopen = () => {
      attempt = 0;
      onStatus('open');
    };
    current.onmessage = (event) => {
      const message = parse(event.data);

      if (message) {
        onMessage(message);
      } else {
        console.warn('[asena console] dropped a message that does not match the host protocol');
      }
    };
    current.onclose = () => {
      if (closed || socket !== current) return;

      socket = null;
      onStatus('closed');
      timer = setTimer(connect, reconnectDelay(attempt++, initialDelayMs, maxDelayMs));
    };
  };

  connect();

  return {
    close: () => {
      closed = true;

      if (timer !== null) clearTimer(timer);

      socket?.close();
      socket = null;
    },
  };
};
