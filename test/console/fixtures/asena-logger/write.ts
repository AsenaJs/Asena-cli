// Logs through the real AsenaLogger of the project in argv[2]; capture.ts records the output into run.stdout.txt.
import path from 'path';

const { AsenaLogger } = await import(path.join(process.argv[2] ?? '', 'node_modules/@asenajs/asena-logger'));
const logger = new AsenaLogger();

const failing = (message: string): Error => {
  try {
    throw new Error(message);
  } catch (error) {
    return error as Error;
  }
};

const failure = (message: string) => {
  const error = failing(message);

  return { path: '/v1/auth/login', method: 'POST', status: 401, errorType: error.name, stack: error.stack };
};

logger.info('\n    ___    _____  ______ _   __ ___ \n   /   |  / ___/ / ____// | / //   |\n');
logger.info('Server running at http://localhost:3000');
logger.info('Backup of 2026-11-06 01:19:47 finished');
logger.info('2026-01-01 00:00:00 was the last backup');
logger.warn('Config.onError() is deprecated');
logger.warn('TaskQueue error: Queue is full', failure('Queue is full'));
logger.info('Retry scheduled', failure('Retried'));

for (let index = 0; index < 7; index++) logger.error(`Auth error: User ${index} not found`, failure('User not found'));

logger.error('Validation error', { path: '/v1/tasks', method: 'POST', status: 400, errorType: 'ZodError' });
logger.error('Lost the connection to the broker');
