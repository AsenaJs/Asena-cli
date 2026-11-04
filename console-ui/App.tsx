import { type ReactNode, useEffect, useState } from 'react';
import type { DevtoolsSnapshot } from '../lib/console/protocol';
import { EndpointsPanel } from './endpoints/EndpointsPanel';
import { GraphPanel } from './graph/GraphPanel';
import { RuntimePanel } from './runtime/RuntimePanel';
import { Placeholder, StaleNotice, WaitingForSnapshot } from './shell/Placeholder';
import { StatusBar } from './shell/StatusBar';
import { type ThemeChoice, useTheme } from './shell/theme';
import { VIEWS, type ViewId, viewFromHash, viewHash } from './shell/views';
import { type ConsoleState, isSnapshotStale } from './state/store';
import { useConsole } from './state/useConsole';

export interface ShellProps {
  state: ConsoleState;
  token: string | null;
  initialView?: ViewId;
}

const currentHash = () => (typeof location === 'undefined' ? '' : location.hash);

interface PanelProps {
  view: ViewId;
  state: ConsoleState;
  token: string | null;
  theme: ThemeChoice;
  focusedRoute: string | null;
  onOpenRoute: (key: string) => void;
}

const Panel = ({ view, state, token, theme, focusedRoute, onOpenRoute }: PanelProps) => {
  const title = VIEWS.find((entry) => entry.id === view)?.label ?? view;
  const withSnapshot = (render: (snapshot: DevtoolsSnapshot) => ReactNode) =>
    state.snapshot ? (
      <>
        {isSnapshotStale(state) ? <StaleNotice gen={state.snapshotGen} /> : null}
        {render(state.snapshot)}
      </>
    ) : (
      <WaitingForSnapshot title={title} />
    );

  switch (view) {
    case 'graph':
      return withSnapshot((snapshot) => <GraphPanel snapshot={snapshot} theme={theme} onOpenRoute={onOpenRoute} />);
    case 'runtime':
      return <RuntimePanel state={state} />;
    case 'endpoints':
      return withSnapshot((snapshot) => (
        <EndpointsPanel snapshot={snapshot} hello={state.hello} token={token} focusedRoute={focusedRoute} />
      ));
    default:
      return <Placeholder title={title} />;
  }
};

export const Shell = ({ state, token, initialView }: ShellProps) => {
  const [view, setView] = useState<ViewId>(() => initialView ?? viewFromHash(currentHash()));
  const [theme, setTheme] = useTheme();
  const [focusedRoute, setFocusedRoute] = useState<string | null>(null);

  useEffect(() => {
    const onHashChange = () => setView((current) => viewFromHash(location.hash, current));

    window.addEventListener('hashchange', onHashChange);

    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const openRoute = (key: string) => {
    setFocusedRoute(key);
    setView('endpoints');
    location.hash = viewHash('endpoints');
  };

  return (
    <div className="shell">
      <a className="skip-link" href="#main">
        Skip to panel
      </a>
      <header className="shell-header">
        <h1 className="shell-title">Asena Console</h1>
        <nav className="shell-nav" aria-label="Panels">
          {VIEWS.map((entry) => (
            <a
              key={entry.id}
              href={viewHash(entry.id)}
              className="shell-nav-link"
              aria-current={entry.id === view ? 'page' : undefined}
              onClick={() => setView(entry.id)}
            >
              {entry.label}
            </a>
          ))}
        </nav>
        <label className="theme-switch">
          <span className="visually-hidden">Theme</span>
          <select value={theme} onChange={(event) => setTheme(event.target.value as ThemeChoice)}>
            <option value="system">System theme</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>
      </header>
      <main id="main" className="shell-main" tabIndex={-1}>
        <Panel
          view={view}
          state={state}
          token={token}
          theme={theme}
          focusedRoute={focusedRoute}
          onOpenRoute={openRoute}
        />
      </main>
      <StatusBar state={state} token={token} />
    </div>
  );
};

export const App = () => {
  const { state, token } = useConsole();

  return <Shell state={state} token={token} />;
};
