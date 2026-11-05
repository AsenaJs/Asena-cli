import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import type { ConsoleBrowserMessage } from '../../lib/console/hostProtocol';
import { type ConsoleClient, consoleWsUrl, createConsoleClient, readToken } from './client';
import { consoleReducer, type ConsoleState, initialConsoleState } from './store';

export interface ConsoleConnection {
  state: ConsoleState;
  /** The session token from the page URL; `null` when the page was opened without one. */
  token: string | null;
  /** @returns Whether the message went out. */
  send: (message: ConsoleBrowserMessage) => boolean;
}

export const useConsole = (): ConsoleConnection => {
  const [state, dispatch] = useReducer(consoleReducer, initialConsoleState);
  const [token] = useState(() => (typeof location === 'undefined' ? null : readToken(location.search)));
  const client = useRef<ConsoleClient | null>(null);

  useEffect(() => {
    if (!token) return;

    const current = createConsoleClient({
      url: consoleWsUrl(location, token),
      onMessage: (message) => dispatch({ kind: 'message', message }),
      onStatus: (status) => dispatch({ kind: 'connection', status }),
    });

    client.current = current;

    return () => {
      current.close();
      client.current = null;
    };
  }, [token]);

  const send = useCallback((message: ConsoleBrowserMessage) => {
    const went = client.current?.send(message) ?? false;

    if (went && message.type === 'command') dispatch({ kind: 'commandSent', id: message.command.id });

    return went;
  }, []);

  return { state, token, send };
};
