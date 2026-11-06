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
