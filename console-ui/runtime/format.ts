export const formatBytes = (bytes: number): string => {
  const units = ['B', 'KiB', 'MiB', 'GiB'];
  let value = bytes;
  let unit = 0;

  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }

  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
};

export const formatPercent = (value: number): string => `${value.toFixed(1)} %`;

export const formatMs = (value: number): string => `${value.toFixed(value < 10 ? 2 : 0)} ms`;

export const formatUptime = (seconds: number): string => {
  const whole = Math.floor(seconds);
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const s = whole % 60;

  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;

  return `${s}s`;
};

/** `m:ss` since the session started, or `h:mm:ss` past an hour. */
export const formatElapsed = (ms: number): string => {
  const whole = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const s = String(whole % 60).padStart(2, '0');

  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
};

const pad = (value: number, width = 2) => String(value).padStart(width, '0');

export const formatClock = (epochMs: number): string => {
  const date = new Date(epochMs);

  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
};

/** Splits `62.0 MiB` into the number and its unit, for the big metric figure. */
export const splitUnit = (text: string): [string, string] => {
  const space = text.indexOf(' ');

  return space === -1 ? [text, ''] : [text.slice(0, space), text.slice(space + 1)];
};

export interface Sparkline {
  line: string;
  area: string;
  last: { x: number; y: number } | null;
}

/** SVG paths for `values` scaled into a `width` x `height` box with `pad` above and below, oldest on the left. */
export const sparkline = (values: number[], width: number, height: number, pad = 3): Sparkline => {
  if (values.length === 0) return { line: '', area: '', last: null };

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  const step = values.length > 1 ? width / (values.length - 1) : 0;
  const y = (value: number) => (span === 0 ? height / 2 : height - pad - ((value - min) / span) * (height - pad * 2));
  const points = values.map((value, i) => ({ x: Number((i * step).toFixed(1)), y: Number(y(value).toFixed(1)) }));
  const line = points.map((point, i) => `${i === 0 ? 'M' : 'L'}${point.x} ${point.y}`).join(' ');
  const last = points[points.length - 1] ?? null;

  return { line, area: `${line} L${last?.x ?? 0} ${height} L0 ${height}Z`, last };
};

/** The value at the given quantile (0..1) of `values`, nearest rank. */
export const quantile = (values: number[], q: number): number => {
  if (values.length === 0) return 0;

  const sorted = [...values].sort((a, b) => a - b);

  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1))] ?? 0;
};
