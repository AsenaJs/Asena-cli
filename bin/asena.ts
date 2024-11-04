#! /usr/bin/env bun

import { build } from '../lib/build';
import { runProject } from '../lib/project';
import { init } from '../lib/init';

enum Commands {
  BUILD = 'build',
  INIT = 'init',
  HELP = '--help',
  DEV = 'dev',
}

enum DevCommands {
  START = 'start',
}

const devCommands = async () => {
  switch (process.argv[3]) {
    case DevCommands.START:
      await build();

      await runProject();

      break;

    default:
      console.log('asena-cli invalid dev command');
  }
};

const cli = async (command: string) => {
  try {
    switch (command) {
      case Commands.BUILD:
        await build();

        break;

      case Commands.INIT:
        await init();

        break;

      case Commands.DEV:
        await devCommands();

        break;

      case Commands.HELP:
        // eslint-disable-next-line no-useless-concat
        console.log(
          String(
            String(
              'Asena cli usage\n' +
                '\n' +
                'Commands:\n\n' +
                'asena-cli build    For building the project and preparing it for production deployment.\n' +
                'asena-cli init    Creates a .asenarc.json file with default values (requires manual updates).\n' +
                'asena-cli dev start    Builds the project and starts the output file in development mode.',
            ),
          ),
        );

        break;

      default:
        console.log('Invalid command please type "asena-cli --help" to learn usage of the asena-cli');
    }
  } catch (e) {
    console.error('asena-cli failed: ', e);
  }
};

await cli(process.argv[2]);
