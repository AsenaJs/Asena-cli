import type { ConsoleHttpRequest } from '../../lib/console/hostProtocol';
import { readJson, type StorageLike, writeJson } from '../state/storage';
import type { HttpOutcome } from './http';
import type { RequestDraft } from './requestBuilder';

export interface HistoryEntry {
  /** When the response came back. */
  at: number;
  /** When the request went out; with `at`, the window the app's record of it starts in. */
  sentAt?: number;
  draft: RequestDraft;
  request: ConsoleHttpRequest;
  outcome: HttpOutcome;
  /** Set when the stored response body was cut to `HISTORY_BODY_LIMIT` characters. */
  truncated?: true;
  /** The app run that answered. */
  gen?: number;
}

/** By route key. Newest entry first. */
export type HttpHistory = Record<string, HistoryEntry[]>;

export const HISTORY_KEY = 'asena-console:http-history';

export const HISTORY_LIMIT = 20;

export const HISTORY_BODY_LIMIT = 16 * 1024;

const isEntry = (value: unknown): value is HistoryEntry => {
  if (typeof value !== 'object' || value === null) return false;

  const { at, draft, request, outcome } = value as Record<string, unknown>;

  return (
    typeof at === 'number' &&
    typeof draft === 'object' &&
    draft !== null &&
    typeof request === 'object' &&
    request !== null &&
    typeof outcome === 'object' &&
    outcome !== null
  );
};

export const loadHistory = (storage: StorageLike | null): HttpHistory => {
  const value = readJson(storage, HISTORY_KEY);

  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};

  return Object.fromEntries(
    Object.entries(value).flatMap(([key, entries]) =>
      Array.isArray(entries) ? [[key, entries.filter(isEntry).slice(0, HISTORY_LIMIT)]] : [],
    ),
  );
};

export const saveHistory = (storage: StorageLike | null, history: HttpHistory): boolean =>
  writeJson(storage, HISTORY_KEY, history);

/** Keeps the newest `HISTORY_LIMIT` entries of the route; a long response body is cut so storage keeps up. */
export const addToHistory = (history: HttpHistory, key: string, entry: HistoryEntry): HttpHistory => {
  const stored: HistoryEntry =
    entry.outcome.ok && entry.outcome.response.body.length > HISTORY_BODY_LIMIT
      ? {
          ...entry,
          outcome: {
            ok: true,
            response: { ...entry.outcome.response, body: entry.outcome.response.body.slice(0, HISTORY_BODY_LIMIT) },
          },
          truncated: true,
        }
      : entry;

  return { ...history, [key]: [stored, ...(history[key] ?? [])].slice(0, HISTORY_LIMIT) };
};
