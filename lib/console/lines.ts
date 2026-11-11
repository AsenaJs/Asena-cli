const ANSI_ESCAPE = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*[A-Za-z]`, 'g');

export const stripAnsi = (line: string): string => line.replace(ANSI_ESCAPE, '');

export type MarkedLevel = 'error' | 'warn' | 'info';

const MARKED_LEVELS: Record<string, MarkedLevel> = {
  err: 'error',
  error: 'error',
  fatal: 'error',
  warn: 'warn',
  warning: 'warn',
  info: 'info',
  debug: 'info',
  trace: 'info',
  verbose: 'info',
  silly: 'info',
  http: 'info',
  profile: 'info',
};

// DEBUG or FATAL say more than the console's level column does; these say the same.
const PLAIN_LEVEL_WORDS = new Set(['err', 'error', 'warn', 'warning', 'info']);

/** The level `word` names, when naming that level is all it says. */
export const plainLevel = (word: string): MarkedLevel | undefined =>
  PLAIN_LEVEL_WORDS.has(word) ? MARKED_LEVELS[word] : undefined;

const TIME_OF_DAY = String.raw`\d{2}:\d{2}:\d{2}(?:[.,]\d+)?(?:Z|[+-]\d{2}(?::?\d{2})?)?`;

const DATE = String.raw`\d{4}-\d{2}-\d{2}[ T]`;

/** `YYYY-MM-DD HH:MM:SS` or ISO 8601, with optional fractions and zone. */
export const LOG_TIMESTAMP = `${DATE}${TIME_OF_DAY}`;

/** What may stand before a level word at the start of a line: indent and a time, with or without date and brackets. */
const LINE_LEAD = String.raw`[^\S\n]*(?:\[?(?:${DATE})?${TIME_OF_DAY}\]?[ \t]+)?`;

const LEVEL_MARKERS = [
  /\[(?:[\w.-]+:)?(err|error|fatal|warn|warning|info|debug|trace|verbose|silly|http|profile)\]/i,
  new RegExp(String.raw`^${LINE_LEAD}(error|fatal|warn|warning)\b`, 'i'),
  new RegExp(String.raw`^${LINE_LEAD}(info|debug)\b:`, 'i'),
  new RegExp(String.raw`^${LINE_LEAD}(INFO|DEBUG)\b`),
  /\b(?:[A-Z]\w*)?(Error)\b:/,
];

// The shapes of Bun's error report: a source excerpt, a caret, `error: msg` (or `Name: msg`), indented
// properties and `at` frames, a blank line, another excerpt for each `cause`, and `Bun vX (OS)` when uncaught.
const EXCERPT = /^\s*\d+ \|(?: |$)/;
const EXCERPT_AFTER_TEXT = /(?:^|\s)\d+ \|(?: |$)/;
const CARET = /^\s*\^+\s*$/;
const FRAME = /^\s+at\s/;
const INDENTED = /^\s+\S/;
const ERROR_HEAD = /^(?:error|(?:[A-Z]\w*)?(?:Error|Exception)):(?: |$)/;
const BUN_TRAILER = /^Bun v\d/;
const BLANK = /^\s*$/;
// An object or array Bun prints over several lines: the head ends with the bracket, the closing one is unindented.
const OBJECT_OPEN = /[{[]\s*$/;
const OBJECT_CLOSE = /^[}\]]/;
// All a stack holds when an error has no frames, as a ZodError's does.
const BARE_ERROR_NAME = /^(?:[A-Z]\w*)?(?:Error|Exception)$/;
const STACK_FIELD = /^\s*"?stack"?:\s*"((?:[^"\\]|\\.)*)/;

/**
 * The level the first line of an ANSI-free entry states outright, the leftmost marker winning; `null` when it states
 * none. A source excerpt is code, not a statement.
 */
export const markedLevel = (text: string): MarkedLevel | null => {
  const firstLine = text.split('\n', 1)[0] ?? '';
  const excerpt = firstLine.search(EXCERPT_AFTER_TEXT);
  const stated = excerpt === -1 ? firstLine : firstLine.slice(0, excerpt);
  let leftmost: RegExpExecArray | null = null;

  for (const marker of LEVEL_MARKERS) {
    const match = marker.exec(stated);

    if (match && (!leftmost || match.index < leftmost.index)) leftmost = match;
  }

  return leftmost ? (MARKED_LEVELS[(leftmost[1] ?? '').toLowerCase()] ?? null) : null;
};

const BODY_MARKERS = LEVEL_MARKERS.map((marker) => new RegExp(marker.source, `${marker.flags}gm`));

/** Every level a marker on any line of an ANSI-free entry names, source excerpts included. */
export const namedLevels = (text: string): Set<MarkedLevel> => {
  const levels = new Set<MarkedLevel>();

  for (const marker of BODY_MARKERS) {
    for (const match of text.matchAll(marker)) {
      const level = MARKED_LEVELS[(match[1] ?? '').toLowerCase()];

      if (level) levels.add(level);
    }
  }

  return levels;
};

/**
 * Where an open group is in a report, which decides the lines that continue it. `head` is an error's first line, which
 * a message of several lines can follow; `error-object` is such a message in brackets, as a ZodError's.
 */
type GroupState =
  'plain' | 'frames' | 'excerpt' | 'caret' | 'head' | 'error' | 'error-blank' | 'error-object' | 'object' | 'closed';

const DEFAULT_QUIET_MS = 50;

const MAX_GROUP_LINES = 500;

const headState = (text: string): GroupState => (OBJECT_OPEN.test(text) ? 'error-object' : 'head');

const startState = (text: string): GroupState => {
  if (EXCERPT_AFTER_TEXT.test(text)) return 'excerpt';
  if (ERROR_HEAD.test(text)) return headState(text);

  return OBJECT_OPEN.test(text) ? 'object' : 'plain';
};

/** The state after `text` when it continues a group in `state`, or `null` when it starts a new entry. */
const continueState = (state: GroupState, text: string): GroupState | null => {
  switch (state) {
    case 'plain':
    case 'frames':
      return FRAME.test(text) ? 'frames' : null;
    case 'excerpt':
      if (EXCERPT.test(text)) return 'excerpt';
      if (CARET.test(text)) return 'caret';

      return ERROR_HEAD.test(text) ? headState(text) : null;
    case 'caret':
      return headState(text);
    case 'head':
    case 'error':
    case 'error-blank':
      if (BLANK.test(text)) return 'error-blank';
      if (state === 'error-blank' && EXCERPT.test(text)) return 'excerpt';
      if (FRAME.test(text) || INDENTED.test(text) || BUN_TRAILER.test(text)) return 'error';

      return state === 'error-blank' && ERROR_HEAD.test(text) ? headState(text) : null;
    case 'error-object':
      if (OBJECT_CLOSE.test(text)) return 'error';

      return INDENTED.test(text) ? 'error-object' : null;
    case 'object':
      if (OBJECT_CLOSE.test(text)) return 'closed';

      return INDENTED.test(text) ? 'object' : null;
    case 'closed':
      return null;
  }
};

/** The first line of the stack an object in `lines` carries in a `stack` field; `null` when it carries none. */
const statedStack = (lines: string[]): string | null => {
  for (const line of lines) {
    const value = STACK_FIELD.exec(stripAnsi(line))?.[1];

    if (value !== undefined) return (value.split('\\n', 1)[0] ?? '').replace(/\\(.)/g, '$1');
  }

  return null;
};

/**
 * Joins the lines of one stream that belong together - a Bun error report, a stack under a message, the stack a logger
 * prints under a marked entry - into one entry. A group ends at the next line that does not continue it, or after
 * `quietMs` without a line.
 *
 * Only a frame shows that the plain lines after an error's first line are its message, so they wait in `held` for one.
 * The stream says nothing of who wrote a line: a stack from elsewhere still joins an error entry that names no stack.
 */
export class LogGrouper {
  private lines: string[] = [];

  private held: { line: string; at: number }[] = [];

  private at = 0;

  private state: GroupState = 'plain';

  private marked: MarkedLevel | null = null;

  private timer?: ReturnType<typeof setTimeout>;

  public constructor(
    private readonly onEntry: (text: string, at: number) => void,
    private readonly quietMs: number = DEFAULT_QUIET_MS,
  ) {}

  public push(line: string, at: number): void {
    clearTimeout(this.timer);

    const text = stripAnsi(line);

    if (this.held.length === 0) {
      this.place(line, text, at, true);
    } else if (FRAME.test(text)) {
      this.lines.push(...this.held.map((entry) => entry.line), line);
      this.held = [];
      this.state = this.state === 'head' ? 'error' : 'frames';
    } else if (markedLevel(text) !== null || this.lines.length + this.held.length >= MAX_GROUP_LINES) {
      this.releaseHeld();
      this.place(line, text, at, true);
    } else {
      this.held.push({ line, at });
    }

    this.timer = setTimeout(() => this.flush(), this.quietMs);
  }

  /** Emits the open group, without the blank lines a report ends with. */
  public flush(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
    this.releaseHeld();
    this.emit();
  }

  private place(line: string, text: string, at: number, mayHold: boolean): void {
    const next =
      this.lines.length === 0 || this.lines.length >= MAX_GROUP_LINES ? null : continueState(this.state, text);

    if (next !== null) {
      this.state = next;
      this.lines.push(line);
    } else if (mayHold && this.mayBeMessage(text)) {
      this.held = [{ line, at }];
    } else if (this.lines.length > 0 && this.isOwnBareStack(text)) {
      this.state = 'frames';
      this.lines.push(line);
    } else {
      this.emit();
      this.at = at;
      this.state = startState(text);
      this.marked = markedLevel(text);
      this.lines = [line];
    }
  }

  private atMarkedEntryEnd(): boolean {
    return this.marked !== null && (this.state === 'plain' || this.state === 'closed');
  }

  /**
   * Whether `text` could be the stack the entry states; an error entry that states none can take any, since the
   * entry's level is read from its first line and joining then loses no error.
   */
  private fitsStatedStack(text: string): boolean {
    const stated = statedStack(this.lines);

    return stated === null ? this.marked === 'error' : stated === text;
  }

  /** Whether `text`, which continues no group, can still join the open one if a frame comes. */
  private mayBeMessage(text: string): boolean {
    if (this.lines.length === 0 || this.lines.length >= MAX_GROUP_LINES) return false;
    if (this.state === 'head') return markedLevel(text) === null;

    return this.atMarkedEntryEnd() && ERROR_HEAD.test(text) && this.fitsStatedStack(text);
  }

  private isOwnBareStack(text: string): boolean {
    return this.atMarkedEntryEnd() && BARE_ERROR_NAME.test(text) && this.fitsStatedStack(text);
  }

  /** No frame came: the held lines were no message, and each is placed as if it had never waited. */
  private releaseHeld(): void {
    const held = this.held;

    this.held = [];

    for (const { line, at } of held) this.place(line, stripAnsi(line), at, false);
  }

  private emit(): void {
    const lines = this.lines;

    this.lines = [];

    if (lines.length === 0) return;

    let end = lines.length;

    while (end > 1 && BLANK.test(stripAnsi(lines[end - 1] ?? ''))) end--;

    this.onEntry(lines.slice(0, end).join('\n'), this.at);
  }
}

/** Reads a byte stream to its end, handing each chunk to `onChunk` and each complete line to `onLine`. */
export const pipeLines = async (
  stream: ReadableStream<Uint8Array>,
  onLine: (line: string) => void,
  onChunk?: (chunk: Uint8Array) => void,
): Promise<void> => {
  const decoder = new TextDecoder();
  let pending = '';

  const emit = (line: string) => onLine(line.endsWith('\r') ? line.slice(0, -1) : line);

  const reader = stream.getReader();

  for (let read = await reader.read(); !read.done; read = await reader.read()) {
    const chunk = read.value;

    onChunk?.(chunk);
    pending += decoder.decode(chunk, { stream: true });

    let newline = pending.indexOf('\n');

    while (newline !== -1) {
      emit(pending.slice(0, newline));
      pending = pending.slice(newline + 1);
      newline = pending.indexOf('\n');
    }
  }

  pending += decoder.decode();

  if (pending !== '') emit(pending);
};
