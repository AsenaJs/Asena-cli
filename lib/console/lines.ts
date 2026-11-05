const ANSI_ESCAPE = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*[A-Za-z]`, 'g');

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

/** Where an open group is in a report, which decides the lines that continue it. */
type GroupState = 'plain' | 'frames' | 'excerpt' | 'caret' | 'error' | 'error-blank';

const DEFAULT_QUIET_MS = 50;

const MAX_GROUP_LINES = 500;

const startState = (text: string): GroupState => {
  if (EXCERPT_AFTER_TEXT.test(text)) return 'excerpt';

  return ERROR_HEAD.test(text) ? 'error' : 'plain';
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

      return ERROR_HEAD.test(text) ? 'error' : null;
    case 'caret':
      return 'error';
    case 'error':
    case 'error-blank':
      if (BLANK.test(text)) return 'error-blank';
      if (state === 'error-blank' && EXCERPT.test(text)) return 'excerpt';
      if (FRAME.test(text) || INDENTED.test(text) || BUN_TRAILER.test(text)) return 'error';

      return state === 'error-blank' && ERROR_HEAD.test(text) ? 'error' : null;
  }
};

/**
 * Joins the lines of one stream that belong together - a Bun error report, a stack under a message - into
 * one entry. A group ends at the next line that does not continue it, or after `quietMs` without a line.
 */
export class LogGrouper {
  private lines: string[] = [];

  private at = 0;

  private state: GroupState = 'plain';

  private timer?: ReturnType<typeof setTimeout>;

  public constructor(
    private readonly onEntry: (text: string, at: number) => void,
    private readonly quietMs: number = DEFAULT_QUIET_MS,
  ) {}

  public push(line: string, at: number): void {
    clearTimeout(this.timer);

    const text = line.replace(ANSI_ESCAPE, '');
    const next = this.lines.length > 0 && this.lines.length < MAX_GROUP_LINES ? continueState(this.state, text) : null;

    if (next === null) {
      this.flush();
      this.at = at;
      this.state = startState(text);
    } else {
      this.state = next;
    }

    this.lines.push(line);
    this.timer = setTimeout(() => this.flush(), this.quietMs);
  }

  /** Emits the open group, without the blank lines a report ends with. */
  public flush(): void {
    clearTimeout(this.timer);
    this.timer = undefined;

    const lines = this.lines;

    this.lines = [];

    if (lines.length === 0) return;

    let end = lines.length;

    while (end > 1 && BLANK.test((lines[end - 1] ?? '').replace(ANSI_ESCAPE, ''))) end--;

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
