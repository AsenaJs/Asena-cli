import type { ConsoleChildStatus } from '../../lib/console/hostProtocol';
import { type ConsoleServer, type ConsoleState, isServerLive, serverView } from '../state/store';
import type { Tone } from '../ui/components';

/** How the console names a server among several: adapter and port, or its id when it serves no HTTP. */
export const serverLabel = ({ serverId, hello }: Pick<ConsoleServer, 'serverId' | 'hello'>): string =>
  hello.port === null ? `Headless ${serverId}` : `${hello.adapter ?? 'HTTP'} :${hello.port}`;

export interface ServerOption {
  serverId: string;
  label: string;
}

/** Every server the console knows, saying which stopped and which only the previous run reported. */
export const serverOptions = (state: ConsoleState): ServerOption[] =>
  state.servers.map((server) => {
    const note = !isServerLive(state, server) ? ' (previous run)' : server.stopped ? ' (stopped)' : '';

    return { serverId: server.serverId, label: `${serverLabel(server)}${note}` };
  });

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
      return child.unattached ? `Running, its devtools agent has not reported yet${pid}` : `Starting${pid}`;
    case 'running':
      return `Running${pid}`;
    case 'restarting':
      return `Restarting${pid}`;
    case 'exited':
      if (child.endedBy === 'restart') return 'Stopped for a restart';
      if (child.endedBy === 'stop') return 'Stopped by the console';
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
      return { tone: 'warn', label: child.unattached ? 'No report yet' : 'Starting', detail: childLabel(child) };
    case 'restarting':
      return { tone: 'warn', label: 'Restarting', detail: childLabel(child) };
    case 'exited':
      if (child.endedBy === 'restart') return { tone: 'warn', label: 'Restarting', detail: childLabel(child) };

      return child.code === 0 || child.endedBy === 'stop'
        ? { tone: 'neutral', label: 'Stopped', detail: childLabel(child) }
        : { tone: 'bad', label: 'Crashed', detail: childLabel(child) };
    case 'running':
      break;
  }

  const view = serverView(state);

  if (view.stopped) {
    return { tone: 'neutral', label: 'Server stopped', detail: 'This server has stopped; the app process still runs' };
  }

  const readiness = view.state?.readiness;

  if (readiness && 'state' in readiness) {
    return { tone: 'warn', label: 'Not ready', detail: `Lifecycle ${readiness.state}` };
  }

  if (readiness?.status === 'degraded') {
    return { tone: 'warn', label: 'Degraded', detail: 'Serving traffic, a transport is disconnected' };
  }

  return { tone: 'ok', label: 'Ready', detail: 'Serving traffic' };
};
