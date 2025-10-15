import path from 'node:path';
import { $ } from 'bun';
import { Command } from 'commander';
import inquirer from 'inquirer';
import { ConfigHandler, ControllerHandler, ImportHandler, MiddlewareHandler, ServiceHandler, ServerConfigHandler, WebSocketHandler } from '../codeBuilder';
import { convertToPascalCase, getImportType, removeExtension, getAdapterConfig, getMiddlewareImports, getControllerImports, getConfigImports, getWebSocketImports } from '../helpers';
import type { BaseCommand } from '../types/baseCommand';
import type { GenerateOptions } from '../types/generate';

export class Generate implements BaseCommand {
  public command() {
    const generate = new Command('generate')
      .alias('g')
      .description('For generating service, middleware and controller');

    generate
      .command('controller')
      .alias('c')
      .description('Generates controller')
      .action(async () => {
        try {
          await this.generateController();
        } catch (error) {
          console.error('Build failed: ', error);
        }
      });

    generate
      .command('service')
      .alias('s')
      .description('Generates service')
      .action(async () => {
        try {
          await this.addService();
        } catch (error) {
          console.error('Build failed: ', error);
        }
      });

    generate
      .command('middleware')
      .alias('m')
      .description('Generates middleware')
      .action(async () => {
        try {
          await this.addMiddleware();
        } catch (error) {
          console.error('Build failed: ', error);
        }
      });

    generate
      .command('config')
      .description('Generates server config')
      .action(async () => {
        try {
          await this.addConfig();
        } catch (error) {
          console.error('Build failed: ', error);
        }
      });

    generate
      .command('websocket')
      .alias('ws')
      .description('Generates WebSocket namespace')
      .action(async () => {
        try {
          await this.addWebSocket();
        } catch (error) {
          console.error('Build failed: ', error);
        }
      });

    return generate;
  }

  private async generateController() {
    const controllerName = convertToPascalCase(removeExtension((await this.askQuestions('controller')).elementName));

    const importType = await getImportType();
    const adapter = await getAdapterConfig();
    const controllerImports = getControllerImports(adapter);

    const controllerCode =
      new ImportHandler('', importType).importToCode(controllerImports, importType) +
      new ControllerHandler('').addController(controllerName, null).code;

    await this.generate(controllerCode, 'controllers', controllerName);
  }

  private async addService() {
    const serviceName = convertToPascalCase(removeExtension((await this.askQuestions('service')).elementName));

    const importType = await getImportType();

    const controllerCode =
      new ImportHandler('', importType).importToCode({ '@asenajs/asena/server': ['Service'] }, importType) +
      new ServiceHandler('').addService(serviceName).code;

    await this.generate(controllerCode, 'services', serviceName);
  }

  private async addMiddleware() {
    const controllerName = convertToPascalCase(removeExtension((await this.askQuestions('middleware')).elementName));

    const importType = await getImportType();
    const adapter = await getAdapterConfig();
    const middlewareImports = getMiddlewareImports(adapter);

    const controllerCode =
      new ImportHandler('', importType).importToCode(middlewareImports, importType) +
      new MiddlewareHandler('').addMiddleware(controllerName).addDefaultHandle(controllerName).code;

    await this.generate(controllerCode, 'middlewares', controllerName);
  }

  private async addConfig() {
    const configName = convertToPascalCase(removeExtension((await this.askQuestions('config')).elementName));

    const importType = await getImportType();
    const adapter = await getAdapterConfig();
    const configImports = getConfigImports(adapter);

    const configCode =
      new ImportHandler('', importType).importToCode(configImports, importType) +
      new ServerConfigHandler('').addConfigClass(configName).code;

    await this.generate(configCode, 'config', configName);
  }

  private async addWebSocket() {
    const wsName = convertToPascalCase(removeExtension((await this.askQuestions('websocket')).elementName));
    const wsPath = await this.askWebSocketPath(wsName);

    const importType = await getImportType();
    const websocketImports = getWebSocketImports();

    const websocketCode =
      new ImportHandler('', importType).importToCode(websocketImports, importType) +
      new WebSocketHandler('').addWebSocketNamespace(wsName, wsPath).code;

    await this.generate(websocketCode, 'namespaces', wsName);
  }

  private async generate(code: string, elementType: string, elementName: string) {
    const { sourceFolder } = await new ConfigHandler().exec();

    const basePath = `${process.cwd()}/${sourceFolder}/${elementType}`;
    const elementFilePath = `${basePath}/${elementName}.ts`;

    await $`mkdir -p ${path.normalize(basePath)}`.quiet();

    const fileExists = await Bun.file(path.normalize(elementFilePath)).exists();

    if (!fileExists) {
      await Bun.write(elementFilePath, code);
    } else {
      console.error('\x1b[31m%s\x1b[0m', `${elementName} already exists`);

      await $`rm -f ${path.normalize(basePath)}`.quiet();

      process.exit(1);
    }
  }

  private async askQuestions(element: string): Promise<GenerateOptions> {
    return inquirer.prompt([
      {
        type: 'input',
        name: 'elementName',
        message: `Enter your ${element} name:`,
        validate: (input: string) => (input ? true : 'Element name cannot be empty!'),
      },
    ]);
  }

  private async askWebSocketPath(namespaceName: string): Promise<string> {
    const defaultPath = `/${namespaceName.toLowerCase().replace(/namespace$/, '')}`;
    const { path } = await inquirer.prompt([
      {
        type: 'input',
        name: 'path',
        message: 'Enter WebSocket path (e.g., /socket):',
        default: defaultPath,
        validate: (input: string) => {
          if (!input) return 'Path cannot be empty!';
          if (!input.startsWith('/')) return 'Path must start with /';
          return true;
        },
      },
    ]);

    return path;
  }
}
