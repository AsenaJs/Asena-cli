import fs from 'fs';
import path from 'node:path';
import { $ } from 'bun';
import { CreateCliHandler } from '../cli/CreateCliHandler';
import { AsenaServerHandler, ControllerHandler, ImportHandler } from '../codeHandler';
import {
  CONTROLLER_IMPORTS,
  ESLINT,
  ESLINT_IGNORE,
  ESLINT_INSTALLATIONS,
  PRETTIER,
  PRETTIER_INSTALLATIONS,
  ROOT_FILE_IMPORTS,
  TSCONFIG,
} from '../constants';
import { ImportType } from '../types';
import { InitHandler } from './InitHandler';
import type { ProjectSetupOptions } from '../types/create';

export class CreateHandler {

  private preference: ProjectSetupOptions = {
    projectName: 'AsenaProject',
    eslint: true,
    prettier: true,
  };

  public async init() {
    this.preference = await new CreateCliHandler().askProjectName();

    return this;
  }

  public async create() {
    const projectPath = path.resolve(process.cwd(), this.preference.projectName);

    await this.createPackageJson(projectPath);

    await this.createDefaultController(projectPath);

    this.createDefaultIndexFile(projectPath);

    process.chdir(projectPath);

    await this.installPreRequests();

    if (this.preference.eslint) await this.installAndCreateEslint();

    if (this.preference.prettier) await this.installAndCreatePrettier();

    await this.createTsConfig();

    await new InitHandler().init();
  }

  private createDefaultIndexFile(projectPath: string) {
    let rootFileCode = '';

    rootFileCode = new ImportHandler(rootFileCode, ImportType.IMPORT).importToCode(
      ROOT_FILE_IMPORTS,
      ImportType.IMPORT,
    );

    rootFileCode += new AsenaServerHandler('').createEmptyAsenaServer().addComponents(['AsenaController']);

    fs.writeFileSync(projectPath + '/src/index.ts', rootFileCode);
  }

  private async createDefaultController(projectPath: string) {
    let controllerCode = '';

    controllerCode = new ImportHandler(controllerCode, ImportType.IMPORT).importToCode(
      CONTROLLER_IMPORTS,
      ImportType.IMPORT,
    );

    controllerCode += new ControllerHandler('')
      .addController('AsenaController', null)
      .addGetRouterToController('AsenaController', 'hello-asena', 'helloAsena');

    fs.mkdirSync(projectPath + '/src/controllers', { recursive: true });

    await Bun.write(projectPath + '/src/controllers/AsenaController.ts', controllerCode);
  }

  private async createPackageJson(projectPath: string) {
    const packageJsonFile = `{
      "name":"${this.preference.projectName}",
      "module":"src/index.ts",
      "type":"module"
    }`;

    await Bun.write(projectPath + '/package.json', packageJsonFile);
  }

  private async installPreRequests() {
    await $`bun add @asenajs/asena hono winston`.quiet();

    await $`bun add -D @types/bun typescript`.quiet();
  }

  private async installAndCreateEslint() {
    const output = await $`bun add -D ${ESLINT_INSTALLATIONS}`.quiet();

    if (output.exitCode !== 0) return;

    await Bun.write(process.cwd() + '/.eslintrc.js', ESLINT);

    await Bun.write(process.cwd() + '/.eslintignore', ESLINT_IGNORE);

    return output.stderr.toString() === '';
  }

  private async installAndCreatePrettier() {
    const output = await $`bun add -D ${PRETTIER_INSTALLATIONS}`.quiet();

    await Bun.write(process.cwd() + '/.prettierrc.js', PRETTIER);

    return output.stderr.toString() === '';
  }

  private async createTsConfig() {
    await Bun.write(process.cwd() + '/tsconfig.json', TSCONFIG);
  }

}
