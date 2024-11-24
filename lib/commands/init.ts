import { Command } from 'commander';
import { InitHandler } from '../actions';

export const initCommand = new Command('init')
  .description('Creates a .asenarc.json file with default values (requires manual updates).')
  .action(async () => {
    try {
      await new InitHandler().init();

      console.log(
        '\x1b[32m%s\x1b[0m',
        'Config file created. Please check and update the values according to your project.',
      );
    } catch (error) {
      console.error('Build failed: ', error);
    }
  });
