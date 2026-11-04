import { useEffect, useReducer, useState } from 'react';
import { consoleWsUrl, createConsoleClient, readToken } from './client';
import { consoleReducer, type ConsoleState, initialConsoleState } from './store';

export interface ConsoleConnection {
  state: ConsoleState;
  /** The session token from the page URL; `null` when the page was opened without one. */
  token: string | null;
}

export const useConsole = (): ConsoleConnection => {
  const [state, dispatch] = useReducer(consoleReducer, initialConsoleState);
  const [token] = useState(() => (typeof location === 'undefined' ? null : readToken(location.search)));

  useEffect(() => {
    if (!token) return;

    const client = createConsoleClient({
      url: consoleWsUrl(location, token),
      onMessage: (message) => dispatch({ kind: 'message', message }),
      onStatus: (status) => dispatch({ kind: 'connection', status }),
    });

    return () => client.close();
  }, [token]);

  return { state, token };
};
