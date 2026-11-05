import type { ConsoleRun, ConsoleRunCause } from '../../lib/console/hostProtocol';

const fileName = (file: string): string => file.split(/[\\/]/).pop() ?? file;

export const causeText = (cause: ConsoleRunCause): string => {
  switch (cause.kind) {
    case 'start':
      return 'started';
    case 'restart':
      return 'restarted from the console';
    case 'change': {
      const [first] = cause.files;

      if (!first) return 'source changed';

      return `${fileName(first)}${cause.files.length > 1 ? ` +${cause.files.length - 1}` : ''} saved`;
    }
  }
};

/** How a run ended, when it did not end the way a restart ends it. */
export const exitText = (run: ConsoleRun): string | null => {
  if (run.state !== 'exited') return null;
  if (run.signal !== undefined) return run.signal === 'SIGTERM' ? null : `killed ${run.signal}`;
  if (run.code !== undefined && run.code !== 0) return `exited ${run.code}`;

  return null;
};
