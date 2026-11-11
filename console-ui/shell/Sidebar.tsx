import type { DevtoolsHello, DevtoolsSnapshot } from '../../lib/console/protocol';
import { Icon } from '../ui/icons';
import { Logo } from '../ui/Logo';
import type { ServerOption } from './status';
import { VIEWS, type ViewId, viewHash } from './views';

const GROUPS = ['Inspect', 'Debug'] as const;

export const viewCount = (view: ViewId, snapshot: DevtoolsSnapshot | null): number | null => {
  if (!snapshot) return null;
  if (view === 'graph') return snapshot.components.length;
  if (view === 'endpoints') return snapshot.routes.length + snapshot.websockets.length;

  return null;
};

const AppCard = ({ hello }: { hello: DevtoolsHello | null }) => (
  <dl className="app-card" aria-label="Running app">
    {hello ? (
      <>
        <div className="row">
          <dt>Adapter</dt>
          <dd>{hello.adapter ?? 'headless'}</dd>
        </div>
        <div className="row">
          <dt>Listening</dt>
          <dd className="mono">{hello.port === null ? 'no HTTP' : `:${hello.port}`}</dd>
        </div>
        <div className="row">
          <dt>Core</dt>
          <dd className="mono">{hello.coreVersion}</dd>
        </div>
        {hello.transports && hello.transports.length > 0 ? (
          <div className="row">
            <dt>Transports</dt>
            <dd>{hello.transports.map((transport) => transport.name).join(', ')}</dd>
          </div>
        ) : null}
      </>
    ) : (
      <div className="row">
        <dt>App</dt>
        <dd>waiting to report</dd>
      </div>
    )}
  </dl>
);

/** Shown only when the app has several servers: the one the snapshot views and the app card describe. */
const ServerPicker = ({
  servers,
  selected,
  onSelect,
}: {
  servers: ServerOption[];
  selected: string | null;
  onSelect: (serverId: string) => void;
}) => (
  <label className="server-pick">
    <span>Server</span>
    <select className="select" value={selected ?? ''} onChange={(event) => onSelect(event.target.value)}>
      {servers.map((server) => (
        <option key={server.serverId} value={server.serverId}>
          {server.label}
        </option>
      ))}
    </select>
  </label>
);

export const Sidebar = ({
  view,
  snapshot,
  hello,
  servers = [],
  selectedServer = null,
  onSelectServer,
  onNavigate,
}: {
  view: ViewId;
  snapshot: DevtoolsSnapshot | null;
  hello: DevtoolsHello | null;
  servers?: ServerOption[];
  /** The id of the server on screen. */
  selectedServer?: string | null;
  onSelectServer?: (serverId: string) => void;
  onNavigate: (view: ViewId) => void;
}) => (
  <aside className="side" aria-label="Console navigation">
    <div className="brand">
      <Logo />
      <div className="brand-name">
        Asena <span>Console</span>
      </div>
    </div>
    {GROUPS.map((group) => (
      <nav key={group} className="nav" aria-label={group}>
        <div className="nav-label" aria-hidden="true">
          {group}
        </div>
        {VIEWS.filter((entry) => entry.group === group).map((entry) => {
          const count = viewCount(entry.id, snapshot);

          return (
            <a
              key={entry.id}
              href={viewHash(entry.id)}
              aria-current={entry.id === view ? 'page' : undefined}
              onClick={() => onNavigate(entry.id)}
            >
              <Icon name={entry.icon} className="nav-icon" />
              {entry.label}
              {count === null ? null : <span className="count">{count}</span>}
            </a>
          );
        })}
      </nav>
    ))}
    {servers.length > 1 && onSelectServer ? (
      <ServerPicker servers={servers} selected={selectedServer} onSelect={onSelectServer} />
    ) : null}
    <AppCard hello={hello} />
  </aside>
);
