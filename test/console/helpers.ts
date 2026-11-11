import type { ConsoleHostMessage } from '../../lib/console/hostProtocol';
import type { DevtoolsMetrics, DevtoolsServerState } from '../../lib/console/protocol';

/** The sample with one server's part changed, at the top level too, as the agent of a one-server app sends it. */
export const sampleWith = (
  sample: DevtoolsMetrics,
  state: Partial<DevtoolsServerState>,
  serverId = 'server-1',
): DevtoolsMetrics => {
  const current: DevtoolsServerState = sample.servers[serverId] ?? { readiness: sample.readiness };

  return { ...sample, ...state, servers: { ...sample.servers, [serverId]: { ...current, ...state } } };
};

// Below the kernel's ephemeral floor, so a server port never collides with the suite's own outbound sockets.
export const randomPort = (): number => 10000 + Math.floor(Math.random() * 22000);

export const waitUntil = async (check: () => boolean, timeoutMs = 5000, what = 'condition'): Promise<void> => {
  const deadline = Date.now() + timeoutMs;

  while (!check()) {
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${what}`);

    await Bun.sleep(10);
  }
};

/** A browser stand-in: records every host message it receives. */
export class ConsoleClient {
  public readonly messages: ConsoleHostMessage[] = [];

  private constructor(private readonly socket: WebSocket) {
    socket.addEventListener('message', (event) => {
      this.messages.push(JSON.parse(String(event.data)) as ConsoleHostMessage);
    });
  }

  public static async connect(url: string): Promise<ConsoleClient> {
    const socket = new WebSocket(url);
    const client = new ConsoleClient(socket);

    await new Promise<void>((resolve, reject) => {
      socket.addEventListener('open', () => resolve(), { once: true });
      socket.addEventListener('error', () => reject(new Error(`Could not connect to ${url}`)), { once: true });
    });

    return client;
  }

  /** The `snapshotState` the host sends on connect. */
  public async replay(): Promise<Extract<ConsoleHostMessage, { type: 'snapshotState' }>> {
    await waitUntil(() => this.messages.length > 0, 5000, 'the replay');

    const first = this.messages[0];

    if (first?.type !== 'snapshotState') throw new Error(`Expected snapshotState first, got ${first?.type}`);

    return first;
  }

  public send(message: unknown): void {
    this.socket.send(JSON.stringify(message));
  }

  public async waitFor(
    predicate: (message: ConsoleHostMessage) => boolean,
    timeoutMs = 5000,
  ): Promise<ConsoleHostMessage> {
    let found: ConsoleHostMessage | undefined;

    await waitUntil(() => (found = this.messages.find(predicate)) !== undefined, timeoutMs, 'a host message');

    return found as ConsoleHostMessage;
  }

  public indexOf(predicate: (message: ConsoleHostMessage) => boolean): number {
    return this.messages.findIndex(predicate);
  }

  public close(): void {
    this.socket.close();
  }
}
