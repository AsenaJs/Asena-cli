import type { ConsoleChildStatus } from '../../lib/console/hostProtocol';
import type { ConsoleState } from '../state/store';
import type { Tone } from '../ui/components';

export interface StatusView {
  tone: Tone;
  label: string;
  /** A longer sentence for screen readers and the health card. */
  detail: string;
}

export const childLabel = (child: ConsoleChildStatus | null): string => {
  if (!child) return 'No app process yet';

  const pid = child.pid === undefined ? '' : `, pid ${child.pid}`;

  switch (child.state) {
    case 'starting':
      return `Starting${pid}`;
    case 'running':
      return `Running${pid}`;
    case 'restarting':
      return `Restarting${pid}`;
    case 'exited':
      if (child.code !== undefined) return `Exited with code ${child.code}`;
      if (child.signal !== undefined) return `Killed by ${child.signal}`;

      return 'Exited';
  }
};

/** What the status bar's first pill says: the connection first, then the child, then its readiness. */
export const appStatus = (state: ConsoleState, token: string | null): StatusView => {
  if (!token) {
    return {
      tone: 'bad',
      label: 'No session',
      detail: 'No session token in the page URL. Open the link `asena console` printed.',
    };
  }

  if (state.connection === 'closed') {
    return { tone: 'bad', label: 'Disconnected', detail: 'Lost the console host, reconnecting…' };
  }

  return runStatus(state);
};

/** The app process and its readiness, whatever the browser's connection. */
export const runStatus = (state: ConsoleState): StatusView => {
  const { child } = state;

  if (!child) return { tone: 'neutral', label: 'Connecting', detail: 'Connecting to the console host…' };

  switch (child.state) {
    case 'starting':
      return { tone: 'warn', label: 'Starting', detail: childLabel(child) };
    case 'restarting':
      return { tone: 'warn', label: 'Restarting', detail: childLabel(child) };
    case 'exited':
      return child.code === 0
        ? { tone: 'neutral', label: 'Stopped', detail: childLabel(child) }
        : { tone: 'bad', label: 'Crashed', detail: childLabel(child) };
    case 'running':
      break;
  }

  const readiness = state.metrics.at(-1)?.readiness;

  if (readiness && 'state' in readiness) {
    return { tone: 'warn', label: 'Not ready', detail: `Lifecycle ${readiness.state}` };
  }

  if (readiness?.status === 'degraded') {
    return { tone: 'warn', label: 'Degraded', detail: 'Serving traffic, a transport is disconnected' };
  }

  return { tone: 'ok', label: 'Ready', detail: 'Serving traffic' };
};
