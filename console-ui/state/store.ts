import {
  CONSOLE_REPLAY_LIMITS,
  type ConsoleChildStatus,
  type ConsoleHostMessage,
  type ConsoleLogLine,
  type ConsoleRun,
} from '../../lib/console/hostProtocol';
import type {
  DevtoolsAgentMessage,
  DevtoolsCommandResult,
  DevtoolsHello,
  DevtoolsMetrics,
  DevtoolsRequestRecord,
  DevtoolsSnapshot,
} from '../../lib/console/protocol';

export type ConnectionStatus = 'connecting' | 'open' | 'closed';

/** `seq` comes from the host, so it survives a reconnect: a stable key and the anchor for pause and clear. */
export type LogEntry = ConsoleLogLine;

export interface ConsoleState {
  connection: ConnectionStatus;
  child: ConsoleChildStatus | null;
  /** The restart timeline, oldest first. */
  runs: ConsoleRun[];
  /** The current child's hello; `null` until a child of the current generation has sent one. */
  hello: DevtoolsHello | null;
  /** Kept across a respawn so the views do not empty while the next child boots. */
  snapshot: DevtoolsSnapshot | null;
  /** The generation `snapshot` came from; behind `child.gen` while it is stale. */
  snapshotGen: number | null;
  /** The current child's samples, oldest first. */
  metrics: DevtoolsMetrics[];
  /** Every generation's output, oldest first, so a crash's stderr stays visible after a respawn. */
  logs: LogEntry[];
  requests: DevtoolsRequestRecord[];
  commandResults: Record<string, DevtoolsCommandResult>;
  /** The app's time zone; `null` until the host's replay has arrived. */
  timeZone: string | null;
}

export type ConsoleAction =
  { kind: 'connection'; status: ConnectionStatus } | { kind: 'message'; message: ConsoleHostMessage };

export const initialConsoleState: ConsoleState = {
  connection: 'connecting',
  child: null,
  runs: [],
  hello: null,
  snapshot: null,
  snapshotGen: null,
  metrics: [],
  logs: [],
  requests: [],
  commandResults: {},
  timeZone: null,
};

const keepLast = <T>(items: T[], limit: number): T[] => (items.length > limit ? items.slice(-limit) : items);

const append = <T>(items: T[], item: T, limit: number): T[] => keepLast([...items, item], limit);

const childStatus = ({ gen, state, pid, code, signal, at, cause }: ConsoleChildStatus): ConsoleChildStatus => ({
  gen,
  state,
  ...(pid === undefined ? {} : { pid }),
  ...(code === undefined ? {} : { code }),
  ...(signal === undefined ? {} : { signal }),
  ...(at === undefined ? {} : { at }),
  ...(cause === undefined ? {} : { cause }),
});

const logEntry = ({ seq, gen, stream, line, at }: ConsoleLogLine): LogEntry => ({ seq, gen, stream, line, at });

const updateRuns = (runs: ConsoleRun[], status: ConsoleChildStatus): ConsoleRun[] => {
  const { gen, state, code, signal } = status;
  const exit = { ...(code === undefined ? {} : { code }), ...(signal === undefined ? {} : { signal }) };
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

const applyAgentMessage = (state: ConsoleState, message: DevtoolsAgentMessage): ConsoleState => {
  switch (message.type) {
    case 'hello':
      return { ...state, hello: message.payload };
    case 'snapshot':
      return { ...state, snapshot: message.payload, snapshotGen: state.child?.gen ?? null };
    case 'metrics':
      return { ...state, metrics: append(state.metrics, message.payload, CONSOLE_REPLAY_LIMITS.metrics) };
    case 'request':
      return { ...state, requests: append(state.requests, message.payload, CONSOLE_REPLAY_LIMITS.requests) };
    case 'commandResult':
      return { ...state, commandResults: { ...state.commandResults, [message.payload.id]: message.payload } };
  }
};

const applyChild = (state: ConsoleState, status: ConsoleChildStatus): ConsoleState => {
  const currentGen = state.child?.gen ?? 0;

  if (status.gen < currentGen) return state;

  const child = childStatus(status);
  const runs = updateRuns(state.runs, child);

  if (status.gen === currentGen) return { ...state, child, runs };

  return { ...state, child, runs, hello: null, metrics: [] };
};

const applyMessage = (state: ConsoleState, message: ConsoleHostMessage): ConsoleState => {
  switch (message.type) {
    case 'snapshotState':
      return {
        ...state,
        child: childStatus(message.child),
        runs: keepLast(message.runs, CONSOLE_REPLAY_LIMITS.runs),
        hello: message.hello ?? null,
        snapshot: message.snapshot ?? null,
        snapshotGen: message.snapshot ? message.child.gen : null,
        metrics: keepLast(message.metrics, CONSOLE_REPLAY_LIMITS.metrics),
        logs: keepLast(message.logs, CONSOLE_REPLAY_LIMITS.logs).map(logEntry),
        requests: keepLast(message.requests, CONSOLE_REPLAY_LIMITS.requests),
        timeZone: message.timeZone,
      };
    case 'agent':
      return applyAgentMessage(state, message.message);
    case 'log':
      return { ...state, logs: append(state.logs, logEntry(message), CONSOLE_REPLAY_LIMITS.logs) };
    case 'child':
      return applyChild(state, message);
  }
};

export const consoleReducer = (state: ConsoleState, action: ConsoleAction): ConsoleState => {
  if (action.kind === 'connection') return { ...state, connection: action.status };

  return applyMessage(state, action.message);
};

/** Whether the snapshot on screen belongs to a child that is no longer the current one. */
export const isSnapshotStale = (state: ConsoleState): boolean =>
  state.snapshot !== null && state.child !== null && state.snapshotGen !== state.child.gen;
