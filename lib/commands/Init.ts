import { Command } from 'commander';
import { INITIAL_ASENA_CONFIG } from '../constants';
import { isAsenaConfigExists } from '../helpers';

export class Init {
  public command() {
    return new Command('init')
      .description('Creates a .asenarc.json file with default values (requires manual updates).')
      .action(async () => {
        try {
          await this.exec();

          console.log(
            '\x1b[32m%s\x1b[0m',
            'Config file created. Please check and update the values according to your project.',
          );
        } catch (error) {
          console.error('Build failed: ', error);
        }
      });
  }

  public async exec() {
    if (!isAsenaConfigExists()) {
      const numberOfBytes = await Bun.write('.asenarc.json', INITIAL_ASENA_CONFIG);

      if (numberOfBytes === 0) {
        throw new Error('Failed to create asena config');
      }
    }
  }
}
