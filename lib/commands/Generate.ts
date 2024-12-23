import fs from 'fs';
import { Command } from 'commander';
import inquirer from 'inquirer';
import { ConfigHandler, ControllerHandler, ImportHandler } from '../codeBuilder';
import { getImportType, removeExtension } from '../helpers';
import type { BaseCommand } from '../types/baseCommand';
import type { GenerateOptions } from '../types/generate';

export class Generate implements BaseCommand {

  public command() {
    return new Command('generate')
      .description('For building the project and preparing it for production deployment')
      .action(async () => {
        try {
          await this.addController();
        } catch (error) {
          console.error('Build failed: ', error);
        }
      });
  }

  private async addController() {
    const controllerName = removeExtension((await this.askQuestions('controller')).elementName);
    const { sourceFolder } = await new ConfigHandler().exec();
    const basePath = `${process.cwd()}/${sourceFolder}/${controllerName}`;
    const controllerFilePath = `${basePath}/${controllerName}.ts`;

    const importType = await getImportType();
    const controllerCode =
      new ImportHandler('', importType).importToCode({ '@asenajs/asena/server': ['Controller'] }, importType) +
      new ControllerHandler('').addController(controllerName, null).code;

    fs.mkdirSync(basePath, { recursive: true });

    await Bun.write(controllerFilePath, controllerCode);
  }

  /* private addService() {}

  private addMiddleware() {} */

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
