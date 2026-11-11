import { describe, expect, test } from 'bun:test';
import {
  CONSOLE_CHILD_STATES,
  CONSOLE_LOG_STREAMS,
  CONSOLE_PROTOCOL_VERSION,
  CONSOLE_REPLAY_LIMITS,
  type ConsoleBrowserMessage,
  type ConsoleChildState,
  type ConsoleHostMessage,
  type ConsoleHostMessageType,
  type ConsoleHttpRequest,
  isConsoleBrowserMessage,
  isConsoleHostMessage,
  isConsoleHttpRequest,
} from '../../lib/console/hostProtocol';
import {
  type DevtoolsAgentMessage,
  type DevtoolsAgentMessageType,
  type DevtoolsComponentType,
  type DevtoolsDependency,
  type DevtoolsHttpMethod,
  type DevtoolsRequestRecord,
  type DevtoolsScope,
  type DevtoolsSnapshot,
  type DevtoolsStepKind,
  isDevtoolsAgentMessage,
} from '../../lib/console/protocol';
import hostMessagesJson from './fixtures/host-messages.json';
import snapshotJson from './fixtures/snapshot.json';

type Equals<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

const COMPONENT_TYPES = [
  'COMPONENT',
  'SERVICE',
  'CONTROLLER',
  'FRONTEND_CONTROLLER',
  'SCHEDULE',
  'MIDDLEWARE',
  'WEBSOCKET',
  'CONFIG',
  'EVENT',
  'POST_PROCESSOR',
  'MESSAGE_CONTROLLER',
  'EXCEPTION_HANDLER',
] as const;
const SCOPES = ['singleton', 'prototype'] as const;
const DEPENDENCY_KINDS = ['inject', 'soft', 'strategy'] as const;
const HTTP_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD', 'CONNECT', 'TRACE', 'ALL'] as const;
const STEP_KINDS = [
  'global-middleware',
  'middleware',
  'validator',
  'controller',
  'catch',
  'config-onError',
  'adapter-default',
  'not-found',
] as const;
const AGENT_TYPES = ['hello', 'snapshot', 'metrics', 'request', 'commandResult', 'serverStopped'] as const;
const HOST_TYPES = ['snapshotState', 'agent', 'log', 'child'] as const;

// The fixture checks below enumerate the protocol's unions; a member added to protocol.ts fails typecheck here.
const unionsAgree: true[] = [
  true satisfies Equals<(typeof COMPONENT_TYPES)[number], DevtoolsComponentType>,
  true satisfies Equals<(typeof SCOPES)[number], DevtoolsScope>,
  true satisfies Equals<(typeof DEPENDENCY_KINDS)[number], DevtoolsDependency['kind']>,
  true satisfies Equals<(typeof HTTP_METHODS)[number], DevtoolsHttpMethod>,
  true satisfies Equals<(typeof STEP_KINDS)[number], DevtoolsStepKind>,
  true satisfies Equals<(typeof AGENT_TYPES)[number], DevtoolsAgentMessageType>,
  true satisfies Equals<(typeof HOST_TYPES)[number], ConsoleHostMessageType>,
  true satisfies Equals<(typeof CONSOLE_CHILD_STATES)[number], ConsoleChildState>,
];

type Json = Record<string, unknown>;

const oneOf = (members: readonly string[]) => (value: unknown) => typeof value === 'string' && members.includes(value);
const isString = (value: unknown) => typeof value === 'string';
const isStringArray = (value: unknown) => Array.isArray(value) && value.every(isString);

/** Every required field of a DevtoolsSnapshot, with its type; returns the paths that do not match. */
const snapshotProblems = (snapshot: Json): string[] => {
  const problems: string[] = [];
  const expectField = (path: string, ok: boolean) => {
    if (!ok) problems.push(path);
  };
  const list = (key: string) => {
    const value = snapshot[key];

    expectField(key, Array.isArray(value));

    return (Array.isArray(value) ? value : []) as Json[];
  };

  list('components').forEach((component, i) => {
    const at = `components[${i}]`;

    expectField(`${at}.name`, isString(component['name']));
    expectField(`${at}.type`, oneOf(COMPONENT_TYPES)(component['type']));
    expectField(`${at}.scope`, oneOf(SCOPES)(component['scope']));
    expectField(`${at}.interfaces`, isStringArray(component['interfaces']));
    expectField(`${at}.className`, isString(component['className']));
    expectField(
      `${at}.dependencies`,
      Array.isArray(component['dependencies']) &&
        (component['dependencies'] as Json[]).every(
          (dependency) =>
            (dependency['field'] === null || isString(dependency['field'])) &&
            isString(dependency['target']) &&
            oneOf(DEPENDENCY_KINDS)(dependency['kind']),
        ),
    );
    expectField(
      `${at}.values`,
      Array.isArray(component['values']) &&
        (component['values'] as Json[]).every(
          (value) =>
            isString(value['field']) &&
            isString(value['key']) &&
            typeof value['hasDefault'] === 'boolean' &&
            typeof value['parsed'] === 'boolean' &&
            typeof value['isSet'] === 'boolean',
        ),
    );
  });

  list('routes').forEach((route, i) => {
    const at = `routes[${i}]`;

    expectField(`${at}.controller`, isString(route['controller']));
    expectField(`${at}.method`, isString(route['method']));
    expectField(`${at}.httpMethod`, oneOf(HTTP_METHODS)(route['httpMethod']));
    expectField(`${at}.path`, isString(route['path']));
    expectField(`${at}.middlewares`, isStringArray(route['middlewares']));
    expectField(`${at}.validator`, route['validator'] === null || isString(route['validator']));
    expectField(`${at}.contract`, route['contract'] === null || isString(route['contract']));
    expectField(`${at}.hasBodySchema`, typeof route['hasBodySchema'] === 'boolean');
  });

  list('websockets').forEach((ws, i) =>
    expectField(`websockets[${i}]`, isString(ws['namespace']) && isString(ws['component'])),
  );
  list('schedules').forEach((schedule, i) =>
    expectField(`schedules[${i}]`, isString(schedule['name']) && isString(schedule['cron'])),
  );
  list('events').forEach((event, i) =>
    expectField(`events[${i}]`, isString(event['component']) && isString(event['method']) && isString(event['event'])),
  );
  list('messageHandlers').forEach((handler, i) =>
    expectField(
      `messageHandlers[${i}]`,
      isString(handler['controller']) &&
        isString(handler['method']) &&
        isString(handler['pattern']) &&
        oneOf(['message', 'event'])(handler['kind']) &&
        isString(handler['transport']),
    ),
  );
  list('exceptionHandlers').forEach((handler, i) =>
    expectField(
      `exceptionHandlers[${i}]`,
      isString(handler['component']) &&
        Array.isArray(handler['catches']) &&
        (handler['catches'] as Json[]).every(
          (entry) =>
            isString(entry['method']) &&
            (entry['types'] === 'catch-all' ||
              (Array.isArray(entry['types']) &&
                (entry['types'] as Json[]).every((type) => isString(type['name']) && isStringArray(type['chain'])))),
        ),
    ),
  );

  const config = snapshot['config'] as Json | undefined;

  expectField(
    'config',
    typeof config === 'object' &&
      config !== null &&
      typeof config['hasOnError'] === 'boolean' &&
      typeof config['hasOnNotFound'] === 'boolean' &&
      Array.isArray(config['globalMiddlewares']),
  );

  return problems;
};

const isRequestRecordValid = (record: DevtoolsRequestRecord): boolean =>
  isString(record.id) &&
  typeof record.status === 'number' &&
  record.steps.every((step) => oneOf(STEP_KINDS)(step.kind) && isString(step.name)) &&
  record.steps.some((step) => step.kind === record.answeredBy.kind && step.name === record.answeredBy.name);

const snapshot = snapshotJson as unknown as DevtoolsSnapshot;
const hostMessages = hostMessagesJson as unknown[];

describe('console fixtures', () => {
  test('the protocol unions the checks enumerate are complete', () => {
    expect(unionsAgree.every(Boolean)).toBe(true);
  });

  test('snapshot.json has every field DevtoolsSnapshot requires', () => {
    expect(snapshotProblems(snapshotJson as Json)).toEqual([]);
  });

  test('snapshot.json passes the guards inside an agent message and a replay', () => {
    const asAgent = { v: 1, type: 'snapshot', payload: snapshot };

    expect(isDevtoolsAgentMessage(asAgent)).toBe(true);
    expect(
      isConsoleHostMessage({
        v: CONSOLE_PROTOCOL_VERSION,
        type: 'snapshotState',
        timeZone: 'UTC',
        child: { gen: 1, state: 'running', pid: 1 },
        servers: [{ hello: { serverId: 'server-1' }, snapshot }],
        runs: [],
        metrics: [],
        logs: [],
        requests: [],
        commandResults: [],
      }),
    ).toBe(true);
  });

  test('every recorded host message passes the guard', () => {
    const rejected = hostMessages.filter((message) => !isConsoleHostMessage(message));

    expect(rejected).toEqual([]);
  });

  test('the recording opens with the replay a connecting browser gets, within the replay limits', () => {
    const [first] = hostMessages as ConsoleHostMessage[];

    expect(first?.type).toBe('snapshotState');

    if (first?.type !== 'snapshotState') return;

    expect(first.metrics.length).toBeLessThanOrEqual(CONSOLE_REPLAY_LIMITS.metrics);
    expect(first.logs.length).toBeLessThanOrEqual(CONSOLE_REPLAY_LIMITS.logs);
    expect(first.requests.length).toBeLessThanOrEqual(CONSOLE_REPLAY_LIMITS.requests);
    expect(first.servers.map((server) => server.snapshot)).toEqual([{ ...snapshot, serverId: 'server-1' }]);
  });

  test('every recorded hello, snapshot, request and answered command names its server, and samples list it', () => {
    const agentMessages = (hostMessages as ConsoleHostMessage[]).flatMap((message) =>
      message.type === 'agent' ? [message.message] : [],
    );

    for (const message of agentMessages) {
      if (message.type === 'metrics') expect(Object.keys(message.payload.servers)).toEqual(['server-1']);
      else expect(message.payload.serverId).toBe('server-1');
    }
  });

  test('the recording covers every message type, child state and log stream', () => {
    const messages = hostMessages as ConsoleHostMessage[];
    const agentMessages = messages.flatMap((message) => (message.type === 'agent' ? [message.message] : []));
    const childStates = messages.flatMap((message) => (message.type === 'child' ? [message.state] : []));
    const streams = messages.flatMap((message) => {
      if (message.type === 'log') return [message.stream];
      if (message.type === 'snapshotState') return message.logs.map((line) => line.stream);

      return [];
    });

    expect(new Set(messages.map((message) => message.type))).toEqual(new Set(HOST_TYPES));
    expect(new Set(agentMessages.map((message) => message.type))).toEqual(new Set(AGENT_TYPES));
    expect(new Set(childStates)).toEqual(new Set(CONSOLE_CHILD_STATES));
    expect(new Set(streams)).toEqual(new Set(CONSOLE_LOG_STREAMS));
  });

  test('recorded snapshots equal snapshot.json and recorded requests name a step that answered', () => {
    const messages = hostMessages as ConsoleHostMessage[];
    const agentMessages: DevtoolsAgentMessage[] = messages.flatMap((message) =>
      message.type === 'agent' ? [message.message] : [],
    );
    const requests = [
      ...messages.flatMap((message) => (message.type === 'snapshotState' ? message.requests : [])),
      ...agentMessages.flatMap((message) => (message.type === 'request' ? [message.payload] : [])),
    ];

    for (const message of agentMessages) {
      if (message.type === 'snapshot') expect(message.payload).toEqual({ ...snapshot, serverId: 'server-1' });
    }

    expect(requests.length).toBeGreaterThan(0);
    expect(requests.filter((record) => !isRequestRecordValid(record))).toEqual([]);
  });

  test('recorded requests are answered by every step kind the fixture app can produce, and by non-HTTP dispatches', () => {
    const messages = hostMessages as ConsoleHostMessage[];
    const requests = messages.flatMap((message) => {
      if (message.type === 'snapshotState') return message.requests;

      return message.type === 'agent' && message.message.type === 'request' ? [message.message.payload] : [];
    });
    // The fixture app declares no @Config.onError, so no record can be answered by it.
    const reachable = STEP_KINDS.filter((kind) => kind !== 'global-middleware' && kind !== 'config-onError');

    expect(snapshot.config.hasOnError).toBe(false);
    expect(new Set(requests.map((record) => record.answeredBy.kind))).toEqual(new Set(reachable));
    expect(new Set(requests.map((record) => record.method))).toEqual(
      new Set(['GET', 'POST', 'PUT', '@Schedule', '@On', '@MessagePattern']),
    );
  });

  test('generations never go backwards', () => {
    const gens = (hostMessages as ConsoleHostMessage[]).flatMap((message) => {
      if (message.type === 'snapshotState') return [message.child.gen];
      if (message.type === 'log' || message.type === 'child') return [message.gen];

      return [];
    });

    expect(gens).toEqual([...gens].sort((a, b) => a - b));
  });

  test('log lines are numbered in the order the host captured them, without gaps', () => {
    const seqs = (hostMessages as ConsoleHostMessage[]).flatMap((message) => {
      if (message.type === 'snapshotState') return message.logs.map((line) => line.seq);
      if (message.type === 'log') return [message.seq];

      return [];
    });

    expect(seqs).toEqual(seqs.map((_, i) => i));
  });

  test('every generation that starts says why, and the replay lists the runs so far', () => {
    const messages = hostMessages as ConsoleHostMessage[];
    const starts = messages.filter(
      (message): message is Extract<ConsoleHostMessage, { type: 'child' }> =>
        message.type === 'child' && message.state === 'starting',
    );
    const [first] = messages;

    expect(starts.length).toBeGreaterThan(0);
    expect(starts.every((message) => message.cause !== undefined && message.at !== undefined)).toBe(true);
    expect(first?.type === 'snapshotState' && first.runs.map((run) => run.gen)).toEqual([1]);
  });
});

describe('isConsoleHostMessage', () => {
  const log = { v: 1, type: 'log', seq: 0, gen: 1, stream: 'stdout', line: 'ready', at: 1 };
  const child = { v: 1, type: 'child', gen: 2, state: 'exited', code: 1 };
  const run = { gen: 1, startedAt: 1, cause: { kind: 'start' }, state: 'running' };
  const state = {
    v: 1,
    type: 'snapshotState',
    timeZone: 'UTC',
    child: { gen: 1, state: 'starting' },
    servers: [],
    runs: [],
    metrics: [],
    logs: [],
    requests: [],
    commandResults: [{ id: 'c-1', ok: true }],
  };
  const server = { hello: { serverId: 'server-1' } };

  test('accepts a replay with servers, with and without a snapshot or the stopped mark', () => {
    expect(isConsoleHostMessage({ ...state, servers: [server] })).toBe(true);
    expect(isConsoleHostMessage({ ...state, servers: [server, { ...server, snapshot: {}, stopped: true }] })).toBe(
      true,
    );
  });

  test('accepts each message type', () => {
    expect(isConsoleHostMessage(log)).toBe(true);
    expect(isConsoleHostMessage(child)).toBe(true);
    expect(isConsoleHostMessage(state)).toBe(true);
    expect(isConsoleHostMessage({ v: 1, type: 'agent', message: { v: 1, type: 'metrics', payload: {} } })).toBe(true);
  });

  test('accepts the cause and time of a child state and the runs of a replay', () => {
    expect(isConsoleHostMessage({ ...child, state: 'starting', at: 5, cause: { kind: 'restart' } })).toBe(true);
    expect(isConsoleHostMessage({ ...child, cause: { kind: 'change', files: ['ItemService.ts'] } })).toBe(true);
    expect(
      isConsoleHostMessage({
        ...state,
        runs: [run, { ...run, gen: 2, cause: { kind: 'change', files: [] }, state: 'exited', code: 1 }],
      }),
    ).toBe(true);
    expect(isConsoleHostMessage({ ...child, state: 'exited', signal: 'SIGKILL', endedBy: 'restart' })).toBe(true);
    expect(isConsoleHostMessage({ v: 1, type: 'child', gen: 2, state: 'starting', unattached: true })).toBe(true);
    expect(
      isConsoleHostMessage({ ...state, runs: [{ ...run, state: 'exited', signal: 'SIGTERM', endedBy: 'stop' }] }),
    ).toBe(true);
  });

  test.each([
    ['another version', { ...log, v: 2 }],
    ['an unknown type', { ...log, type: 'stdout' }],
    ['a non-object', 'log'],
    ['null', null],
    ['an unknown log stream', { ...log, stream: 'stdin' }],
    ['a log line without its time', { ...log, at: undefined }],
    ['a log line without its sequence number', { ...log, seq: undefined }],
    ['a negative sequence number', { ...log, seq: -1 }],
    ['an unknown start cause', { ...child, cause: { kind: 'reload' } }],
    ['a change cause without its files', { ...child, cause: { kind: 'change' } }],
    [
      'a change cause with removed paths that are not names',
      { ...child, cause: { kind: 'change', files: [], removed: [1] } },
    ],
    ['a change time that is not a number', { ...child, at: '12:00' }],
    ['a replay without its servers', { ...state, servers: undefined }],
    ['a replay with a server without its hello', { ...state, servers: [{ snapshot: {} }] }],
    ['a replay with a server whose hello has no id', { ...state, servers: [{ hello: { pid: 1 } }] }],
    ['a replay with a stopped mark that is not `true`', { ...state, servers: [{ ...server, stopped: 'yes' }] }],
    ['a replay without runs', { ...state, runs: undefined }],
    ['a replay with a run without its start time', { ...state, runs: [{ ...run, startedAt: undefined }] }],
    ['an unknown child state', { ...child, state: 'crashed' }],
    ['an unattached mark that is not `true`', { ...child, state: 'starting', unattached: 'yes' }],
    ['a fractional generation', { ...child, gen: 1.5 }],
    ['a signal that is not a name', { ...child, signal: 9 }],
    ['an unknown ending', { ...child, state: 'exited', signal: 'SIGKILL', endedBy: 'crash' }],
    ['a replay with a run of an unknown ending', { ...state, runs: [{ ...run, endedBy: 'reload' }] }],
    [
      'an agent message from another protocol version',
      { v: 1, type: 'agent', message: { v: 2, type: 'hello', payload: {} } },
    ],
    ['an agent message of an unknown type', { v: 1, type: 'agent', message: { v: 1, type: 'log', payload: {} } }],
    [
      'an agent message whose payload is not an object',
      { v: 1, type: 'agent', message: { v: 1, type: 'metrics', payload: 'busy' } },
    ],
    ['a replay without logs', { ...state, logs: undefined }],
    ['a replay with a malformed log line', { ...state, logs: [{ gen: 1, stream: 'stdout' }] }],
    ['a replay without a child', { ...state, child: undefined }],
    ["a replay without the app's time zone", { ...state, timeZone: undefined }],
    ['a replay with a time zone that is not a name', { ...state, timeZone: 180 }],
    ['a replay without the recent command results', { ...state, commandResults: undefined }],
    ['a replay with a command result without its id', { ...state, commandResults: [{ ok: true }] }],
  ])('rejects %s', (_, value) => {
    expect(isConsoleHostMessage(value)).toBe(false);
  });
});

describe('isConsoleBrowserMessage', () => {
  const command = (fields: Json): unknown => ({ v: 1, type: 'command', command: { id: 'c-1', ...fields } });

  test('accepts each agent command', () => {
    const accepted: ConsoleBrowserMessage[] = [
      { v: 1, type: 'command', command: { id: 'c-1', command: 'runSchedule', name: 'NightlyCleanup' } },
      { v: 1, type: 'command', command: { id: 'c-2', command: 'emitEvent', event: 'item.created', data: { id: 1 } } },
      {
        v: 1,
        type: 'command',
        command: {
          id: 'c-3',
          command: 'sendMessage',
          transport: 'default',
          pattern: 'inventory.reserve',
          kind: 'message',
        },
      },
    ];

    expect(accepted.every(isConsoleBrowserMessage)).toBe(true);
  });

  test('accepts a command addressed to a server', () => {
    expect(isConsoleBrowserMessage(command({ serverId: 'server-2', command: 'runSchedule', name: 'x' }))).toBe(true);
  });

  test('accepts a restart request', () => {
    const restart: ConsoleBrowserMessage = { v: 1, type: 'restart' };

    expect(isConsoleBrowserMessage(restart)).toBe(true);
  });

  test.each([
    ['a restart of another version', { v: 2, type: 'restart' }],
    ['another version', { v: 2, type: 'command', command: { id: 'c-1', command: 'runSchedule', name: 'x' } }],
    ['a host message type', { v: 1, type: 'log', command: { id: 'c-1', command: 'runSchedule', name: 'x' } }],
    ['a command without an id', { v: 1, type: 'command', command: { command: 'runSchedule', name: 'x' } }],
    ['an empty id', command({ id: '', command: 'runSchedule', name: 'x' })],
    ['an unknown command', command({ command: 'shutdown' })],
    ['a server id that is not a string', command({ serverId: 2, command: 'runSchedule', name: 'x' })],
    ['runSchedule without a name', command({ command: 'runSchedule' })],
    ['emitEvent without an event', command({ command: 'emitEvent', data: 1 })],
    [
      'sendMessage of an unknown kind',
      command({ command: 'sendMessage', transport: 'default', pattern: 'p', kind: 'rpc' }),
    ],
    ['sendMessage without a transport', command({ command: 'sendMessage', pattern: 'p', kind: 'event' })],
    ['a command that is an array', { v: 1, type: 'command', command: [] }],
  ])('rejects %s', (_, value) => {
    expect(isConsoleBrowserMessage(value)).toBe(false);
  });
});

describe('isConsoleHttpRequest', () => {
  const request: ConsoleHttpRequest = {
    method: 'POST',
    path: '/items/',
    query: { dryRun: 'true' },
    headers: { 'content-type': 'application/json' },
    body: '{"name":"lamp"}',
  };

  test('accepts a request for the app', () => {
    expect(isConsoleHttpRequest(request)).toBe(true);
    expect(isConsoleHttpRequest({ ...request, method: 'get', path: '/', query: {}, headers: {}, body: '' })).toBe(true);
    expect(isConsoleHttpRequest({ ...request, serverId: 'server-2' })).toBe(true);
  });

  test.each([
    ['a protocol-relative path', { ...request, path: '//example.org/items' }],
    ['a backslash path the URL parser reads as protocol-relative', { ...request, path: '/\\example.org/items' }],
    [
      'a path the URL parser reads as protocol-relative once a tab is removed',
      { ...request, path: '/\t/example.org/x' },
    ],
    [
      'a path the URL parser reads as protocol-relative once a newline is removed',
      { ...request, path: '/\n/example.org/x' },
    ],
    [
      'a path the URL parser reads as protocol-relative once a CR is removed',
      { ...request, path: '/\r/example.org/x' },
    ],
    ['a path with a NUL byte', { ...request, path: '/items\u0000' }],
    ['a path with a DEL byte', { ...request, path: '/items\u007f' }],
    ['an absolute URL', { ...request, path: 'http://example.org/items' }],
    ['a relative path', { ...request, path: 'items' }],
    ['a method with a line break', { ...request, method: 'GET\r\nX-Injected: 1' }],
    ['an empty method', { ...request, method: '' }],
    ['a non-string header value', { ...request, headers: { 'x-count': 1 } }],
    ['a query that is an array', { ...request, query: [['a', '1']] }],
    ['a server id that is not a string', { ...request, serverId: 2 }],
    ['a missing body', { ...request, body: undefined }],
    ['a JSON body that is not a string', { ...request, body: { name: 'lamp' } }],
  ])('rejects %s', (_, value) => {
    expect(isConsoleHttpRequest(value)).toBe(false);
  });
});
