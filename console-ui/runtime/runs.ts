import type { ConsoleRun, ConsoleRunCause } from '../../lib/console/hostProtocol';

const listed = (files: string[], verb: string): string[] =>
  files.length === 0 ? [] : [`${files[0]}${files.length > 1 ? ` +${files.length - 1} more` : ''} ${verb}`];

export const causeText = (cause: ConsoleRunCause): string => {
  switch (cause.kind) {
    case 'start':
      return 'started';
    case 'restart':
      return 'restarted from the console';
    case 'change': {
      const removed = cause.removed ?? [];
      const saved = cause.files.filter((file) => !removed.includes(file));
      const parts = [...listed(saved, 'saved'), ...listed(removed, 'removed')];

      return parts.length > 0 ? parts.join(', ') : 'source changed';
    }
  }
};

/** How a run ended, when it did not end the way a restart ends it. */
export const exitText = (run: ConsoleRun): string | null => {
  if (run.state !== 'exited' || run.endedBy !== undefined) return null;
  if (run.signal !== undefined) return run.signal === 'SIGTERM' ? null : `killed ${run.signal}`;
  if (run.code !== undefined && run.code !== 0) return `exited ${run.code}`;

  return null;
};
