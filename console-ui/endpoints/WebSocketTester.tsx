import { useEffect, useRef, useState } from 'react';
import { formatClock } from '../runtime/format';
import { Card, MethodBadge, Pill, SegmentedControl } from '../ui/components';
import { jsonProblem } from './requestBuilder';

export type FrameDirection = 'out' | 'in' | 'info';

export interface Frame {
  id: number;
  direction: FrameDirection;
  data: string;
  at: number;
}

export type MessageMode = 'text' | 'json';

type SocketState = 'idle' | 'connecting' | 'open' | 'closed';

const FRAME_LIMIT = 500;

export const wsAppUrl = (port: number, namespace: string): string =>
  `ws://127.0.0.1:${port}/${namespace.replace(/^\/+/, '')}`;

/** What to put on the wire: text as typed, JSON validated and sent as typed, trimmed. */
export const encodeOutgoing = (
  text: string,
  mode: MessageMode,
): { ok: true; data: string } | { ok: false; error: string } => {
  if (mode === 'text') return { ok: true, data: text };

  const data = text.trim();
  const problem = data === '' ? 'the message is empty' : jsonProblem(data);

  return problem === null ? { ok: true, data } : { ok: false, error: problem };
};

export const describeIncoming = (data: unknown): string => {
  if (typeof data === 'string') return data;
  if (data instanceof ArrayBuffer) return `[binary, ${data.byteLength} bytes]`;
  if (typeof Blob !== 'undefined' && data instanceof Blob) return `[binary, ${data.size} bytes]`;

  return String(data);
};

export interface WebSocketTesterProps {
  namespace: string;
  component: string;
  /** The app's HTTP port from hello; `null` while there is none. */
  port: number | null;
}

export const WebSocketTester = ({ namespace, component, port }: WebSocketTesterProps) => {
  const [state, setState] = useState<SocketState>('idle');
  const [frames, setFrames] = useState<Frame[]>([]);
  const [message, setMessage] = useState('');
  const [mode, setMode] = useState<MessageMode>('text');
  const [error, setError] = useState<string | null>(null);
  const socket = useRef<WebSocket | null>(null);
  const nextId = useRef(0);
  const url = port === null ? null : wsAppUrl(port, namespace);

  const record = (direction: FrameDirection, data: string) =>
    setFrames((current) => [...current, { id: nextId.current++, direction, data, at: Date.now() }].slice(-FRAME_LIMIT));

  useEffect(
    () => () => {
      socket.current?.close(1000);
      socket.current = null;
    },
    [url],
  );

  const connect = () => {
    if (!url) return;

    const ws = new WebSocket(url);

    socket.current = ws;
    setState('connecting');
    record('info', `Connecting to ${url}`);
    ws.onopen = () => {
      setState('open');
      record('info', 'Connected');
    };
    ws.onmessage = (event: MessageEvent) => record('in', describeIncoming(event.data));
    ws.onerror = () => record('info', 'Connection error');
    ws.onclose = (event: CloseEvent) => {
      if (socket.current === ws) socket.current = null;

      setState('closed');
      record('info', `Closed with code ${event.code}${event.reason ? `: ${event.reason}` : ''}`);
    };
  };

  const send = () => {
    const encoded = encodeOutgoing(message, mode);

    if (!encoded.ok) {
      setError(`Not valid JSON: ${encoded.error}`);

      return;
    }

    setError(null);
    socket.current?.send(encoded.data);
    record('out', encoded.data);
  };

  const open = state === 'open';
  const busy = state === 'connecting' || open;

  const tone = open ? 'ok' : state === 'connecting' ? 'warn' : 'neutral';

  return (
    <section className="req" aria-labelledby="ws-title">
      <h2 id="ws-title" className="visually-hidden">
        WebSocket /{namespace}
      </h2>
      <Card>
        <div className="urlbar">
          <MethodBadge method="WS" className="method-sel" />
          <div className="url" aria-label="Socket URL">
            {url ? (
              <>
                <span className="host">ws://127.0.0.1:{port}</span>/{namespace.replace(/^\/+/, '')}
              </>
            ) : (
              <span className="host">/{namespace}</span>
            )}
          </div>
          {busy ? (
            <button type="button" className="icon-btn" onClick={() => socket.current?.close(1000)}>
              Disconnect
            </button>
          ) : (
            <button type="button" className="send" disabled={!url} onClick={connect}>
              Connect
            </button>
          )}
        </div>
      </Card>
      <div className="req-info">
        <span className="mono">{component}</span>
        <Pill tone={tone} dot>
          {state}
        </Pill>
        {url ? null : (
          <span className="muted">
            The app has no HTTP port yet: it runs headless, or the current child has not reported.
          </span>
        )}
      </div>
      <div className="panes">
        <Card className="pane">
          <form
            className="pane-body fields"
            onSubmit={(event) => {
              event.preventDefault();
              send();
            }}
          >
            <label className="visually-hidden" htmlFor="ws-message">
              Message
            </label>
            <textarea
              id="ws-message"
              className="textarea"
              spellCheck={false}
              rows={8}
              placeholder="Message"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                  event.preventDefault();

                  if (open) send();
                }
              }}
            />
            <div className="ws-row">
              <SegmentedControl
                label="Send as"
                options={[
                  { id: 'text', label: 'Text' },
                  { id: 'json', label: 'JSON' },
                ]}
                pressed={new Set([mode])}
                onToggle={setMode}
              />
              <button type="submit" className="send" disabled={!open}>
                Send <kbd aria-hidden="true">Ctrl ↵</kbd>
              </button>
            </div>
            {error ? (
              <p className="field-error" role="alert">
                {error}
              </p>
            ) : null}
          </form>
        </Card>
        <Card className="pane">
          <div className="resp-meta">
            <h3 className="section-title">Frames</h3>
            <button type="button" className="link-btn quiet resp-run" onClick={() => setFrames([])}>
              Clear
            </button>
          </div>
          <ol className="frame-log pane-body" role="log" aria-label="Frames">
            {frames.length === 0 ? <li className="muted">No frames yet.</li> : null}
            {frames.map((frame) => (
              <li key={frame.id} data-direction={frame.direction}>
                <span className="ts">{formatClock(frame.at)}</span>
                <span className="frame-direction">
                  {frame.direction === 'out' ? '→' : frame.direction === 'in' ? '←' : '·'}
                  <span className="visually-hidden">
                    {frame.direction === 'out' ? 'sent' : frame.direction === 'in' ? 'received' : 'status'}
                  </span>
                </span>
                <span className="frame-data">{frame.data}</span>
              </li>
            ))}
          </ol>
        </Card>
      </div>
    </section>
  );
};
