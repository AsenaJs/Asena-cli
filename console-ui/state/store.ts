import {
  CONSOLE_REPLAY_LIMITS,
  type ConsoleChildStatus,
  type ConsoleHostMessage,
  type ConsoleLogLine,
  type ConsoleRequestRecord,
  type ConsoleRun,
} from '../../lib/console/hostProtocol';
import type {
  DevtoolsAgentMessage,
  DevtoolsCommandResult,
  DevtoolsHello,
  DevtoolsMetrics,
  DevtoolsServerState,
  DevtoolsSnapshot,
} from '../../lib/console/protocol';

export type ConnectionStatus = 'connecting' | 'open' | 'closed';

/** `seq` comes from the host, so it survives a reconnect: a stable key and the anchor for pause and clear. */
export type LogEntry = ConsoleLogLine;

/** One `AsenaServer` of the app, as its agent last reported it. */
export interface ConsoleServer {
  serverId: string;
  hello: DevtoolsHello;
  /** The generation `hello` came from; behind `child.gen` once that child is gone. */
  helloGen: number;
  /** Kept across a respawn so the views do not empty while the next child boots. */
  snapshot: DevtoolsSnapshot | null;
  /** The generation `snapshot` came from; behind `child.gen` while it is stale. */
  snapshotGen: number | null;
  stopped: boolean;
}

export interface ConsoleState {
  connection: ConnectionStatus;
  child: ConsoleChildStatus | null;
  /** The restart timeline, oldest first. */
  runs: ConsoleRun[];
  /** In the order they attached; the previous child's stay until a server of the current one reports. */
  servers: ConsoleServer[];
  /** The server the user picked; `null`, or an id no server has, views the default one. */
  selectedServer: string | null;
  /** The current child's samples, oldest first. */
  metrics: DevtoolsMetrics[];
  /** Every generation's output, oldest first, so a crash's stderr stays visible after a respawn. */
  logs: LogEntry[];
  requests: ConsoleRequestRecord[];
  /** The results of the commands this page sent, by id. */
  commandResults: Record<string, DevtoolsCommandResult>;
  /** The ids this page sent that have no result yet. */
  pendingCommands: string[];
  /** The app's time zone; `null` until the host's replay has arrived. */
  timeZone: string | null;
}

export type ConsoleAction =
  | { kind: 'connection'; status: ConnectionStatus }
  | { kind: 'message'; message: ConsoleHostMessage }
  | { kind: 'commandSent'; id: string }
  | { kind: 'serverSelected'; serverId: string };

export const initialConsoleState: ConsoleState = {
  connection: 'connecting',
  child: null,
  runs: [],
  servers: [],
  selectedServer: null,
  metrics: [],
  logs: [],
  requests: [],
  commandResults: {},
  pendingCommands: [],
  timeZone: null,
};

/** Settles a command this page sent; a result for any other id, e.g. another tab's, is dropped. */
const settleCommand = (state: ConsoleState, result: DevtoolsCommandResult): ConsoleState =>
  state.pendingCommands.includes(result.id)
    ? {
        ...state,
        commandResults: { ...state.commandResults, [result.id]: result },
        pendingCommands: state.pendingCommands.filter((id) => id !== result.id),
      }
    : state;

const keepLast = <T>(items: T[], limit: number): T[] => (items.length > limit ? items.slice(-limit) : items);

const append = <T>(items: T[], item: T, limit: number): T[] => keepLast([...items, item], limit);

type ChildExit = Pick<ConsoleChildStatus, 'code' | 'signal' | 'endedBy'>;

const exitOf = ({ code, signal, endedBy }: ConsoleChildStatus): ChildExit => ({
  ...(code === undefined ? {} : { code }),
  ...(signal === undefined ? {} : { signal }),
  ...(endedBy === undefined ? {} : { endedBy }),
});

const childStatus = (status: ConsoleChildStatus): ConsoleChildStatus => ({
  gen: status.gen,
  state: status.state,
  ...(status.pid === undefined ? {} : { pid: status.pid }),
  ...exitOf(status),
  ...(status.unattached ? { unattached: true } : {}),
  ...(status.at === undefined ? {} : { at: status.at }),
  ...(status.cause === undefined ? {} : { cause: status.cause }),
});

const logEntry = ({ seq, gen, stream, line, at }: ConsoleLogLine): LogEntry => ({ seq, gen, stream, line, at });

const updateRuns = (runs: ConsoleRun[], status: ConsoleChildStatus): ConsoleRun[] => {
  const { gen, state } = status;
  const exit = exitOf(status);
  const last = runs.at(-1);

  if (last?.gen === gen)
    return [...runs.slice(0, -1), { gen, startedAt: last.startedAt, cause: last.cause, state, ...exit }];

  const run: ConsoleRun = {
    gen,
    startedAt: status.at ?? 0,
    cause: status.cause ?? { kind: 'restart' },
    state,
    ...exit,
  };

  return append(runs, run, CONSOLE_REPLAY_LIMITS.runs);
};

const currentGen = (state: ConsoleState): number => state.child?.gen ?? 0;

/** Whether the current child reported the server, rather than the one before it. */
export const isServerLive = (state: ConsoleState, server: ConsoleServer): boolean =>
  server.helloGen === currentGen(state);

const updateLiveServer = (
  state: ConsoleState,
  serverId: string,
  change: (server: ConsoleServer) => ConsoleServer,
): ConsoleState => ({
  ...state,
  servers: state.servers.map((server) =>
    server.serverId === serverId && isServerLive(state, server) ? change(server) : server,
  ),
});

/** The same id of the previous child keeps its snapshot on screen until this server sends its own. */
const applyHello = (state: ConsoleState, hello: DevtoolsHello): ConsoleState => {
  const previous = state.servers.find((server) => server.serverId === hello.serverId);

  return {
    ...state,
    servers: [
      ...state.servers.filter((server) => isServerLive(state, server) && server.serverId !== hello.serverId),
      {
        serverId: hello.serverId,
        hello,
        helloGen: currentGen(state),
        snapshot: previous?.snapshot ?? null,
        snapshotGen: previous?.snapshotGen ?? null,
        stopped: false,
      },
    ],
  };
};

const applyAgentMessage = (state: ConsoleState, message: DevtoolsAgentMessage): ConsoleState => {
  switch (message.type) {
    case 'hello':
      return applyHello(state, message.payload);
    case 'snapshot':
      return updateLiveServer(state, message.payload.serverId, (server) => ({
        ...server,
        snapshot: message.payload,
        snapshotGen: currentGen(state),
      }));
    case 'serverStopped':
      return updateLiveServer(state, message.payload.serverId, (server) => ({ ...server, stopped: true }));
    case 'metrics':
      return { ...state, metrics: append(state.metrics, message.payload, CONSOLE_REPLAY_LIMITS.metrics) };
    case 'request':
      return { ...state, requests: append(state.requests, message.payload, CONSOLE_REPLAY_LIMITS.requests) };
    case 'commandResult':
      return settleCommand(state, message.payload);
  }
};

const applyChild = (state: ConsoleState, status: ConsoleChildStatus): ConsoleState => {
  if (status.gen < currentGen(state)) return state;

  const child = childStatus(status);
  const runs = updateRuns(state.runs, child);

  if (status.gen === currentGen(state)) return { ...state, child, runs };

  return { ...state, child, runs, metrics: [] };
};

const applyMessage = (state: ConsoleState, message: ConsoleHostMessage): ConsoleState => {
  switch (message.type) {
    case 'snapshotState':
      return message.commandResults.reduce(settleCommand, {
        ...state,
        child: childStatus(message.child),
        runs: keepLast(message.runs, CONSOLE_REPLAY_LIMITS.runs),
        servers: message.servers.map(({ hello, snapshot, stopped }) => ({
          serverId: hello.serverId,
          hello,
          helloGen: message.child.gen,
          snapshot: snapshot ?? null,
          snapshotGen: snapshot ? message.child.gen : null,
          stopped: stopped === true,
        })),
        metrics: keepLast(message.metrics, CONSOLE_REPLAY_LIMITS.metrics),
        logs: keepLast(message.logs, CONSOLE_REPLAY_LIMITS.logs).map(logEntry),
        requests: keepLast(message.requests, CONSOLE_REPLAY_LIMITS.requests),
        timeZone: message.timeZone,
      });
    case 'agent':
      return applyAgentMessage(state, message.message);
    case 'log':
      return { ...state, logs: append(state.logs, logEntry(message), CONSOLE_REPLAY_LIMITS.logs) };
    case 'child':
      return applyChild(state, message);
  }
};

export const consoleReducer = (state: ConsoleState, action: ConsoleAction): ConsoleState => {
  switch (action.kind) {
    case 'connection':
      return { ...state, connection: action.status };
    case 'commandSent':
      return { ...state, pendingCommands: [...state.pendingCommands, action.id] };
    case 'serverSelected':
      return { ...state, selectedServer: action.serverId };
    case 'message':
      return applyMessage(state, action.message);
  }
};

/** The newest state the samples hold for a server: a sample that left it out does not hide the one before. */
export const serverStateOf = (metrics: DevtoolsMetrics[], serverId: string): DevtoolsServerState | null => {
  for (let i = metrics.length - 1; i >= 0; i--) {
    const state = metrics[i]?.servers[serverId];

    if (state) return state;
  }

  return null;
};

/** The server the views show, as the current child knows it. */
export interface ServerView {
  /** `null` until a server has reported. */
  server: ConsoleServer | null;
  /** `null` while the server on screen is one the previous child reported. */
  hello: DevtoolsHello | null;
  snapshot: DevtoolsSnapshot | null;
  /** Whether `snapshot` belongs to a child that is no longer the current one. */
  stale: boolean;
  /** Whether the server stopped while its process runs on; one that stops for a restart or an exit does not count. */
  stopped: boolean;
  state: DevtoolsServerState | null;
}

/** The picked server, else the most recent one that runs in the current child, else the most recent. */
export const serverView = (state: ConsoleState): ServerView => {
  const server =
    state.servers.find((candidate) => candidate.serverId === state.selectedServer) ??
    state.servers.findLast((candidate) => isServerLive(state, candidate) && !candidate.stopped) ??
    state.servers.at(-1) ??
    null;

  if (!server) return { server, hello: null, snapshot: null, stale: false, stopped: false, state: null };

  const live = isServerLive(state, server);

  return {
    server,
    hello: live ? server.hello : null,
    snapshot: server.snapshot,
    stale: server.snapshot !== null && server.snapshotGen !== currentGen(state),
    stopped: live && server.stopped && state.child?.state === 'running',
    state: live ? serverStateOf(state.metrics, server.serverId) : null,
  };
};
