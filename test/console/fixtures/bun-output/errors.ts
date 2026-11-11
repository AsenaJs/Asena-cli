// Writes one of Bun's error reports, picked by argv[2]; capture.ts records them into the *.txt fixtures.
class ItemConflictError extends Error {
  public code = 'E_CONFLICT';

  public constructor(name: string) {
    super(`name "${name}" is taken`);
    this.name = 'ItemConflictError';
  }
}

const logger = { error: (message: string, ...rest: unknown[]) => console.error(message, ...rest) };

function failing(): never {
  throw new Error('boom');
}

async function rename(): Promise<never> {
  await Bun.sleep(1);
  throw new ItemConflictError('lamp');
}

const attempt = (run: () => unknown, onError: (error: unknown) => void): void => {
  try {
    run();
  } catch (error) {
    onError(error);
  }
};

switch (process.argv[2]) {
  case 'console-error':
    console.log('before');
    console.error(new Error('boom'));
    console.log('after');
    break;
  case 'cause':
    attempt(failing, (error) => console.error(new Error('wrapped', { cause: error })));
    console.log('after');
    break;
  case 'logger':
    attempt(failing, (error) => logger.error('request failed', error));
    console.log('after');
    break;
  case 'custom':
    await rename().catch((error: unknown) => console.error(error));
    console.log('after');
    break;
  case 'trace':
    console.trace('where am i');
    console.log('after');
    break;
  case 'error-object':
    attempt(failing, (error) =>
      logger.error('Application error occurred:', {
        message: (error as Error).message,
        status: 500,
        stack: (error as Error).stack,
      }),
    );
    console.log('after');
    break;
  case 'logs':
    console.log('one');
    console.log('two');
    console.error('[warn] three');
    console.log({ a: 1, nested: { b: [1, 2, 3] } });
    break;
  case 'uncaught':
    console.log('before');
    failing();
}
