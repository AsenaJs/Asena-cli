import type { ConsoleHttpRequest, ConsoleHttpResponse } from './hostProtocol';

const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'content-length',
  'host',
  'keep-alive',
  'proxy-connection',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

const PROXY_TIMEOUT_MS = 30_000;

/**
 * The app URL for a proxied request. The path is appended to a fixed origin as a string, never resolved with
 * `new URL(path, base)`, so no path can change the host.
 */
export const buildAppUrl = (port: number, request: Pick<ConsoleHttpRequest, 'path' | 'query'>): string => {
  const query = new URLSearchParams(request.query).toString();

  return `http://127.0.0.1:${port}${request.path}${query === '' ? '' : `?${query}`}`;
};

const toHeaderRecord = (headers: Headers): Record<string, string> => {
  const record: Record<string, string> = {};

  headers.forEach((value, name) => {
    record[name] = name in record ? `${record[name]}, ${value}` : value;
  });

  return record;
};

/** Sends one console request to the app on `127.0.0.1:<port>`; rejects when the app cannot be reached. */
export const proxyHttpRequest = async (
  request: ConsoleHttpRequest,
  port: number,
  fetchImpl: typeof fetch = fetch,
): Promise<ConsoleHttpResponse> => {
  const url = buildAppUrl(port, request);

  if (new URL(url).host !== `127.0.0.1:${port}`) {
    throw new Error(`Refusing to proxy to ${url}`);
  }

  const headers = new Headers();

  for (const [name, value] of Object.entries(request.headers)) {
    if (!HOP_BY_HOP_HEADERS.has(name.toLowerCase())) headers.set(name, value);
  }

  const method = request.method.toUpperCase();
  const sendsBody = method !== 'GET' && method !== 'HEAD' && request.body !== '';
  const started = performance.now();

  const response = await fetchImpl(url, {
    method,
    headers,
    body: sendsBody ? request.body : undefined,
    redirect: 'manual',
    signal: AbortSignal.timeout(PROXY_TIMEOUT_MS),
  });

  const body = await response.text();

  return {
    status: response.status,
    headers: toHeaderRecord(response.headers),
    body,
    durationMs: Math.round((performance.now() - started) * 10) / 10,
  };
};
