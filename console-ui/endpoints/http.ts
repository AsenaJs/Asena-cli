import {
  CONSOLE_HTTP_PROXY_PATH,
  CONSOLE_TOKEN_PARAM,
  type ConsoleHttpRequest,
  type ConsoleHttpResponse,
} from '../../lib/console/hostProtocol';

export type HttpOutcome = { ok: true; response: ConsoleHttpResponse } | { ok: false; reason: string };

export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<{
  ok: boolean;
  status: number;
  text(): Promise<string>;
}>;

const isResponse = (value: unknown): value is ConsoleHttpResponse => {
  if (typeof value !== 'object' || value === null) return false;

  const { status, headers, body, durationMs } = value as Record<string, unknown>;

  return (
    typeof status === 'number' &&
    typeof headers === 'object' &&
    headers !== null &&
    typeof body === 'string' &&
    typeof durationMs === 'number'
  );
};

const reasonFrom = (text: string): string | null => {
  try {
    const value = JSON.parse(text) as unknown;

    return typeof value === 'object' && value !== null && typeof (value as { reason?: unknown }).reason === 'string'
      ? (value as { reason: string }).reason
      : null;
  } catch {
    return null;
  }
};

/** Sends one request to the app through the host's `POST /api/http`. */
export const sendHttp = async (
  request: ConsoleHttpRequest,
  token: string,
  fetchImpl: FetchLike = (url, init) => fetch(url, init),
): Promise<HttpOutcome> => {
  let status: number;
  let text: string;

  try {
    const answer = await fetchImpl(`${CONSOLE_HTTP_PROXY_PATH}?${CONSOLE_TOKEN_PARAM}=${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
    });

    status = answer.status;
    text = await answer.text();

    if (!answer.ok) {
      const reason = reasonFrom(text);

      return { ok: false, reason: `The console host answered ${status}${reason ? `: ${reason}` : ''}` };
    }
  } catch (error) {
    return {
      ok: false,
      reason: `Could not reach the console host: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  try {
    const value = JSON.parse(text) as unknown;

    if (isResponse(value)) return { ok: true, response: value };
  } catch {
    // Reported below with the other malformed answers.
  }

  return { ok: false, reason: `The console host answered ${status} with a body that is not a proxied response` };
};
