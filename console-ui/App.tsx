import { type ReactNode, useEffect, useState } from 'react';
import type { ConsoleBrowserMessage } from '../lib/console/hostProtocol';
import type { DevtoolsCommandRequest, DevtoolsSnapshot } from '../lib/console/protocol';
import { ConfigPanel } from './config/ConfigPanel';
import { draftsForOpen, EndpointsPanel } from './endpoints/EndpointsPanel';
import type { SavedDraft, SavedDrafts } from './endpoints/requestBuilder';
import { ExceptionsPanel } from './exceptions/ExceptionsPanel';
import type { GraphViewChoice } from './graph/focus';
import { GraphPanel } from './graph/GraphPanel';
import { browserTimeZone, commandBlockedReason } from './messaging/commands';
import { MessagingPanel } from './messaging/MessagingPanel';
import type { EndpointFocus } from './requests/records';
import { RequestsPanel } from './requests/RequestsPanel';
import { RuntimePanel } from './runtime/RuntimePanel';
import { StaleNotice, WaitingForSnapshot } from './shell/Placeholder';
import { Sidebar } from './shell/Sidebar';
import { appStatus } from './shell/status';
import { type ThemeChoice, useTheme } from './shell/theme';
import { TopBar } from './shell/TopBar';
import { type ViewId, viewFromHash, viewHash } from './shell/views';
import { type ConsoleState, isSnapshotStale } from './state/store';
import { useConsole } from './state/useConsole';

export interface ShellProps {
  state: ConsoleState;
  token: string | null;
  initialView?: ViewId;
  send?: (message: ConsoleBrowserMessage) => boolean;
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
  const blockedReason = commandBlockedReason({
    canSend: send !== undefined,
    token,
    connected: state.connection === 'open',
    hello: state.hello,
  });
  const sendCommand =
    send && blockedReason === null
      ? (command: DevtoolsCommandRequest) => send({ v: 1, type: 'command', command })
      : null;

  const withSnapshot = (render: (snapshot: DevtoolsSnapshot) => ReactNode) =>
    state.snapshot ? (
      <>
        {isSnapshotStale(state) ? <StaleNotice gen={state.snapshotGen} /> : null}
        {render(state.snapshot)}
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
          hello={state.hello}
          gen={state.child?.gen ?? null}
          token={token}
          focus={focus}
          drafts={drafts}
          onDraft={onDraft}
          requests={state.requests}
        />
      ));
    case 'requests':
      return (
        <RequestsPanel
          requests={state.requests}
          runs={state.runs}
          routes={state.snapshot?.routes ?? []}
          onReplay={onOpenEndpoint}
        />
      );
    case 'messaging':
      return withSnapshot((snapshot) => (
        <MessagingPanel
          snapshot={snapshot}
          hello={state.hello}
          metrics={state.metrics}
          requests={state.requests}
          commandResults={state.commandResults}
          send={sendCommand}
          blockedReason={blockedReason}
          timeZone={state.timeZone ?? browserTimeZone()}
        />
      ));
    case 'config':
      return withSnapshot((snapshot) => (
        <ConfigPanel snapshot={snapshot} hello={state.hello} metrics={state.metrics} />
      ));
    case 'exceptions':
      return withSnapshot((snapshot) => <ExceptionsPanel snapshot={snapshot} hello={state.hello} />);
  }
};

export const Shell = ({ state, token, initialView, send }: ShellProps) => {
  const [view, setView] = useState<ViewId>(() => initialView ?? viewFromHash(currentHash()));
  const [theme, setTheme] = useTheme();
  const [focus, setFocus] = useState<EndpointFocus | null>(null);
  const [drafts, setDrafts] = useState<SavedDrafts>({});
  const [graphView, setGraphView] = useState<GraphViewChoice | null>(null);
  const status = appStatus(state, token);

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
      <Sidebar view={view} snapshot={state.snapshot} hello={state.hello} onNavigate={setView} />
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
  const { state, token, send } = useConsole();

  return <Shell state={state} token={token} send={send} />;
};
