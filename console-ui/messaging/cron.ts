// The 5-field syntax core schedules with (`Bun.cron.parse`), which the browser does not have.

export interface CronSpec {
  minutes: ReadonlySet<number>;
  hours: ReadonlySet<number>;
  days: ReadonlySet<number>;
  months: ReadonlySet<number>;
  /** 0 is Sunday; 7 is read as 0. */
  weekdays: ReadonlySet<number>;
  /** Both day fields are restricted, so a day matching either one runs, as Bun decides it. */
  dayOr: boolean;
}

const NICKNAMES: Record<string, string> = {
  '@yearly': '0 0 1 1 *',
  '@annually': '0 0 1 1 *',
  '@monthly': '0 0 1 * *',
  '@weekly': '0 0 * * 0',
  '@daily': '0 0 * * *',
  '@midnight': '0 0 * * *',
  '@hourly': '0 * * * *',
};

const MONTH_NAMES = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

const DAY_NAMES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

interface FieldRange {
  min: number;
  max: number;
  names?: string[];
  /** The value the first name stands for. */
  nameBase?: number;
}

const FIELDS: FieldRange[] = [
  { min: 0, max: 59 },
  { min: 0, max: 23 },
  { min: 1, max: 31 },
  { min: 1, max: 12, names: MONTH_NAMES, nameBase: 1 },
  { min: 0, max: 7, names: DAY_NAMES, nameBase: 0 },
];

const parseValue = (text: string, range: FieldRange): number => {
  const named = range.names?.indexOf(text.toUpperCase()) ?? -1;
  const value = named >= 0 ? named + (range.nameBase ?? 0) : /^\d+$/.test(text) ? Number(text) : NaN;

  if (!Number.isInteger(value) || value < range.min || value > range.max) {
    throw new Error(`${text} is out of range ${range.min}-${range.max}`);
  }

  return value;
};

const parseField = (text: string, range: FieldRange): Set<number> => {
  const values = new Set<number>();

  for (const part of text.split(',')) {
    const [base = '', stepText] = part.split('/');
    const step = stepText === undefined ? 1 : Number(stepText);

    if (!Number.isInteger(step) || step < 1 || (stepText !== undefined && !/^\d+$/.test(stepText))) {
      throw new Error(`step ${stepText} must be a positive integer`);
    }

    let from: number;
    let to: number;

    if (base === '*') {
      from = range.min;
      to = range.max;
    } else if (base.includes('-')) {
      const [low = '', high = ''] = base.split('-');

      from = parseValue(low, range);
      to = parseValue(high, range);
    } else {
      from = parseValue(base, range);
      to = stepText === undefined ? from : range.max;
    }

    if (from > to) throw new Error(`range ${base} runs backwards`);

    for (let value = from; value <= to; value += step) values.add(value);
  }

  return values;
};

export const parseCron = (expression: string): CronSpec => {
  const text = NICKNAMES[expression.trim().toLowerCase()] ?? expression.trim();
  const fields = text.split(/\s+/);

  if (fields.length !== 5) throw new Error(`expected 5 fields, got ${fields.length}`);

  const [minutes, hours, days, months, weekdays] = FIELDS.map((range, index) => parseField(fields[index] ?? '', range));

  if (!minutes || !hours || !days || !months || !weekdays) throw new Error('expected 5 fields');
  if (weekdays.delete(7)) weekdays.add(0);

  return { minutes, hours, days, months, weekdays, dayOr: fields[2] !== '*' && fields[4] !== '*' };
};

const MINUTE = 60_000;

const DAY = 86_400_000;

const wallFormats = new Map<string, Intl.DateTimeFormat>();

const wallFormat = (timeZone: string): Intl.DateTimeFormat => {
  let format = wallFormats.get(timeZone);

  if (!format) {
    format = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
    });
    wallFormats.set(timeZone, format);
  }

  return format;
};

/** The minute the clocks in `timeZone` show at `instant`, as the UTC fields of the returned epoch milliseconds. */
export const wallClockOf = (instant: number, timeZone: string): number => {
  const fields: Partial<Record<Intl.DateTimeFormatPartTypes, number>> = {};

  for (const part of wallFormat(timeZone).formatToParts(instant)) fields[part.type] = Number(part.value);

  return Date.UTC(fields.year ?? 0, (fields.month ?? 1) - 1, fields.day ?? 1, fields.hour ?? 0, fields.minute ?? 0);
};

const offsetAt = (instant: number, timeZone: string): number =>
  wallClockOf(instant, timeZone) - Math.floor(instant / MINUTE) * MINUTE;

/**
 * The instants at which the clocks in `timeZone` show `wall`, earliest first: two when the clocks go back over it.
 * A minute the clocks skip moves on by the skip, as `Bun.cron.parse` does.
 */
const instantsOf = (wall: number, timeZone: string): number[] => {
  const before = wall - offsetAt(wall - DAY, timeZone);
  const after = wall - offsetAt(wall + DAY, timeZone);
  const shown = [...new Set([before, after])].filter((instant) => wallClockOf(instant, timeZone) === wall);

  return shown.length > 0 ? shown.sort((a, b) => a - b) : [before];
};

const dayMatches = (spec: CronSpec, wall: Date): boolean => {
  const day = spec.days.has(wall.getUTCDate());
  const weekday = spec.weekdays.has(wall.getUTCDay());

  return spec.dayOr ? day || weekday : day && weekday;
};

// Far enough for `0 0 29 2 *` across a century gap; an expression with no date at all (Feb 30) ends here.
const SEARCH_YEARS = 8;

/** The first minute in `(from, to]` with another offset than `from`'s; `to` must have one. */
const offsetChange = (from: number, to: number, timeZone: string): number => {
  const before = offsetAt(from, timeZone);
  let low = Math.floor(from / MINUTE);
  let high = Math.floor(to / MINUTE);

  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);

    if (offsetAt(middle * MINUTE, timeZone) === before) low = middle;
    else high = middle;
  }

  return high * MINUTE;
};

/**
 * Walks the clocks forward from `start`. Where they repeat a minute, only an every-hour expression runs on the second
 * pass, as with `Bun.cron.parse`.
 */
const searchFrom = (spec: CronSpec, start: number, after: number, timeZone: string): Date | null => {
  const wall = new Date(start);
  const limit = wall.getUTCFullYear() + SEARCH_YEARS;
  const passes = spec.hours.size === 24 ? 2 : 1;

  while (wall.getUTCFullYear() <= limit) {
    if (!spec.months.has(wall.getUTCMonth() + 1)) {
      wall.setUTCMonth(wall.getUTCMonth() + 1, 1);
      wall.setUTCHours(0, 0, 0, 0);
    } else if (!dayMatches(spec, wall)) {
      wall.setUTCDate(wall.getUTCDate() + 1);
      wall.setUTCHours(0, 0, 0, 0);
    } else if (!spec.hours.has(wall.getUTCHours())) {
      wall.setUTCHours(wall.getUTCHours() + 1, 0, 0, 0);
    } else if (!spec.minutes.has(wall.getUTCMinutes())) {
      wall.setUTCMinutes(wall.getUTCMinutes() + 1, 0, 0);
    } else {
      const instant = instantsOf(wall.getTime(), timeZone)
        .slice(0, passes)
        .find((candidate) => candidate > after);

      if (instant !== undefined) return new Date(instant);

      wall.setUTCMinutes(wall.getUTCMinutes() + 1, 0, 0);
    }
  }

  return null;
};

/**
 * The first minute strictly after `from` that the expression names on the clocks of `timeZone`, the app's zone
 * that `Bun.cron.parse` reads; `null` when there is none.
 */
export const nextCronRun = (spec: CronSpec, from: Date, timeZone: string): Date | null => {
  const at = from.getTime();
  const wall = wallClockOf(at, timeZone);
  const next = searchFrom(spec, wall + MINUTE, at, timeZone);
  const secondPass = instantsOf(wall, timeZone)[1];

  if (spec.hours.size !== 24 || secondPass === undefined || secondPass <= at) return next;

  // `from` is on the first pass of minutes the clocks repeat, so the ones already behind it come round again.
  const repeat = offsetChange(at, secondPass, timeZone);
  const again = searchFrom(spec, wallClockOf(repeat, timeZone), repeat - 1, timeZone);

  return again && (!next || again < next) ? again : next;
};

export type NextRun = { ok: true; at: Date | null } | { ok: false; error: string };

export const nextRunOf = (expression: string, from: Date, timeZone: string): NextRun => {
  try {
    return { ok: true, at: nextCronRun(parseCron(expression), from, timeZone) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
};
