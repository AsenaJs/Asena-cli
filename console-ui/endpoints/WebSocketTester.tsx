import { useEffect, useRef, useState } from 'react';
import { formatClock } from '../runtime/format';

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

/** What to put on the wire: text as typed, JSON validated and sent compact. */
export const encodeOutgoing = (
  text: string,
  mode: MessageMode,
): { ok: true; data: string } | { ok: false; error: string } => {
  if (mode === 'text') return { ok: true, data: text };

  try {
    return { ok: true, data: JSON.stringify(JSON.parse(text)) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
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

  return (
    <section className="ws-tester" aria-labelledby="ws-title">
      <h3 id="ws-title">
        <span className="mono">/{namespace}</span> <span className="muted">· {component}</span>
      </h3>
      {url ? (
        <p className="mono muted">{url}</p>
      ) : (
        <p className="muted">The app has no HTTP port yet: it runs headless, or the current child has not reported.</p>
      )}
      <div className="ws-actions">
        <button type="button" className="primary" disabled={!url || busy} onClick={connect}>
          Connect
        </button>
        <button type="button" disabled={!busy} onClick={() => socket.current?.close(1000)}>
          Disconnect
        </button>
        <span className="badge" data-tone={open ? 'ok' : state === 'connecting' ? 'warn' : 'idle'}>
          {state}
        </span>
      </div>
      <form
        className="ws-send"
        onSubmit={(event) => {
          event.preventDefault();
          send();
        }}
      >
        <label className="field">
          <span>Message</span>
          <textarea
            rows={4}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                event.preventDefault();

                if (open) send();
              }
            }}
          />
        </label>
        <fieldset className="inline-choice">
          <legend className="visually-hidden">Send as</legend>
          <label>
            <input type="radio" name="ws-mode" checked={mode === 'text'} onChange={() => setMode('text')} />
            Text
          </label>
          <label>
            <input type="radio" name="ws-mode" checked={mode === 'json'} onChange={() => setMode('json')} />
            JSON
          </label>
        </fieldset>
        <button type="submit" disabled={!open}>
          Send
        </button>
        <button type="button" onClick={() => setFrames([])}>
          Clear log
        </button>
        {error ? (
          <p className="field-error" role="alert">
            {error}
          </p>
        ) : null}
      </form>
      <ol className="frame-log" role="log" aria-label="Frames">
        {frames.map((frame) => (
          <li key={frame.id} data-direction={frame.direction}>
            <span className="log-time">{formatClock(frame.at)}</span>
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
    </section>
  );
};
