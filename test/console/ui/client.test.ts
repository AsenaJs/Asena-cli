import { describe, expect, test } from 'bun:test';
import type { ConsoleHostMessage } from '../../../lib/console/hostProtocol';
import {
  consoleWsUrl,
  createConsoleClient,
  readToken,
  reconnectDelay,
  type SocketLike,
} from '../../../console-ui/state/client';
import type { ConnectionStatus } from '../../../console-ui/state/store';

class FakeSocket implements SocketLike {
  onopen: SocketLike['onopen'] = null;
  onmessage: SocketLike['onmessage'] = null;
  onclose: SocketLike['onclose'] = null;
  closeCalls = 0;

  constructor(readonly url: string) {}

  sent: string[] = [];

  close() {
    this.closeCalls++;
  }

  send(data: string) {
    this.sent.push(data);
  }

  open() {
    this.onopen?.({});
  }

  receive(data: unknown) {
    this.onmessage?.({ data });
  }

  drop() {
    this.onclose?.({});
  }
}

const setup = () => {
  const sockets: FakeSocket[] = [];
  const statuses: ConnectionStatus[] = [];
  const messages: ConsoleHostMessage[] = [];
  const timers: { callback: () => void; ms: number; cleared: boolean }[] = [];

  const client = createConsoleClient({
    url: 'ws://127.0.0.1:4000/ws?t=abc',
    onMessage: (message) => messages.push(message),
    onStatus: (status) => statuses.push(status),
    createSocket: (url) => {
      const socket = new FakeSocket(url);

      sockets.push(socket);

      return socket;
    },
    setTimer: (callback, ms) => {
      const timer = { callback, ms, cleared: false };

      timers.push(timer);

      return timer;
    },
    clearTimer: (handle) => {
      (handle as { cleared: boolean }).cleared = true;
    },
    initialDelayMs: 100,
    maxDelayMs: 1000,
  });

  const fire = () => timers.at(-1)?.callback();

  return { client, sockets, statuses, messages, timers, fire };
};

const log: ConsoleHostMessage = { v: 1, type: 'log', seq: 0, gen: 1, stream: 'stdout', line: 'ready', at: 1 };

describe('readToken / consoleWsUrl', () => {
  test('reads the token from the page query', () => {
    expect(readToken('?t=s3cr%2Bt&x=1')).toBe('s3cr+t');
    expect(readToken('?x=1')).toBeNull();
    expect(readToken('?t=')).toBeNull();
  });

  test('points the socket at /ws on the page host with the token encoded', () => {
    expect(consoleWsUrl({ protocol: 'http:', host: '127.0.0.1:4000' }, 'a+b&c')).toBe(
      'ws://127.0.0.1:4000/ws?t=a%2Bb%26c',
    );
    expect(consoleWsUrl({ protocol: 'https:', host: 'localhost' }, 't')).toBe('wss://localhost/ws?t=t');
  });
});

describe('createConsoleClient', () => {
  test('reports connecting, then open, and passes on valid host messages only', () => {
    const { sockets, statuses, messages } = setup();
    const socket = sockets[0]!;
    const warn = console.warn;
    const warnings: unknown[] = [];

    console.warn = (...args: unknown[]) => warnings.push(args);

    try {
      socket.open();
      socket.receive(JSON.stringify(log));
      socket.receive('not json');
      socket.receive(JSON.stringify({ ...log, v: 2 }));
      socket.receive(new Uint8Array([1]));
    } finally {
      console.warn = warn;
    }

    expect(socket.url).toBe('ws://127.0.0.1:4000/ws?t=abc');
    expect(statuses).toEqual(['connecting', 'open']);
    expect(messages).toEqual([log]);
    expect(warnings).toHaveLength(3);
  });

  test('reconnects with a doubling delay capped at the maximum', () => {
    const { sockets, statuses, timers, fire } = setup();

    for (let i = 0; i < 5; i++) {
      sockets.at(-1)!.drop();
      fire();
    }

    expect(timers.map((timer) => timer.ms)).toEqual([100, 200, 400, 800, 1000]);
    expect(sockets).toHaveLength(6);
    expect(statuses.slice(0, 3)).toEqual(['connecting', 'closed', 'connecting']);
  });

  test('a successful open resets the backoff', () => {
    const { sockets, timers, fire } = setup();

    sockets.at(-1)!.drop();
    fire();
    sockets.at(-1)!.drop();
    fire();
    sockets.at(-1)!.open();
    sockets.at(-1)!.drop();

    expect(timers.map((timer) => timer.ms)).toEqual([100, 200, 100]);
  });

  test('send() writes a browser message to the open socket and refuses while there is none', () => {
    const { client, sockets, fire } = setup();

    expect(client.send({ v: 1, type: 'restart' })).toBe(false);

    sockets[0]!.open();

    expect(client.send({ v: 1, type: 'restart' })).toBe(true);
    expect(sockets[0]!.sent).toEqual(['{"v":1,"type":"restart"}']);

    sockets[0]!.drop();

    expect(client.send({ v: 1, type: 'restart' })).toBe(false);

    fire();
    sockets[1]!.open();

    expect(client.send({ v: 1, type: 'restart' })).toBe(true);
    expect(sockets[1]!.sent).toHaveLength(1);
  });

  test('close() stops the pending retry and closes the socket without reconnecting', () => {
    const { client, sockets, statuses, timers } = setup();

    sockets[0]!.drop();
    client.close();

    expect(timers[0]?.cleared).toBe(true);

    const open = setup();

    open.client.close();
    open.sockets[0]!.drop();

    expect(open.sockets[0]?.closeCalls).toBe(1);
    expect(open.timers).toEqual([]);
    expect(open.statuses).toEqual(['connecting']);
    expect(statuses).toEqual(['connecting', 'closed']);
  });
});

describe('reconnectDelay', () => {
  test('doubles from the initial delay and stops at the maximum', () => {
    expect([0, 1, 2, 3, 10].map((attempt) => reconnectDelay(attempt, 500, 10_000))).toEqual([
      500, 1000, 2000, 4000, 10_000,
    ]);
  });
});
