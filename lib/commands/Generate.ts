import fs from 'fs';
import { Command } from 'commander';
import inquirer from 'inquirer';
import { ConfigHandler, ControllerHandler, ImportHandler, MiddlewareHandler, ServiceHandler } from '../codeBuilder';
import { getImportType, removeExtension } from '../helpers';
import { convertToPascalCase } from '../helpers';
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

    return generate;
  }

  private async generateController() {
    const controllerName = convertToPascalCase(removeExtension((await this.askQuestions('controller')).elementName));

    const importType = await getImportType();

    const controllerCode =
      new ImportHandler('', importType).importToCode({ '@asenajs/asena/server': ['Controller'] }, importType) +
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

    const controllerCode =
      new ImportHandler('', importType).importToCode(
        {
          '@asenajs/asena/server': ['Middleware'],
          '@asenajs/hono-adapter': ['type Context', 'MiddlewareService'],
        },
        importType,
      ) + new MiddlewareHandler('').addMiddleware(controllerName).addDefaultHandle(controllerName).code;

    await this.generate(controllerCode, 'middlewares', controllerName);
  }

  private async generate(code: string, elementType: string, elementName: string) {
    const { sourceFolder } = await new ConfigHandler().exec();

    const basePath = `${process.cwd()}/${sourceFolder}/${elementType}`;
    const elementFilePath = `${basePath}/${elementName}.ts`;

    fs.mkdirSync(`${process.cwd()}/${sourceFolder}/controllers`, { recursive: true });

    await Bun.write(elementFilePath, code);
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

}
