import { devNull } from 'node:os';
import path from 'node:path';
import { $ } from 'bun';
import { Command } from 'commander';
import inquirer from 'inquirer';
import ora, { type Ora } from 'ora';
import { AsenaLoggerCreator, AsenaServerHandler, ControllerHandler, ImportHandler } from '../codeBuilder';
import { BUNFIG_FMT, GITIGNORE, TSCONFIG } from '../constants';
import { getAdapterFunctionName, getControllerImports, getRootImports } from '../helpers';
import { ImportType } from '../types';
import { runningCliVersion } from './cliInstall';
import { installCommands, installManifest, installSelection } from './createInstallCommands';
import { Init } from './Init';
import type { BaseCommand } from '../types/baseCommand';
import type { ProjectSetupOptions } from '../types/create';

const FMT_HEADER = /^[ \t]*\[[ \t]*fmt[ \t]*\][ \t]*(?:#.*)?$/m;

const isTable = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const fmtTable = (settings: object): Record<string, unknown> =>
  'fmt' in settings && isTable(settings.fmt) ? settings.fmt : {};

const SCAFFOLD_FMT = fmtTable(Bun.TOML.parse(BUNFIG_FMT));

const tomlValue = (value: unknown): string =>
  Array.isArray(value) ? `[${value.map(tomlValue).join(', ')}]` : JSON.stringify(value);

const fmtLine = (key: string) => `${key} = ${tomlValue(SCAFFOLD_FMT[key])}`;

export class Create implements BaseCommand {
  private preference: ProjectSetupOptions = {
    projectName: 'AsenaProject',
    adapter: 'hono',
    logger: true,
    eslint: true,
    format: true,
  };

  public command() {
    return new Command('create')
      .description('Creates an Asena project and installs the required dependencies.')
      .argument('[project-name]', 'Project name (use "." for current directory)')
      .option('--adapter <adapter>', 'Adapter to use (hono or ergenecore)')
      .option('--logger', 'Setup default asena logger')
      .option('--no-logger', 'Skip asena logger setup')
      .option('--eslint', 'Setup ESLint')
      .option('--no-eslint', 'Skip ESLint setup')
      .option('--format', 'Set up formatting with bun fmt')
      .option('--no-format', 'Skip formatting setup')
      .option('--prettier', 'Deprecated, use --format')
      .option('--no-prettier', 'Deprecated, use --no-format')
      .option('--skip-install', 'Skip dependency installation (useful for monorepos)')
      .action(async (projectName, options, command: Command) => {
        const format = this.formatFlag(options, command);
        const spinner = ora('Creating asena project...');

        try {
          // If no argument provided or '.' provided, create in current folder
          const currentFolder = !projectName || projectName === '.';

          await this.create(currentFolder, spinner, runningCliVersion(command), { ...options, format }, projectName);

          console.log('\x1b[32m%s\x1b[0m', '\nAsena project created.');

          spinner.stop();
        } catch (error) {
          spinner.stop();

          console.error('Create failed: ', error);
          process.exitCode = 1;
        }
      });
  }

  private formatFlag({ format, prettier }: { format?: boolean; prettier?: boolean }, command: Command) {
    if (prettier === undefined) return format;

    const alias = prettier ? '--prettier' : '--no-prettier';
    const replacement = prettier ? '--format' : '--no-format';

    if (format !== undefined && format !== prettier) {
      command.error(
        `error: ${format ? '--format' : '--no-format'} and ${alias} disagree (${alias} is a deprecated alias of ${replacement})`,
      );
    }

    console.warn(`${alias} is deprecated, use ${replacement} (formatting is done by bun fmt)`);

    return prettier;
  }

  private async create(currentFolder: boolean, spinner: Ora, cliVersion: string, options?: any, projectName?: string) {
    this.preference = await this.askQuestions(currentFolder, options, projectName);

    const skipInstall = options?.skipInstall === true;

    // If creating in current folder, use the current folder name as project name
    if (currentFolder) {
      this.preference.projectName = path.basename(process.cwd());
    }

    spinner.start();

    const projectPath = currentFolder ? process.cwd() : path.resolve(process.cwd(), this.preference.projectName);

    if (this.preference.format) await this.createFormatConfig(projectPath);

    await this.createPackageJson(projectPath, skipInstall);

    await this.createDefaultController(projectPath);

    if (this.preference.logger) await this.createAsenaLogger(projectPath);

    await this.createDefaultIndexFile(projectPath);

    if (!currentFolder) process.chdir(projectPath);

    if (!skipInstall) {
      await this.installPackages();
    }

    if (this.preference.eslint) await this.createEslintConfig();

    await this.createTsConfig();

    await this.createGitignore(projectPath);

    await new Init().exec(cliVersion, this.preference.adapter, skipInstall);
  }

  private async createDefaultIndexFile(projectPath: string) {
    let rootFileCode = '';
    const rootFileImports = getRootImports(this.preference.adapter);

    if (this.preference.logger) {
      rootFileImports['logger/logger'] = ['logger'];
    }

    rootFileCode = new ImportHandler(rootFileCode, ImportType.IMPORT).importToCode(rootFileImports, ImportType.IMPORT);

    const adapterFunctionName = getAdapterFunctionName(this.preference.adapter);
    const loggerArg = this.preference.logger ? 'logger' : 'console';

    if (this.preference.adapter === 'hono') {
      // Hono: createHonoAdapter(logger) returns [adapter, logger]
      rootFileCode += `\nconst [honoAdapter, asenaLogger] = ${adapterFunctionName}(${loggerArg});\n`;

      rootFileCode += new AsenaServerHandler('').createEmptyAsenaServer('honoAdapter', 'asenaLogger').asenaServer;
    } else {
      // Ergenecore: createErgenecoreAdapter({ logger }) returns adapter instance
      rootFileCode += `\nconst ergenecoreAdapter = ${adapterFunctionName}({ logger: ${loggerArg} });\n`;

      rootFileCode += new AsenaServerHandler('').createEmptyAsenaServer('ergenecoreAdapter', loggerArg).asenaServer;
    }

    await Bun.write(projectPath + '/src/index.ts', rootFileCode);
  }

  private async createAsenaLogger(projectPath: string) {
    const loggerCode = AsenaLoggerCreator.createLogger();

    await $`mkdir -p ${path.normalize(projectPath + '/src/logger')}`.quiet();

    await Bun.write(projectPath + '/src/logger/logger.ts', loggerCode);
  }

  private async createDefaultController(projectPath: string) {
    let controllerCode = '';

    const controllerImports = getControllerImports(this.preference.adapter);

    controllerCode = new ImportHandler(controllerCode, ImportType.IMPORT).importToCode(
      controllerImports,
      ImportType.IMPORT,
    );

    controllerCode += new ControllerHandler('')
      .addController('AsenaController', null)
      .addGetRouterToController('AsenaController', '', 'helloAsena');

    await $`mkdir -p ${path.normalize(projectPath + '/src/controllers')}`.quiet();

    await Bun.write(projectPath + '/src/controllers/AsenaController.ts', controllerCode);
  }

  private async createPackageJson(projectPath: string, skipInstall = false) {
    const scripts: Record<string, string> = {
      dev: 'asena dev start',
      'dev:hot': 'bun run --hot src/index.ts',
      start: 'bun src/index.ts',
      build: 'asena build',
      'start:prod': 'bun run dist/index.asena.js',
      typecheck: 'tsc --noEmit',
    };

    // Add ESLint scripts if enabled
    if (this.preference.eslint) {
      scripts['lint'] = 'eslint .';
      scripts['lint:fix'] = 'eslint . --fix';
    }

    // --no-config stops bun fmt from reading a Prettier config in a parent directory; [fmt] still applies
    if (this.preference.format) {
      scripts['format'] = 'bun fmt --no-config';
      scripts['format:check'] = 'bun fmt --check --no-config';
    }

    // Add combined check scripts if both are enabled
    if (this.preference.eslint && this.preference.format) {
      scripts['check'] = 'bun run lint && bun run format:check';
      scripts['check:fix'] = 'bun run lint:fix && bun run format';
    }

    const packageJson: Record<string, any> = {
      name: this.preference.projectName,
      module: 'src/index.ts',
      scripts,
    };

    // When skip-install is set, write dependencies directly to package.json
    // so the user can run `bun install` later
    if (skipInstall) {
      const { dependencies, devDependencies } = installManifest(installSelection(this.preference));

      packageJson['dependencies'] = dependencies;
      packageJson['devDependencies'] = { ...devDependencies, '@asenajs/asena-cli': 'latest' };
    }

    await Bun.write(projectPath + '/package.json', JSON.stringify(packageJson, null, 2) + '\n');
  }

  private async installPackages() {
    for (const command of installCommands(this.preference)) {
      await $`${command}`.quiet();
    }
  }

  private getEslintConfig(): string {
    const useFormat = this.preference.format;

    return `// @ts-check
const eslint = require('@eslint/js');
const tseslint = require('typescript-eslint');
${useFormat ? "const eslintConfigPrettier = require('eslint-config-prettier');" : ''}

module.exports = tseslint.config(
  // ESLint recommended rules
  eslint.configs.recommended,

  // TypeScript ESLint recommended rules
  ...tseslint.configs.recommendedTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
${useFormat ? '\n  // Turn off the rules that conflict with bun fmt\n  eslintConfigPrettier,\n' : ''}
  // Global ignores
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      '*.js',
      '*.mjs',
      'test/**',
      '**/*.test.ts',
      '**/*.spec.ts',
      'eslint.config.cjs',
      '*.md',
    ],
  },

  // Base configuration
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ['*.js', '*.mjs', '*.cjs'],
        },
        tsconfigRootDir: __dirname,
      },
    },
  },

  // Custom rules
  {
    rules: {
      // TypeScript rules
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/method-signature-style': 'off',

      // Relax some strict TypeScript rules for decorator metadata
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unsafe-function-type': 'off',

      // Allow empty interfaces (common in TypeScript patterns)
      '@typescript-eslint/no-empty-interface': 'off',

      // Allow require() in specific cases (Bun compatibility)
      '@typescript-eslint/no-require-imports': 'off',

      // Allow any in union types (common in adapter interfaces)
      '@typescript-eslint/no-redundant-type-constituents': 'off',

      // Allow index signatures (common in dynamic interfaces)
      '@typescript-eslint/consistent-indexed-object-style': 'off',

      // Allow async functions without await (common in interface implementations)
      '@typescript-eslint/require-await': 'off',

      // Allow flexible generic constructors
      '@typescript-eslint/consistent-generic-constructors': 'off',
    },
  },
);
`;
  }

  private async createEslintConfig() {
    const eslintConfig = this.getEslintConfig();

    await Bun.write(process.cwd() + '/eslint.config.cjs', eslintConfig);
  }

  private async createFormatConfig(projectPath: string) {
    const bunfigPath = path.join(projectPath, 'bunfig.toml');
    const bunfig = Bun.file(bunfigPath);
    const existing = (await bunfig.exists()) ? await bunfig.text() : '';

    if (!existing.trim()) {
      await Bun.write(bunfigPath, BUNFIG_FMT);

      return;
    }

    const { text, kept } = this.mergeFmtTable(existing, bunfigPath);

    await Bun.write(bunfigPath, text);

    // The kept text has its own layout, which format:check would report. --no-script and --ignore-path keep a fmt
    // script or an ignore file already in the directory from skipping it; asena create replaces .gitignore later.
    const formatted = await $`bun fmt --no-config --no-script --ignore-path=${devNull} bunfig.toml`
      .cwd(projectPath)
      .quiet()
      .nothrow();

    if (formatted.exitCode !== 0) {
      await Bun.write(bunfigPath, existing);

      throw new Error(
        `${bunfigPath} could not be formatted by bun fmt, left it unchanged:\n${formatted.stderr.toString().trim()}`,
      );
    }

    if (kept.length) {
      console.warn(
        `${bunfigPath} keeps what its [fmt] table sets for ${kept.join(', ')} (asena create sets ` +
          `${kept.map(fmtLine).join(', ')}); bun run format:check follows the table, so run bun run format if it reports the generated files`,
      );
    }
  }

  private mergeFmtTable(existing: string, bunfigPath: string): { text: string; kept: string[] } {
    let settings: object;

    try {
      settings = Bun.TOML.parse(existing);
    } catch (error) {
      throw new Error(`${bunfigPath} is not valid TOML: ${error instanceof Error ? error.message : String(error)}`);
    }

    if (!('fmt' in settings)) return { text: `${existing.trimEnd()}\n\n${BUNFIG_FMT}`, kept: [] };

    const keys = Object.keys(SCAFFOLD_FMT);
    const own = fmtTable(settings);
    const missing = keys.filter((key) => !(key in own));
    const text = missing.length
      ? existing.replace(FMT_HEADER, (header) => `${header}\n${missing.map(fmtLine).join('\n')}`)
      : existing;
    const merged = fmtTable(Bun.TOML.parse(text));

    if (keys.some((key) => !(key in merged))) {
      throw new Error(
        `${bunfigPath} defines fmt without a [fmt] header, so asena create cannot add its keys to it; ` +
          'move them under a [fmt] header or pass --no-format',
      );
    }

    return { text, kept: keys.filter((key) => !Bun.deepEquals(merged[key], SCAFFOLD_FMT[key])) };
  }

  private async createTsConfig() {
    await Bun.write(process.cwd() + '/tsconfig.json', TSCONFIG);
  }

  private async createGitignore(projectPath: string) {
    await Bun.write(path.join(projectPath, '.gitignore'), GITIGNORE);
  }

  private async askQuestions(
    currentFolder: boolean,
    options?: any,
    projectName?: string,
  ): Promise<ProjectSetupOptions> {
    // Check if we have any CLI options (non-interactive mode)
    const hasCliOptions =
      options &&
      (options.adapter !== undefined ||
        options.logger !== undefined ||
        options.eslint !== undefined ||
        options.format !== undefined);

    // If CLI options provided, use them for non-interactive mode
    if (hasCliOptions) {
      // Validate adapter if provided
      if (options.adapter && !['hono', 'ergenecore'].includes(options.adapter)) {
        throw new Error(`Invalid adapter: ${options.adapter}. Use 'hono' or 'ergenecore'.`);
      }

      return {
        projectName: projectName || 'AsenaProject',
        adapter: options.adapter || 'hono',
        logger: options.logger !== undefined ? options.logger : true,
        eslint: options.eslint !== undefined ? options.eslint : true,
        format: options.format !== undefined ? options.format : true,
      };
    }

    // Interactive mode - use inquirer prompts
    const questions: any[] = [];

    // Only ask for project name if NOT creating in current folder AND no projectName provided
    if (!currentFolder && !projectName) {
      questions.push({
        type: 'input',
        name: 'projectName',
        message: 'Enter your project name:',
        validate: (input: string) => (input ? true : 'Project name cannot be empty!'),
        default: 'AsenaProject',
      });
    }

    // Always ask these questions
    questions.push(
      {
        type: 'list',
        name: 'adapter',
        message: 'Which adapter do you want to use?',
        choices: [
          { name: 'Hono Adapter (Recommended)', value: 'hono' },
          { name: 'Ergenecore Adapter', value: 'ergenecore' },
        ],
        default: 'hono',
      },
      {
        type: 'confirm',
        name: 'logger',
        message: 'Do you want to setup default asena logger?[Yes by default]',
        default: true,
      },
      {
        type: 'confirm',
        name: 'eslint',
        message: 'Do you want to setup ESLint?[Yes by default]',
        default: true,
      },
      {
        type: 'confirm',
        name: 'format',
        message: 'Set up formatting (bun fmt)?',
        default: true,
      },
    );

    const answers: any = await inquirer.prompt(questions);

    return {
      projectName: projectName || answers.projectName || 'myApp',
      adapter: answers.adapter,
      logger: answers.logger,
      eslint: answers.eslint,
      format: answers.format,
    };
  }
}
