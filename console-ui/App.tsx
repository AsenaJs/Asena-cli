import { type ReactNode, useEffect, useState } from 'react';
import type { ConsoleBrowserMessage } from '../lib/console/hostProtocol';
import type { DevtoolsSnapshot } from '../lib/console/protocol';
import { ConfigPanel } from './config/ConfigPanel';
import { draftsForOpen, EndpointsPanel } from './endpoints/EndpointsPanel';
import type { SavedDraft, SavedDrafts } from './endpoints/requestBuilder';
import { ExceptionsPanel } from './exceptions/ExceptionsPanel';
import type { GraphViewChoice } from './graph/focus';
import { GraphPanel } from './graph/GraphPanel';
import { browserTimeZone, commandBlockedReason, commandSender } from './messaging/commands';
import { MessagingPanel } from './messaging/MessagingPanel';
import type { EndpointFocus } from './requests/records';
import { RequestsPanel } from './requests/RequestsPanel';
import { RuntimePanel } from './runtime/RuntimePanel';
import { StaleNotice, StoppedNotice, WaitingForSnapshot } from './shell/Placeholder';
import { Sidebar } from './shell/Sidebar';
import { appStatus, serverOptions } from './shell/status';
import { type ThemeChoice, useTheme } from './shell/theme';
import { TopBar } from './shell/TopBar';
import { type ViewId, viewFromHash, viewHash } from './shell/views';
import { type ConsoleState, serverView } from './state/store';
import { useConsole } from './state/useConsole';

export interface ShellProps {
  state: ConsoleState;
  token: string | null;
  initialView?: ViewId;
  send?: (message: ConsoleBrowserMessage) => boolean;
  /** Picks the server the snapshot views show, when the app has several. */
  onSelectServer?: (serverId: string) => void;
}

const currentHash = () => (typeof location === 'undefined' ? '' : location.hash);

interface PanelProps {
  view: ViewId;
  state: ConsoleState;
  token: string | null;
  theme: ThemeChoice;
  focus: EndpointFocus | null;
  onOpenEndpoint: (focus: EndpointFocus) => void;
  drafts: SavedDrafts;
  onDraft: (key: string, saved: SavedDraft) => void;
  graphView: GraphViewChoice | null;
  onGraphView: (choice: GraphViewChoice | null) => void;
  send: ShellProps['send'];
}

const Panel = ({
  view,
  state,
  token,
  theme,
  focus,
  onOpenEndpoint,
  drafts,
  onDraft,
  graphView,
  onGraphView,
  send,
}: PanelProps) => {
  const { server, hello, snapshot: viewed, stale, stopped } = serverView(state);
  const servers = serverOptions(state);
  const several = servers.length > 1;
  // With one server every record is its own, whichever run it came from.
  const requests = several ? state.requests.filter((record) => record.serverId === server?.serverId) : state.requests;
  const blockedReason = commandBlockedReason({
    canSend: send !== undefined,
    token,
    connected: state.connection === 'open',
    hello,
    stopped,
  });
  const sendCommand = commandSender(send, hello, blockedReason);

  const withSnapshot = (render: (snapshot: DevtoolsSnapshot) => ReactNode) =>
    viewed ? (
      <>
        {stale ? <StaleNotice gen={server?.snapshotGen ?? null} /> : null}
        {stopped ? <StoppedNotice /> : null}
        {render(viewed)}
      </>
    ) : (
      <WaitingForSnapshot view={view} />
    );

  switch (view) {
    case 'graph':
      return withSnapshot((snapshot) => (
        <GraphPanel
          snapshot={snapshot}
          theme={theme}
          viewChoice={graphView}
          onViewChoice={onGraphView}
          onOpenRoute={(key) => onOpenEndpoint({ key })}
        />
      ));
    case 'runtime':
      return <RuntimePanel state={state} />;
    case 'endpoints':
      return withSnapshot((snapshot) => (
        <EndpointsPanel
          snapshot={snapshot}
          hello={hello}
          stopped={stopped}
          gen={state.child?.gen ?? null}
          token={token}
          focus={focus}
          drafts={drafts}
          onDraft={onDraft}
          requests={requests}
        />
      ));
    case 'requests':
      return (
        <RequestsPanel
          requests={state.requests}
          runs={state.runs}
          routes={viewed?.routes ?? []}
          servers={servers}
          viewedServer={server?.serverId ?? null}
          onReplay={onOpenEndpoint}
        />
      );
    case 'messaging':
      return withSnapshot((snapshot) => (
        <MessagingPanel
          snapshot={snapshot}
          hello={hello}
          metrics={state.metrics}
          requests={requests}
          commandResults={state.commandResults}
          send={sendCommand}
          blockedReason={blockedReason}
          timeZone={state.timeZone ?? browserTimeZone()}
          serverLabels={
            several ? Object.fromEntries(servers.map((option) => [option.serverId, option.label])) : undefined
          }
        />
      ));
    case 'config':
      return withSnapshot((snapshot) => <ConfigPanel snapshot={snapshot} hello={hello} metrics={state.metrics} />);
    case 'exceptions':
      return withSnapshot((snapshot) => <ExceptionsPanel snapshot={snapshot} hello={hello} />);
  }
};

export const Shell = ({ state, token, initialView, send, onSelectServer }: ShellProps) => {
  const [view, setView] = useState<ViewId>(() => initialView ?? viewFromHash(currentHash()));
  const [theme, setTheme] = useTheme();
  const [focus, setFocus] = useState<EndpointFocus | null>(null);
  const [drafts, setDrafts] = useState<SavedDrafts>({});
  const [graphView, setGraphView] = useState<GraphViewChoice | null>(null);
  const status = appStatus(state, token);
  const viewed = serverView(state);

  useEffect(() => {
    const onHashChange = () => setView((current) => viewFromHash(location.hash, current));

    window.addEventListener('hashchange', onHashChange);

    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const openEndpoint = (next: EndpointFocus) => {
    setDrafts((current) => draftsForOpen(current, next));
    setFocus(next);
    setView('endpoints');
    location.hash = viewHash('endpoints');
  };

  const canRestart = send !== undefined && token !== null && state.connection === 'open';

  return (
    <div className="app">
      <a className="skip-link" href="#main">
        Skip to panel
      </a>
      <Sidebar
        view={view}
        snapshot={viewed.snapshot}
        hello={viewed.hello}
        servers={serverOptions(state)}
        selectedServer={viewed.server?.serverId ?? null}
        onSelectServer={onSelectServer}
        onNavigate={setView}
      />
      <div className="main">
        <TopBar
          view={view}
          state={state}
          token={token}
          theme={theme}
          onTheme={setTheme}
          onRestart={canRestart ? () => send({ v: 1, type: 'restart' }) : null}
        />
        <main id="main" className={`view view-${view}`} tabIndex={-1}>
          {!token || state.connection === 'closed' ? (
            <p className="notice bad" role="alert">
              {status.detail}
            </p>
          ) : null}
          <Panel
            view={view}
            state={state}
            token={token}
            theme={theme}
            focus={focus}
            onOpenEndpoint={openEndpoint}
            drafts={drafts}
            onDraft={(key, saved) => setDrafts((current) => ({ ...current, [key]: saved }))}
            graphView={graphView}
            onGraphView={setGraphView}
            send={send}
          />
        </main>
      </div>
    </div>
  );
};

export const App = () => {
  const { state, token, send, selectServer } = useConsole();

  return <Shell state={state} token={token} send={send} onSelectServer={selectServer} />;
};
