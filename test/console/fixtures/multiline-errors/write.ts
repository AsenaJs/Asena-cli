// Writes errors whose message spans lines; capture.ts records stdout and stderr into the *.txt fixtures.
const { AsenaLogger } = await import(process.argv[2] ?? '');
const { z } = await import(process.argv[3] ?? '');

const logger = new AsenaLogger();

const parseFailure = (): Error => {
  try {
    z.object({ title: z.string(), points: z.number().int() }).parse({ title: 1 });
  } catch (error) {
    return error as Error;
  }

  throw new Error('The value should not have parsed');
};

const zodError = parseFailure();
const multiline = new Error('first line\nsecond line\n  third line');

logger.error(zodError);
logger.error('Validation error', { path: '/v1/items', status: 400, errorType: zodError.name, stack: zodError.stack });
logger.error('Import failed', { path: '/v1/items', status: 500, errorType: multiline.name, stack: multiline.stack });
logger.info('after');

console.error(zodError);
console.error('after');
console.error(multiline);
