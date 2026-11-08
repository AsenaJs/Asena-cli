import { afterEach, describe, expect, it } from 'bun:test';
import { AppSupervisor } from '../../lib/console/AppSupervisor';
import type { ConsoleChildStatus } from '../../lib/console/hostProtocol';
import { waitUntil } from './helpers';

const IGNORES_SIGTERM = "process.on('SIGTERM', () => {}); console.log('up'); setInterval(() => {}, 1000);";
const DIES_ON_SIGTERM = "console.log('up'); setInterval(() => {}, 1000);";
const EXITS_1_ON_SIGTERM =
  "process.on('SIGTERM', () => process.exit(1)); console.log('up'); setInterval(() => {}, 1000);";

describe('AppSupervisor exit statuses', () => {
  let supervisor: AppSupervisor | undefined;
  let statuses: ConsoleChildStatus[] = [];
  let up = 0;

  const start = async (script: string) => {
    statuses = [];
    up = 0;
    supervisor = new AppSupervisor({
      cwd: import.meta.dir,
      prepare: () => [process.execPath, '-e', script],
      killAfterMs: 200,
      onStatus: (status) => statuses.push(status),
      onLog: (line) => {
        if (line.line === 'up') up++;
      },
      onAgentMessage: () => {},
    });

    await supervisor.start();
    await waitUntil(() => up === 1, 5000, 'the child to start');
  };

  const exitOf = async (gen: number): Promise<ConsoleChildStatus> => {
    await waitUntil(() => statuses.some((status) => status.gen === gen && status.state === 'exited'), 5000, 'exit');

    return statuses.find((status) => status.gen === gen && status.state === 'exited')!;
  };

  afterEach(async () => {
    await supervisor?.stop();
    supervisor = undefined;
  });

  it('says a SIGKILL it sent for a restart was its own', async () => {
    await start(IGNORES_SIGTERM);
    await supervisor!.restart();

    expect(await exitOf(1)).toMatchObject({ signal: 'SIGKILL', endedBy: 'restart' });
  });

  it('says a SIGTERM it sent for a stop was its own', async () => {
    await start(DIES_ON_SIGTERM);
    await supervisor!.stop();

    expect(await exitOf(1)).toMatchObject({ signal: 'SIGTERM', endedBy: 'stop' });
  });

  it('leaves a child killed by something else as it died', async () => {
    await start(IGNORES_SIGTERM);

    process.kill(supervisor!.pid!, 'SIGKILL');

    const exited = await exitOf(1);

    expect(exited).toMatchObject({ signal: 'SIGKILL' });
    expect(exited.endedBy).toBeUndefined();
  });

  it('leaves a child that exits with a code of its own on the host signal as it ended', async () => {
    await start(EXITS_1_ON_SIGTERM);
    await supervisor!.restart();

    const exited = await exitOf(1);

    expect(exited).toMatchObject({ code: 1 });
    expect(exited.endedBy).toBeUndefined();
  });
});
