import { describe, expect, it } from 'bun:test';
import fs from 'fs';
import path from 'path';
import { AppSupervisor } from '../../lib/console/AppSupervisor';
import type { ConsoleLogLine } from '../../lib/console/hostProtocol';
import { LogGrouper } from '../../lib/console/lines';
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

describe('AppSupervisor groups what the child writes', () => {
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
