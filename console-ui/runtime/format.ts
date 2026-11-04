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

const pad = (value: number, width = 2) => String(value).padStart(width, '0');

export const formatClock = (epochMs: number): string => {
  const date = new Date(epochMs);

  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`;
};

/** SVG polyline points for `values` scaled into a `width` x `height` box, oldest on the left. */
export const sparklinePoints = (values: number[], width: number, height: number): string => {
  if (values.length === 0) return '';

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  const step = values.length > 1 ? width / (values.length - 1) : 0;
  const y = (value: number) => (span === 0 ? height / 2 : height - ((value - min) / span) * height);

  return values.map((value, i) => `${(i * step).toFixed(1)},${y(value).toFixed(1)}`).join(' ');
};
