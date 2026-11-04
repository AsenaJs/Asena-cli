import type { ConsoleChildStatus } from '../../lib/console/hostProtocol';
import type { DevtoolsHello } from '../../lib/console/protocol';
import type { ConnectionStatus, ConsoleState } from '../state/store';

export const connectionLabel = (connection: ConnectionStatus, token: string | null): string => {
  if (!token) return 'No session token in the page URL. Open the link `asena console` printed.';

  switch (connection) {
    case 'open':
      return 'Connected';
    case 'connecting':
      return 'Connecting…';
    case 'closed':
      return 'Disconnected, reconnecting…';
  }
};

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

export const appLabel = (hello: DevtoolsHello | null): string | null => {
  if (!hello) return null;

  const server = hello.adapter === null || hello.port === null ? 'headless' : `${hello.adapter} on :${hello.port}`;

  return `${server} · core ${hello.coreVersion}`;
};

const childTone = (child: ConsoleChildStatus | null): string => {
  if (!child) return 'idle';
  if (child.state === 'exited') return child.code === 0 ? 'idle' : 'error';
  if (child.state === 'running') return 'ok';

  return 'warn';
};

export const StatusBar = ({ state, token }: { state: ConsoleState; token: string | null }) => {
  const connectionTone =
    !token || state.connection === 'closed' ? 'error' : state.connection === 'open' ? 'ok' : 'warn';
  const app = appLabel(state.hello);

  return (
    <footer className="status-bar" role="status" aria-live="polite">
      <span className="status-item" data-tone={connectionTone}>
        <span className="status-dot" aria-hidden="true" />
        {connectionLabel(state.connection, token)}
      </span>
      <span className="status-item" data-tone={childTone(state.child)}>
        <span className="status-dot" aria-hidden="true" />
        {state.child ? `Generation ${state.child.gen}: ` : ''}
        {childLabel(state.child)}
      </span>
      {app ? <span className="status-item">{app}</span> : null}
    </footer>
  );
};
