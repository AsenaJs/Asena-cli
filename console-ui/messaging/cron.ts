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

const dayMatches = (spec: CronSpec, date: Date): boolean => {
  const day = spec.days.has(date.getDate());
  const weekday = spec.weekdays.has(date.getDay());

  return spec.dayOr ? day || weekday : day && weekday;
};

// Far enough for `0 0 29 2 *` across a century gap; an expression with no date at all (Feb 30) ends here.
const SEARCH_YEARS = 8;

/** The first minute strictly after `from` that the expression names, in local time; `null` when there is none. */
export const nextCronRun = (spec: CronSpec, from: Date): Date | null => {
  const date = new Date(from.getTime());

  date.setSeconds(0, 0);
  date.setMinutes(date.getMinutes() + 1);

  const limit = from.getFullYear() + SEARCH_YEARS;

  while (date.getFullYear() <= limit) {
    if (!spec.months.has(date.getMonth() + 1)) {
      date.setMonth(date.getMonth() + 1, 1);
      date.setHours(0, 0, 0, 0);
    } else if (!dayMatches(spec, date)) {
      date.setDate(date.getDate() + 1);
      date.setHours(0, 0, 0, 0);
    } else if (!spec.hours.has(date.getHours())) {
      date.setHours(date.getHours() + 1, 0, 0, 0);
    } else if (!spec.minutes.has(date.getMinutes())) {
      date.setMinutes(date.getMinutes() + 1, 0, 0);
    } else {
      return date;
    }
  }

  return null;
};

export type NextRun = { ok: true; at: Date | null } | { ok: false; error: string };

export const nextRunOf = (expression: string, from: Date): NextRun => {
  try {
    return { ok: true, at: nextCronRun(parseCron(expression), from) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
};
