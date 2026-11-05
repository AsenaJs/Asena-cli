// The contract between the console host (this CLI) and the console UI in the browser.
// Messages are named after their sender, as in ./protocol: a ConsoleHostMessage goes host -> browser.

import {
  type DevtoolsAgentMessage,
  type DevtoolsCommand,
  type DevtoolsCommandRequest,
  type DevtoolsHello,
  type DevtoolsMetrics,
  type DevtoolsRequestRecord,
  type DevtoolsSnapshot,
  isDevtoolsAgentMessage,
} from './protocol';

export const CONSOLE_PROTOCOL_VERSION = 1;

/** The query parameter carrying the session token on every console URL. */
export const CONSOLE_TOKEN_PARAM = 't';

export const CONSOLE_WS_PATH = '/ws';

export const CONSOLE_HTTP_PROXY_PATH = '/api/http';

export const CONSOLE_ASSETS_PREFIX = '/assets/';

/** How many of the most recent entries `snapshotState` replays. */
export const CONSOLE_REPLAY_LIMITS = { metrics: 120, logs: 2000, requests: 500, runs: 50 } as const;

export const CONSOLE_CHILD_STATES = ['starting', 'running', 'exited', 'restarting'] as const;

export type ConsoleChildState = (typeof CONSOLE_CHILD_STATES)[number];

export const CONSOLE_LOG_STREAMS = ['stdout', 'stderr'] as const;

export type ConsoleLogStream = (typeof CONSOLE_LOG_STREAMS)[number];

/** Why the host started a generation: the first start, a restart asked for in the UI, or saved source files. */
export type ConsoleRunCause = { kind: 'start' } | { kind: 'restart' } | { kind: 'change'; files: string[] };

export interface ConsoleChildStatus {
  /** The child's generation: 1 for the first spawn, one more on every respawn. */
  gen: number;
  state: ConsoleChildState;
  pid?: number;
  /** Exit code, once the child has exited on its own. */
  code?: number;
  /** Signal name, once the child has been killed by one. */
  signal?: string;
  /** Epoch milliseconds of the change. */
  at?: number;
  /** Set on the first status of a generation. */
  cause?: ConsoleRunCause;
}

/** One generation as the restart timeline shows it: when and why it started, and its latest state. */
export interface ConsoleRun {
  gen: number;
  startedAt: number;
  cause: ConsoleRunCause;
  state: ConsoleChildState;
  code?: number;
  signal?: string;
}

export interface ConsoleLogLine {
  /** Numbers every line the host captured this session from 0, so a replay repeats the numbers. */
  seq: number;
  gen: number;
  stream: ConsoleLogStream;
  /** One line of output, without its line break. */
  line: string;
  /** Epoch milliseconds. */
  at: number;
}

/** What a browser needs to catch up on connect. `hello` and `snapshot` belong to the current child. */
export interface ConsoleSnapshotState {
  child: ConsoleChildStatus;
  hello?: DevtoolsHello;
  snapshot?: DevtoolsSnapshot;
  /** The most recent generations, oldest first, the current one last. */
  runs: ConsoleRun[];
  metrics: DevtoolsMetrics[];
  logs: ConsoleLogLine[];
  requests: DevtoolsRequestRecord[];
}

interface ConsoleEnvelope<T extends string> {
  v: typeof CONSOLE_PROTOCOL_VERSION;
  type: T;
}

export type ConsoleSnapshotStateMessage = ConsoleEnvelope<'snapshotState'> & ConsoleSnapshotState;

/** An agent message, forwarded verbatim. */
export type ConsoleAgentMessage = ConsoleEnvelope<'agent'> & { message: DevtoolsAgentMessage };

export type ConsoleLogMessage = ConsoleEnvelope<'log'> & ConsoleLogLine;

export type ConsoleChildMessage = ConsoleEnvelope<'child'> & ConsoleChildStatus;

export type ConsoleHostMessage =
  ConsoleSnapshotStateMessage | ConsoleAgentMessage | ConsoleLogMessage | ConsoleChildMessage;

export type ConsoleHostMessageType = ConsoleHostMessage['type'];

/** A command for the agent. The host forwards it as a protocol `command` message. */
export type ConsoleCommandMessage = ConsoleEnvelope<'command'> & { command: DevtoolsCommandRequest };

/** Asks the host to respawn the app, as a saved source file does. */
export type ConsoleRestartMessage = ConsoleEnvelope<'restart'>;

export type ConsoleBrowserMessage = ConsoleCommandMessage | ConsoleRestartMessage;

export type ConsoleBrowserMessageType = ConsoleBrowserMessage['type'];

/** The body of `POST /api/http`: one request for the host to send to the app's port. */
export interface ConsoleHttpRequest {
  method: string;
  /** Starts with `/`, path params filled in, no query string. */
  path: string;
  query: Record<string, string>;
  headers: Record<string, string>;
  body: string;
}

export interface ConsoleHttpResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
  durationMs: number;
}

/** The 502 body of `POST /api/http` when the app could not be reached. */
export interface ConsoleHttpError {
  reason: string;
}

const HOST_MESSAGE_TYPES: readonly string[] = [
  'snapshotState',
  'agent',
  'log',
  'child',
] satisfies ConsoleHostMessageType[];

type Fields = Record<string, unknown>;

const isObject = (value: unknown): value is Fields =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isOneOf = (value: unknown, members: readonly string[]): boolean =>
  typeof value === 'string' && members.includes(value);

const isOptional = (value: unknown, check: (value: unknown) => boolean): boolean => value === undefined || check(value);

const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

const isString = (value: unknown): value is string => typeof value === 'string';

const isStringRecord = (value: unknown): value is Record<string, string> =>
  isObject(value) && Object.values(value).every(isString);

const isArrayOf = (value: unknown, check: (item: unknown) => boolean): boolean =>
  Array.isArray(value) && value.every(check);

const isRunCause = (value: unknown): boolean => {
  if (!isObject(value)) return false;

  switch (value['kind']) {
    case 'start':
    case 'restart':
      return true;
    case 'change':
      return isArrayOf(value['files'], isString);
    default:
      return false;
  }
};

const isExit = (value: Fields): boolean =>
  isOneOf(value['state'], CONSOLE_CHILD_STATES) &&
  isOptional(value['code'], isNumber) &&
  isOptional(value['signal'], isString);

const isChildStatus = (value: Fields): boolean =>
  Number.isInteger(value['gen']) &&
  isExit(value) &&
  isOptional(value['pid'], isNumber) &&
  isOptional(value['at'], isNumber) &&
  isOptional(value['cause'], isRunCause);

const isRun = (value: unknown): boolean =>
  isObject(value) &&
  Number.isInteger(value['gen']) &&
  isNumber(value['startedAt']) &&
  isRunCause(value['cause']) &&
  isExit(value);

const isLogLine = (value: unknown): boolean =>
  isObject(value) &&
  Number.isInteger(value['seq']) &&
  (value['seq'] as number) >= 0 &&
  Number.isInteger(value['gen']) &&
  isOneOf(value['stream'], CONSOLE_LOG_STREAMS) &&
  isString(value['line']) &&
  isNumber(value['at']);

const isSnapshotState = (value: Fields): boolean =>
  isObject(value['child']) &&
  isChildStatus(value['child']) &&
  isOptional(value['hello'], isObject) &&
  isOptional(value['snapshot'], isObject) &&
  isArrayOf(value['runs'], isRun) &&
  isArrayOf(value['metrics'], isObject) &&
  isArrayOf(value['logs'], isLogLine) &&
  isArrayOf(value['requests'], isObject);

/** Checks the envelope and the fields the host adds; agent payloads are checked only as far as ./protocol does. */
export const isConsoleHostMessage = (value: unknown): value is ConsoleHostMessage => {
  if (!isObject(value) || value['v'] !== CONSOLE_PROTOCOL_VERSION || !isOneOf(value['type'], HOST_MESSAGE_TYPES)) {
    return false;
  }

  switch (value['type']) {
    case 'snapshotState':
      return isSnapshotState(value);
    case 'agent':
      return isDevtoolsAgentMessage(value['message']);
    case 'log':
      return isLogLine(value);
    default:
      return isChildStatus(value);
  }
};

const isCommand = (value: unknown): value is DevtoolsCommandRequest => {
  if (!isObject(value) || !isString(value['id']) || value['id'] === '') return false;

  switch (value['command'] as DevtoolsCommand['command']) {
    case 'runSchedule':
      return isString(value['name']);
    case 'emitEvent':
      return isString(value['event']);
    case 'sendMessage':
      return isString(value['transport']) && isString(value['pattern']) && isOneOf(value['kind'], ['message', 'event']);
    default:
      return false;
  }
};

/** The host's input check on every browser WebSocket frame, after `JSON.parse`. */
export const isConsoleBrowserMessage = (value: unknown): value is ConsoleBrowserMessage => {
  if (!isObject(value) || value['v'] !== CONSOLE_PROTOCOL_VERSION) return false;

  return value['type'] === 'restart' || (value['type'] === 'command' && isCommand(value['command']));
};

// A second `/` or `\` makes the path protocol-relative under `new URL(path, base)`, i.e. another host.
// The URL parser drops tab, LF and CR first, so control characters are rejected before that check.
const APP_PATH = /^\/(?![/\\])/;

const hasControlCharacter = (value: string): boolean => {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);

    if (code < 0x20 || code === 0x7f) return true;
  }

  return false;
};

const isAppPath = (value: unknown): value is string =>
  isString(value) && !hasControlCharacter(value) && APP_PATH.test(value);

/** The host's input check on the `POST /api/http` body. */
export const isConsoleHttpRequest = (value: unknown): value is ConsoleHttpRequest =>
  isObject(value) &&
  isString(value['method']) &&
  /^[A-Za-z]+$/.test(value['method']) &&
  isAppPath(value['path']) &&
  isStringRecord(value['query']) &&
  isStringRecord(value['headers']) &&
  isString(value['body']);
