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

/** `YYYY-MM-DD HH:MM:SS` or ISO 8601, with optional fractions and zone. */
export const LOG_TIMESTAMP = String.raw`\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:[.,]\d+)?(?:Z|[+-]\d{2}(?::?\d{2})?)?`;

const LINE_START = String.raw`^\s*(?:${LOG_TIMESTAMP}[ \t]+)?`;

const LEVEL_MARKERS = [
  /\[(?:[\w.-]+:)?(err|error|fatal|warn|warning|info|debug|trace|verbose|silly|http|profile)\]/i,
  new RegExp(String.raw`${LINE_START}(error|fatal|warn|warning)\b`, 'i'),
  new RegExp(String.raw`${LINE_START}(info|debug)\b:`, 'i'),
  /\b(ERROR|FATAL|WARN|WARNING|INFO|DEBUG)\b/,
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

/**
 * Where an open group is in a report, which decides the lines that continue it. `stack-head` is an `Error:` line
 * under a marked entry: it joins that entry only if a frame comes next.
 */
type GroupState =
  'plain' | 'frames' | 'excerpt' | 'caret' | 'error' | 'error-blank' | 'object' | 'closed' | 'stack-head';

const DEFAULT_QUIET_MS = 50;

const MAX_GROUP_LINES = 500;

const startState = (text: string): GroupState => {
  if (EXCERPT_AFTER_TEXT.test(text)) return 'excerpt';
  if (ERROR_HEAD.test(text)) return 'error';

  return OBJECT_OPEN.test(text) ? 'object' : 'plain';
};

/** The state after `text` when it continues a group in `state`, or `null` when it starts a new entry. */
const continueState = (state: GroupState, text: string): GroupState | null => {
  switch (state) {
    case 'plain':
    case 'frames':
    case 'stack-head':
      return FRAME.test(text) ? 'frames' : null;
    case 'excerpt':
      if (EXCERPT.test(text)) return 'excerpt';
      if (CARET.test(text)) return 'caret';

      return ERROR_HEAD.test(text) ? 'error' : null;
    case 'caret':
      return 'error';
    case 'error':
    case 'error-blank':
      if (BLANK.test(text)) return 'error-blank';
      if (state === 'error-blank' && EXCERPT.test(text)) return 'excerpt';
      if (FRAME.test(text) || INDENTED.test(text) || BUN_TRAILER.test(text)) return 'error';

      return state === 'error-blank' && ERROR_HEAD.test(text) ? 'error' : null;
    case 'object':
      if (OBJECT_CLOSE.test(text)) return 'closed';

      return INDENTED.test(text) ? 'object' : null;
    case 'closed':
      return null;
  }
};

/**
 * Joins the lines of one stream that belong together - a Bun error report, a stack under a message, the stack a logger
 * prints under a marked entry - into one entry. A group ends at the next line that does not continue it, or after
 * `quietMs` without a line.
 */
export class LogGrouper {
  private lines: string[] = [];

  private at = 0;

  private state: GroupState = 'plain';

  private marked = false;

  private stackHeadAt = 0;

  private timer?: ReturnType<typeof setTimeout>;

  public constructor(
    private readonly onEntry: (text: string, at: number) => void,
    private readonly quietMs: number = DEFAULT_QUIET_MS,
  ) {}

  public push(line: string, at: number): void {
    clearTimeout(this.timer);

    const text = stripAnsi(line);

    if (this.state === 'stack-head' && !FRAME.test(text)) this.releaseStackHead();

    const next = this.nextState(text);

    if (next === null) {
      this.flush();
      this.at = at;
      this.state = startState(text);
      this.marked = markedLevel(text) !== null;
    } else {
      if (next === 'stack-head') this.stackHeadAt = at;

      this.state = next;
    }

    this.lines.push(line);
    this.timer = setTimeout(() => this.flush(), this.quietMs);
  }

  /** Emits the open group, without the blank lines a report ends with. */
  public flush(): void {
    clearTimeout(this.timer);
    this.timer = undefined;

    if (this.state === 'stack-head') this.releaseStackHead();

    this.emit();
  }

  private nextState(text: string): GroupState | null {
    if (this.lines.length === 0 || this.lines.length >= MAX_GROUP_LINES) return null;

    const next = continueState(this.state, text);

    if (next !== null) return next;

    const atEntryEnd = this.state === 'plain' || this.state === 'closed';

    return this.marked && atEntryEnd && ERROR_HEAD.test(text) ? 'stack-head' : null;
  }

  /** No frame followed: the `Error:` line was a message, so what came before it closes and it opens its own group. */
  private releaseStackHead(): void {
    const head = this.lines.pop() ?? '';

    this.emit();
    this.lines = [head];
    this.at = this.stackHeadAt;
    this.state = 'error';
    this.marked = false;
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
