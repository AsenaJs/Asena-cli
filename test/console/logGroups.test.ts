import { describe, expect, it } from 'bun:test';
import fs from 'fs';
import path from 'path';
import { AppSupervisor } from '../../lib/console/AppSupervisor';
import type { ConsoleLogLine } from '../../lib/console/hostProtocol';
import { LogGrouper, markedLevel, stripAnsi } from '../../lib/console/lines';
import { logLevel } from '../../console-ui/runtime/logs';
import { BUN_OUTPUT_CASES, type BunOutputCase, runCase } from './fixtures/bun-output/capture';
import { waitUntil } from './helpers';

const FIXTURES = path.join(import.meta.dir, 'fixtures', 'bun-output');

const linesOf = (text: string): string[] => (text === '' ? [] : text.replace(/\n$/, '').split('\n'));

/** The entries the grouper makes of one stream's output, read in one go. */
const group = (text: string): string[] => {
  const entries: string[] = [];
  const grouper = new LogGrouper((entry) => entries.push(entry), 60_000);

  for (const line of linesOf(text)) grouper.push(line, 0);

  grouper.flush();

  return entries;
};

const lastLine = (entry: string | undefined): string => entry?.split('\n').at(-1) ?? '';

type Grouped = Record<'stdout' | 'stderr', string[]>;

// What each of Bun's reports must turn into; checked on the recorded fixtures and on the Bun running this test.
const EXPECTED: Record<BunOutputCase, (output: Grouped) => void> = {
  'console-error': ({ stdout, stderr }) => {
    expect(stdout).toEqual(['before', 'after']);
    expect(stderr).toHaveLength(1);
    expect(stderr[0]).toMatch(/^\s*\d+ \| /);
    expect(stderr[0]).toContain('\nerror: boom\n');
    expect(lastLine(stderr[0])).toMatch(/^\s+at /);
  },
  cause: ({ stdout, stderr }) => {
    expect(stdout).toEqual(['after']);
    expect(stderr).toHaveLength(1);
    expect(stderr[0]).toContain('\nerror: wrapped\n');
    expect(stderr[0]).toContain('\nerror: boom\n');
    expect(lastLine(stderr[0])).toMatch(/^\s+at /);
  },
  logger: ({ stdout, stderr }) => {
    expect(stdout).toEqual(['after']);
    expect(stderr).toHaveLength(1);
    expect(stderr[0]).toStartWith('request failed ');
    expect(stderr[0]).toContain('\nerror: boom\n');
  },
  custom: ({ stdout, stderr }) => {
    expect(stdout).toEqual(['after']);
    expect(stderr).toHaveLength(1);
    expect(stderr[0]).toContain('\nItemConflictError: name "lamp" is taken\n code: "E_CONFLICT"\n');
    expect(lastLine(stderr[0])).toMatch(/^\s+at rename /);
  },
  trace: ({ stdout, stderr }) => {
    expect(stdout).toHaveLength(2);
    expect(stdout[0]).toMatch(/^where am i\n\s+at /);
    expect(stdout[1]).toBe('after');
    expect(stderr).toEqual([]);
  },
  // How ergenecore's default error log prints a handler's error.
  'error-object': ({ stdout, stderr }) => {
    expect(stdout).toEqual(['after']);
    expect(stderr).toHaveLength(1);
    expect(stderr[0]).toStartWith('Application error occurred: {\n  message: "boom",\n');
    expect(stderr[0]).toContain('  stack: "Error: boom\\n    at failing');
    expect(lastLine(stderr[0])).toBe('}');
  },
  logs: ({ stdout, stderr }) => {
    expect(stdout).toEqual(['one', 'two', '{\n  a: 1,\n  nested: {\n    b: [ 1, 2, 3 ],\n  },\n}']);
    expect(stderr).toEqual(['[warn] three']);
  },
  uncaught: ({ stdout, stderr }) => {
    expect(stdout).toEqual(['before']);
    expect(stderr).toHaveLength(1);
    expect(stderr[0]).toContain('\nerror: boom\n');
    expect(lastLine(stderr[0])).toMatch(/^Bun v\d/);
  },
};

describe('LogGrouper on recorded Bun output', () => {
  for (const name of BUN_OUTPUT_CASES) {
    it(`groups ${name}`, () => {
      const read = (stream: string) => fs.readFileSync(path.join(FIXTURES, `${name}.${stream}.txt`), 'utf-8');

      EXPECTED[name]({ stdout: group(read('stdout')), stderr: group(read('stderr')) });
    });
  }
});

describe('LogGrouper on the Bun running this test', () => {
  for (const name of BUN_OUTPUT_CASES) {
    it(`groups ${name}`, async () => {
      const output = await runCase(name);

      EXPECTED[name]({ stdout: group(output.stdout), stderr: group(output.stderr) });
    });
  }
});

describe('LogGrouper timing', () => {
  const trace = linesOf(fs.readFileSync(path.join(FIXTURES, 'console-error.stderr.txt'), 'utf-8'));

  it('closes a trace after a quiet period, without waiting for the next line', async () => {
    const entries: { text: string; at: number }[] = [];
    const grouper = new LogGrouper((text, at) => entries.push({ text, at }), 30);

    trace.forEach((line, index) => grouper.push(line, 1000 + index));

    expect(entries).toEqual([]);

    await waitUntil(() => entries.length > 0, 1000, 'the quiet flush');

    expect(entries).toEqual([{ text: trace.join('\n').trimEnd(), at: 1000 }]);
  });

  it('keeps a trace whose lines arrive in two reads together', async () => {
    const entries: string[] = [];
    const grouper = new LogGrouper((text) => entries.push(text), 60);
    const half = Math.floor(trace.length / 2);

    for (const line of trace.slice(0, half)) grouper.push(line, 0);

    await Bun.sleep(10);

    for (const line of trace.slice(half)) grouper.push(line, 0);

    grouper.flush();

    expect(entries).toHaveLength(1);
  });

  it('the next ordinary line closes the trace at once', () => {
    const entries: string[] = [];
    const grouper = new LogGrouper((text) => entries.push(text), 60_000);

    for (const line of trace) grouper.push(line, 0);

    grouper.push('[ItemEvents] item.created', 0);

    expect(entries).toHaveLength(1);
    expect(entries[0]).toContain('error: boom');

    grouper.flush();

    expect(entries).toEqual([entries[0], '[ItemEvents] item.created']);
  });
});

describe('LogGrouper on the real asena-logger output', () => {
  const entries = group(fs.readFileSync(path.join(import.meta.dir, 'fixtures/asena-logger/run.stdout.txt'), 'utf-8'));
  const levelCount = (level: string) => entries.filter((entry) => logLevel(entry, 'stdout') === level).length;

  it('makes one entry per logged error, so the counter says 9', () => {
    expect(levelCount('error')).toBe(9);
    expect(entries.filter((entry) => entry.startsWith('Error:'))).toEqual([]);
  });

  it('joins the stack the logger prints under the object to that object', () => {
    const error = entries.find((entry) => stripAnsi(entry).includes('Auth error: User 0 not found')) ?? '';

    expect(stripAnsi(error)).toMatch(/\[ERROR\]: \tAuth error: User 0 not found \{\n "path": /);
    expect(error).toContain('\n}\nError: User not found\n    at failing (/app/write.ts:');
    expect(lastLine(error)).toMatch(/^\s+at /);
  });

  it('a stack inside a [WARN] or [INFO] entry leaves the level alone', () => {
    const levelOf = (text: string) =>
      logLevel(entries.find((entry) => stripAnsi(entry).includes(text)) ?? '', 'stdout');

    expect(levelOf('TaskQueue error: Queue is full')).toBe('warn');
    expect(levelOf('Retry scheduled')).toBe('info');
  });
});

describe('LogGrouper joining a stack to a marked entry', () => {
  const STACK = ['Error: boom', '    at failing (/app/x.ts:1:1)', '    at /app/x.ts:2:2'];

  const groupLines = (lines: string[]): string[] => group(lines.join('\n'));

  it('joins a stack directly under a one-line entry with a marker', () => {
    expect(groupLines(['[ERROR] request failed', ...STACK])).toEqual([['[ERROR] request failed', ...STACK].join('\n')]);
  });

  it('keeps a stack under an entry without a marker apart', () => {
    expect(groupLines(['request failed', ...STACK])).toEqual(['request failed', STACK.join('\n')]);
    expect(groupLines(['request failed {', '  a: 1,', '}', ...STACK])).toEqual([
      'request failed {\n  a: 1,\n}',
      STACK.join('\n'),
    ]);
  });

  it('keeps an `Error:` line with no frame under it apart, whatever comes next', () => {
    expect(groupLines(['[INFO] started', 'Error: not a stack', 'after'])).toEqual([
      '[INFO] started',
      'Error: not a stack',
      'after',
    ]);
    expect(groupLines(['[INFO] started', 'Error: not a stack'])).toEqual(['[INFO] started', 'Error: not a stack']);
  });

  it('keeps a second stack apart from the one that joined', () => {
    expect(groupLines(['[ERROR] request failed', ...STACK, ...STACK])).toEqual([
      ['[ERROR] request failed', ...STACK].join('\n'),
      STACK.join('\n'),
    ]);
    expect(groupLines(['[ERROR] request failed', ...STACK, '', ...STACK])).toEqual([
      ['[ERROR] request failed', ...STACK].join('\n'),
      '',
      STACK.join('\n'),
    ]);
  });

  it('keeps a stack after a quiet period apart', async () => {
    const entries: string[] = [];
    const grouper = new LogGrouper((text) => entries.push(text), 10);

    grouper.push('[ERROR] request failed', 0);

    await waitUntil(() => entries.length > 0, 1000, 'the quiet flush');

    for (const line of STACK) grouper.push(line, 0);

    grouper.flush();

    expect(entries).toEqual(['[ERROR] request failed', STACK.join('\n')]);
  });

  it('an `Error:` line released by the quiet period keeps its own time', async () => {
    const entries: { text: string; at: number }[] = [];
    const grouper = new LogGrouper((text, at) => entries.push({ text, at }), 10);

    grouper.push('[INFO] started', 1);
    grouper.push('Error: not a stack', 2);

    await waitUntil(() => entries.length > 1, 1000, 'the quiet flush');

    expect(entries).toEqual([
      { text: '[INFO] started', at: 1 },
      { text: 'Error: not a stack', at: 2 },
    ]);
  });

  it('the marker of a source excerpt does not count', () => {
    expect(markedLevel('10 |   logger.warn("[warn] x");')).toBeNull();
    expect(markedLevel('request failed  9 | }')).toBeNull();
  });
});

describe('LogGrouper on recorded errors whose message spans lines', () => {
  const read = (stream: string) =>
    group(fs.readFileSync(path.join(import.meta.dir, `fixtures/multiline-errors/run.${stream}.txt`), 'utf-8'));
  const stdout = read('stdout');
  const stderr = read('stderr');

  it('makes one entry of what a logger prints for each error', () => {
    expect(stdout).toHaveLength(4);
    expect(stdout.map((entry) => logLevel(entry, 'stdout'))).toEqual(['error', 'error', 'error', 'info']);
    expect(stripAnsi(stdout[3] ?? '')).toEndWith('after');
  });

  it('keeps a frameless stack under the issues of a ZodError', () => {
    expect(stdout[0]).toContain('\n    "code": "invalid_type",\n');
    expect(stdout[0]).toEndWith('\n]\nZodError');
    expect(stdout[1]).toEndWith('\n}\nZodError');
  });

  it('keeps the lines of a message between the head of a stack and its frames', () => {
    expect(stdout[2]).toContain('\n}\nError: first line\nsecond line\n  third line\n    at ');
  });

  it("makes one entry of each of Bun's reports", () => {
    expect(stderr).toHaveLength(3);
    expect(stderr[0]).toStartWith('ZodError: [\n  {\n');
    expect(stderr[0]).toEndWith('\n]');
    expect(stderr[1]).toBe('after');
    expect(stderr[2]).toContain('\nerror: first line\nsecond line\n  third line\n      at ');
    expect(lastLine(stderr[2])).toMatch(/^\s+at /);
    expect(stderr.map((entry) => logLevel(entry, 'stderr'))).toEqual(['error', 'warn', 'error']);
  });
});

describe('LogGrouper holding a message until its frames come', () => {
  const groupLines = (lines: string[]): string[] => group(lines.join('\n'));
  const ZOD_LIKE = ['ZodError: [', '  {', '    "code": "invalid_type"', '  }', ']'];

  it('joins a bracketed message with frames, alone and under a marked entry', () => {
    const frame = '    at parse (/app/x.ts:1:1)';

    expect(groupLines([...ZOD_LIKE, frame])).toEqual([[...ZOD_LIKE, frame].join('\n')]);
    expect(groupLines(['[ERROR] failed', ...ZOD_LIKE, frame])).toEqual([
      ['[ERROR] failed', ...ZOD_LIKE, frame].join('\n'),
    ]);
  });

  it('leaves a bracketed message without frames apart from a marked entry', () => {
    expect(groupLines(['[INFO] started', ...ZOD_LIKE, 'after'])).toEqual([
      '[INFO] started',
      ZOD_LIKE.join('\n'),
      'after',
    ]);
  });

  it('ends at once at a line that starts an entry of its own', () => {
    const entries: string[] = [];
    const grouper = new LogGrouper((entry) => entries.push(entry), 60_000);

    for (const line of ['Error: boom', 'second line', '[INFO] next']) grouper.push(line, 0);

    expect(entries).toEqual(['Error: boom', 'second line']);

    grouper.flush();

    expect(entries.at(-1)).toBe('[INFO] next');
  });

  it('ends after the quiet period, and each line keeps its own time', async () => {
    const entries: { text: string; at: number }[] = [];
    const grouper = new LogGrouper((text, at) => entries.push({ text, at }), 10);

    grouper.push('Error: boom', 1);
    grouper.push('second line', 2);

    await waitUntil(() => entries.length > 1, 1000, 'the quiet flush');

    expect(entries).toEqual([
      { text: 'Error: boom', at: 1 },
      { text: 'second line', at: 2 },
    ]);
  });

  it('a frame after the quiet period does not reach back', async () => {
    const entries: string[] = [];
    const grouper = new LogGrouper((text) => entries.push(text), 10);

    grouper.push('Error: boom', 0);
    grouper.push('second line', 0);

    await waitUntil(() => entries.length > 1, 1000, 'the quiet flush');

    grouper.push('    at /app/x.ts:1:1', 0);
    grouper.flush();

    expect(entries).toEqual(['Error: boom', 'second line', '    at /app/x.ts:1:1']);
  });

  it('a long message stops being held at the group limit', () => {
    const lines = Array.from({ length: 600 }, (_, index) => `line ${index}`);
    const entries = groupLines(['Error: boom', ...lines]);

    expect(entries.join('\n')).toBe(['Error: boom', ...lines].join('\n'));
    expect(entries[0]).toBe('Error: boom');
  });
});

describe("LogGrouper and another request's stack in the same burst", () => {
  const A = ['[ERROR] A failed {', ' "stack": "Error: A failed\\n    at a (/app/a.ts:1:1)"', '}'];
  const OWN = ['Error: A failed', '    at a (/app/a.ts:1:1)'];
  const OTHER = ['Error: B failed', '    at b (/app/b.ts:1:1)'];

  const groupLines = (lines: string[]): string[] => group(lines.join('\n'));

  it('an entry that names its stack takes that stack', () => {
    expect(groupLines([...A, ...OWN])).toEqual([[...A, ...OWN].join('\n')]);
  });

  it('an entry that names its stack leaves another one apart', () => {
    expect(groupLines([...A, ...OTHER])).toEqual([A.join('\n'), OTHER.join('\n')]);
  });

  it('reads the stack a message with quotes names', () => {
    const quoted = ['[ERROR] x {', ' "stack": "Error: name \\"lamp\\" taken\\n    at a (/app/a.ts:1:1)"', '}'];
    const stack = ['Error: name "lamp" taken', '    at a (/app/a.ts:1:1)'];

    expect(groupLines([...quoted, ...stack])).toEqual([[...quoted, ...stack].join('\n')]);
  });

  it('applies to a stack without frames too', () => {
    const zod = ['[ERROR] x {', ' "stack": "ZodError"', '}'];

    expect(groupLines([...zod, 'ZodError'])).toEqual([[...zod, 'ZodError'].join('\n')]);
    expect(groupLines([...zod, 'OtherError'])).toEqual([zod.join('\n'), 'OtherError']);
  });

  // The stream carries no request id and core's records do not reach this text, so nothing tells these two apart.
  it('still joins under an error entry that names no stack', () => {
    expect(groupLines(['[ERROR] A failed', ...OTHER])).toEqual([['[ERROR] A failed', ...OTHER].join('\n')]);
  });

  it('keeps a stack apart from an entry below error that names no stack, so it stays an error', () => {
    const info = ['2026-11-08 10:00:00 [INFO] started', 'Error: unrelated', '    at a (b.ts:1:1)'];
    const entries = groupLines(info);

    expect(entries).toEqual([info[0], info.slice(1).join('\n')]);
    expect(entries.map((entry) => logLevel(entry, 'stdout'))).toEqual(['info', 'error']);
    expect(groupLines(['[WARN] retrying', ...OTHER])).toEqual(['[WARN] retrying', OTHER.join('\n')]);
    expect(groupLines(['[INFO] started {', '  a: 1,', '}', ...OTHER])).toEqual([
      '[INFO] started {\n  a: 1,\n}',
      OTHER.join('\n'),
    ]);
    expect(groupLines(['[INFO] started', 'ZodError'])).toEqual(['[INFO] started', 'ZodError']);
  });
});

describe('AppSupervisor groups what the child writes', () => {
  it('keeps a stack on the other stream apart from a marked entry', async () => {
    const logs: Omit<ConsoleLogLine, 'seq'>[] = [];
    let exited = false;
    const supervisor = new AppSupervisor({
      cwd: FIXTURES,
      prepare: () => [
        process.execPath,
        '-e',
        'console.log("[ERROR] request failed");console.error("Error: boom\\n    at failing (/app/x.ts:1:1)")',
      ],
      env: { ...process.env, NO_COLOR: '1' },
      onStatus: (status) => {
        if (status.state === 'exited') exited = true;
      },
      onLog: (line) => logs.push(line),
      onAgentMessage: () => {},
    });

    await supervisor.start();
    await waitUntil(() => exited, 5000, 'the child to exit');

    expect(logs.find((line) => line.stream === 'stdout')?.line).toBe('[ERROR] request failed');
    expect(logs.find((line) => line.stream === 'stderr')?.line).toBe('Error: boom\n    at failing (/app/x.ts:1:1)');
  });

  it('hands the host one log entry per Bun error report', async () => {
    const logs: Omit<ConsoleLogLine, 'seq'>[] = [];
    let exited = false;
    const supervisor = new AppSupervisor({
      cwd: FIXTURES,
      prepare: () => [process.execPath, path.join(FIXTURES, 'errors.ts'), 'console-error'],
      env: { ...process.env, NO_COLOR: '1' },
      onStatus: (status) => {
        if (status.state === 'exited') exited = true;
      },
      onLog: (line) => logs.push(line),
      onAgentMessage: () => {},
    });

    await supervisor.start();
    await waitUntil(() => exited, 5000, 'the child to exit');

    expect(logs.filter((line) => line.stream === 'stdout').map((line) => line.line)).toEqual(['before', 'after']);

    const errors = logs.filter((line) => line.stream === 'stderr');

    expect(errors).toHaveLength(1);
    expect(errors[0]?.line).toContain('\nerror: boom\n');
  });
});
