import type { Subprocess } from 'bun';
import type { ConsoleChildStatus, ConsoleLogLine, ConsoleLogStream } from './hostProtocol';
import { pipeLines } from './lines';
import { type DevtoolsAgentMessage, type DevtoolsHostMessage, isDevtoolsAgentMessage } from './protocol';

export interface AppSupervisorOptions {
  /** The project root; the app must run from it to find its tsconfig, `.env` and config. */
  cwd: string;
  /** Called before every spawn; returns the command line. A throw counts as a failed start. */
  prepare: () => string[] | Promise<string[]>;
  env?: Record<string, string | undefined>;
  /** Copies the child's output to this process's stdout/stderr as it arrives. */
  echo?: boolean;
  /** How long a stopping child gets after SIGTERM before SIGKILL. */
  killAfterMs?: number;
  onStatus: (status: ConsoleChildStatus) => void;
  /** The host numbers the lines. */
  onLog: (line: Omit<ConsoleLogLine, 'seq'>) => void;
  onAgentMessage: (message: DevtoolsAgentMessage, gen: number) => void;
  onInvalidMessage?: (message: unknown, gen: number) => void;
}

type AppProcess = Subprocess<'ignore', 'pipe', 'pipe'>;

interface Child {
  gen: number;
  process: AppProcess;
  exited: Promise<void>;
}

const DEFAULT_KILL_AFTER_MS = 3000;

// A grandchild can inherit the pipes and hold them open after the child is gone.
const PIPE_DRAIN_MS = 250;

const hasExited = (child: AppProcess): boolean => child.exitCode !== null || child.signalCode !== null;

const exitFields = (child: AppProcess): Pick<ConsoleChildStatus, 'code' | 'signal'> => {
  if (child.signalCode !== null) return { signal: String(child.signalCode) };

  return child.exitCode !== null ? { code: child.exitCode } : {};
};

const errorText = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** Runs the app as an IPC child, one generation at a time, and restarts it on request. */
export class AppSupervisor {
  private gen = 0;

  private current?: Child;

  private restarting?: Promise<void>;

  private restartAgain = false;

  private stopped = false;

  public constructor(private readonly options: AppSupervisorOptions) {}

  public get generation(): number {
    return this.gen;
  }

  public get pid(): number | undefined {
    const child = this.current;

    return child && !hasExited(child.process) ? child.process.pid : undefined;
  }

  public start(): Promise<void> {
    return this.spawn();
  }

  /** @returns Whether the message reached a live child. */
  public send(message: DevtoolsHostMessage): boolean {
    const child = this.current;

    if (!child || hasExited(child.process)) return false;

    try {
      child.process.send(message);

      return true;
    } catch {
      return false;
    }
  }

  /** Stops the current child and spawns the next generation. Calls during a restart fold into one more restart. */
  public restart(): Promise<void> {
    if (this.stopped) return Promise.resolve();

    if (this.restarting) {
      this.restartAgain = true;

      return this.restarting;
    }

    this.restarting = this.runRestarts().finally(() => {
      this.restarting = undefined;
    });

    return this.restarting;
  }

  public async stop(): Promise<void> {
    this.stopped = true;

    await this.restarting;
    await this.stopCurrent(false);
  }

  private async runRestarts(): Promise<void> {
    do {
      this.restartAgain = false;

      await this.stopCurrent(true);

      if (this.stopped) return;

      await this.spawn();
    } while (this.restartAgain && !this.stopped);
  }

  private async spawn(): Promise<void> {
    const gen = ++this.gen;
    let child: AppProcess;

    try {
      const cmd = await this.options.prepare();

      child = Bun.spawn(cmd, {
        cwd: this.options.cwd,
        env: this.options.env ?? process.env,
        stdin: 'ignore',
        stdout: 'pipe',
        stderr: 'pipe',
        ipc: (message) => this.receive(message, gen),
      });
    } catch (error) {
      this.failToStart(gen, error);

      return;
    }

    this.options.onStatus({ gen, state: 'starting', pid: child.pid });

    const pipes = Promise.all([this.pipe(child.stdout, 'stdout', gen), this.pipe(child.stderr, 'stderr', gen)]);

    const exited = child.exited.then(async () => {
      await Promise.race([pipes, Bun.sleep(PIPE_DRAIN_MS)]);

      this.options.onStatus({ gen, state: 'exited', pid: child.pid, ...exitFields(child) });
    });

    this.current = { gen, process: child, exited };
  }

  private receive(message: unknown, gen: number): void {
    if (this.current?.gen !== gen) return;

    if (isDevtoolsAgentMessage(message)) {
      this.options.onAgentMessage(message, gen);
    } else {
      this.options.onInvalidMessage?.(message, gen);
    }
  }

  private async pipe(stream: ReadableStream<Uint8Array>, name: ConsoleLogStream, gen: number): Promise<void> {
    const terminal = name === 'stdout' ? process.stdout : process.stderr;

    try {
      await pipeLines(
        stream,
        (line) => this.options.onLog({ gen, stream: name, line, at: Date.now() }),
        this.options.echo ? (chunk) => terminal.write(chunk) : undefined,
      );
    } catch {
      // A pipe torn down with the child has nothing more to deliver.
    }
  }

  private failToStart(gen: number, error: unknown): void {
    const at = Date.now();

    for (const line of `[asena console] The app could not be started: ${errorText(error)}`.split('\n')) {
      if (this.options.echo) process.stderr.write(`${line}\n`);

      this.options.onLog({ gen, stream: 'stderr', line, at });
    }

    this.options.onStatus({ gen, state: 'exited' });
  }

  private async stopCurrent(restarting: boolean): Promise<void> {
    const child = this.current;

    if (!child) return;

    if (hasExited(child.process)) {
      await child.exited;

      return;
    }

    if (restarting) {
      this.options.onStatus({ gen: child.gen, state: 'restarting', pid: child.process.pid });
    }

    child.process.kill('SIGTERM');

    const killTimer = setTimeout(() => {
      if (!hasExited(child.process)) child.process.kill('SIGKILL');
    }, this.options.killAfterMs ?? DEFAULT_KILL_AFTER_MS);

    try {
      await child.exited;
    } finally {
      clearTimeout(killTimer);
    }
  }
}
