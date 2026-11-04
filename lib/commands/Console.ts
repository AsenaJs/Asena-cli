import fs from 'fs';
import os from 'os';
import path from 'path';
import { Command, InvalidArgumentError } from 'commander';
import { ConfigHandler } from '../codeBuilder';
import { consoleUiDir, openBrowser } from '../console/browser';
import { ConsoleHost } from '../console/ConsoleHost';
import { CONSOLE_MIN_CORE_VERSION, DEVTOOLS_SUBPATH, resolveDevtoolsAgent } from '../console/coreVersion';
import { appCommand, writeConsoleWrapper } from '../console/wrapper';
import { readInstalledVersion } from '../doctor/readInstalledVersion';
import { getControllers } from '../helpers';
import type { AsenaConfig } from '../types';
import type { BaseCommand } from '../types/baseCommand';

export interface ConsoleOptions {
  port?: number;
  open: boolean;
  watch: boolean;
}

const red = (text: string) => `\x1b[31m${text}\x1b[0m`;

const parsePort = (value: string): number => {
  const port = Number(value);

  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new InvalidArgumentError('Expected a port number between 0 and 65535.');
  }

  return port;
};

export class Console implements BaseCommand {
  public command() {
    return new Command('console')
      .description('Starts the app in dev mode with a browser console (dev only)')
      .option('--port <port>', 'console port (default: a free port)', parsePort)
      .option('--no-open', 'do not open the browser')
      .option('--no-watch', 'do not restart the app when a source file changes')
      .action(async (options: ConsoleOptions) => {
        const code = await this.exec(options);

        if (code !== 0) process.exit(code);
      });
  }

  /**
   * Starts the console host and the app. On success the host keeps running until SIGINT or SIGTERM.
   *
   * @returns 0 once the console is up, or the exit code of a refusal.
   */
  public async exec(options: ConsoleOptions): Promise<number> {
    const root = process.cwd();

    if (process.env.NODE_ENV === 'production') {
      console.error(red('asena console is a development tool and does not start when NODE_ENV=production.'));

      return 1;
    }

    let config: AsenaConfig;

    try {
      config = (await new ConfigHandler().exec()).configFile;
    } catch (error) {
      console.error(red(error instanceof Error ? error.message : String(error)));

      return 1;
    }

    const agentPath = resolveDevtoolsAgent(root);

    if (agentPath === null) {
      const installed = readInstalledVersion(path.join(root, 'node_modules', '@asenajs', 'asena'));

      console.error(
        red(
          `asena console needs @asenajs/asena ${CONSOLE_MIN_CORE_VERSION} or newer, which provides ${DEVTOOLS_SUBPATH}; ` +
            (installed ? `this project has ${installed}.` : 'this project has no @asenajs/asena installed.'),
        ),
      );

      return 1;
    }

    const wrapperDir = fs.mkdtempSync(path.join(os.tmpdir(), 'asena-console-'));

    const host = new ConsoleHost({
      port: options.port,
      uiDir: consoleUiDir(),
      watchDir: options.watch ? path.resolve(root, config.sourceFolder) : undefined,
      app: {
        cwd: root,
        echo: true,
        prepare: async () => {
          const controllers = await getControllers(config.rootFile, config.sourceFolder, { fresh: true });
          const entry = writeConsoleWrapper(wrapperDir, {
            root,
            sourceFolder: config.sourceFolder,
            rootFile: config.rootFile,
            controllers,
            agentPath,
          });

          return appCommand(root, entry);
        },
      },
    });

    try {
      await host.start();
    } catch (error) {
      fs.rmSync(wrapperDir, { recursive: true, force: true });
      console.error(red(`asena console could not start: ${error instanceof Error ? error.message : String(error)}`));

      return 1;
    }

    const shutdown = async () => {
      await host.stop();
      fs.rmSync(wrapperDir, { recursive: true, force: true });
      process.exit(0);
    };

    process.once('SIGINT', () => void shutdown());
    process.once('SIGTERM', () => void shutdown());

    console.log(`Asena console: ${host.url}`);

    if (options.open && !(await openBrowser(host.url))) {
      console.log('Could not open a browser; open the URL above.');
    }

    return 0;
  }
}
