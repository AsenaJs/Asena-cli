import type {
  DevtoolsCommand,
  DevtoolsCommandResult,
  DevtoolsHello,
  DevtoolsMessageHandler,
  DevtoolsMetrics,
  DevtoolsRequestRecord,
  DevtoolsTransport,
} from '../../lib/console/protocol';
import { wallClockOf } from './cron';

let sequence = 0;

/** Unique within the page; the host and the agent only echo it back. */
export const nextCommandId = (now = Date.now()): string => `ui-${now.toString(36)}-${(sequence += 1)}`;

export type Payload = { ok: true; data?: unknown } | { ok: false; error: string };

export const scheduleCommand = (name: string): DevtoolsCommand => ({ command: 'runSchedule', name });

/** `data` left out when the editor was empty. */
export const eventCommand = (event: string, data: unknown): DevtoolsCommand => ({
  command: 'emitEvent',
  event,
  ...(data === undefined ? {} : { data }),
});

export const messageCommand = (
  handler: Pick<DevtoolsMessageHandler, 'transport' | 'pattern' | 'kind'>,
  data: unknown,
): DevtoolsCommand => ({
  command: 'sendMessage',
  transport: handler.transport,
  pattern: handler.pattern,
  kind: handler.kind,
  ...(data === undefined ? {} : { data }),
});

/** Why a command cannot go out now, or `null` when it can. */
export const commandBlockedReason = ({
  canSend,
  token,
  connected,
  hello,
}: {
  canSend: boolean;
  token: string | null;
  connected: boolean;
  hello: DevtoolsHello | null;
}): string | null => {
  if (!token) return 'No session token in the page URL, so nothing can be sent.';
  if (!canSend || !connected) return 'Not connected to the console host; actions are off until it reconnects.';
  if (!hello) return 'The app has not started yet; actions are off until it reports.';

  return null;
};

/** An empty editor sends no payload at all, which is not the same as `null`. */
export const parsePayload = (text: string): Payload => {
  if (text.trim() === '') return { ok: true };

  try {
    return { ok: true, data: JSON.parse(text) as unknown };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
};

/** The newest record core framed for this dispatch, e.g. `@Schedule` and the job name. */
export const lastDispatch = (
  records: DevtoolsRequestRecord[],
  method: string,
  path: string,
): DevtoolsRequestRecord | null =>
  records.findLast((record) => record.method === method && record.path === path) ?? null;

/** The latest connection state per transport: the newest metrics sample, else the hello. */
export const transportStates = (hello: DevtoolsHello | null, metrics: DevtoolsMetrics[]): DevtoolsTransport[] =>
  metrics.at(-1)?.transports ?? hello?.transports ?? [];

export const groupBy = <T>(items: T[], key: (item: T) => string): [string, T[]][] => {
  const groups = new Map<string, T[]>();

  for (const item of items) groups.set(key(item), [...(groups.get(key(item)) ?? []), item]);

  return [...groups];
};

/** `audit.*` names no event an emit can reach; the editor asks for a concrete name. */
export const isPattern = (event: string): boolean => /[*?]/.test(event);

/** The result as JSON text for the viewer, or `null` when the command returned nothing. */
export const resultText = (result: DevtoolsCommandResult): string | null => {
  if (!result.ok) return null;

  return result.result === undefined ? null : JSON.stringify(result.result);
};

export const browserTimeZone = (): string => Intl.DateTimeFormat().resolvedOptions().timeZone;

/** Reads `at` on the clocks of `timeZone`, the app's, naming the zone when the browser's is another. */
export const formatNextRun = (at: Date, now: Date, timeZone: string, localZone: string = browserTimeZone()): string => {
  const minutes = Math.round((at.getTime() - now.getTime()) / 60000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const rest = minutes % 60;
  const relative =
    days > 0 ? `${days}d ${hours}h` : hours > 0 ? `${hours}h ${rest}m` : minutes > 0 ? `${minutes}m` : 'under a minute';
  const wall = new Date(wallClockOf(at.getTime(), timeZone));
  const nowWall = new Date(wallClockOf(now.getTime(), timeZone));
  const clock = `${String(wall.getUTCHours()).padStart(2, '0')}:${String(wall.getUTCMinutes()).padStart(2, '0')}`;
  const sameDay = wall.toISOString().slice(0, 10) === nowWall.toISOString().slice(0, 10);
  const day = sameDay
    ? 'today'
    : wall.toLocaleDateString('en-GB', {
        timeZone: 'UTC',
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        ...(wall.getUTCFullYear() === nowWall.getUTCFullYear() ? {} : { year: 'numeric' }),
      });
  const zone = timeZone === localZone ? '' : ` ${timeZone}`;

  return `${day} ${clock}${zone} · in ${relative}`;
};
