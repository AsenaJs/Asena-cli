import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { Create } from '../../lib/commands/Create';

describe('Create command CLI arguments', () => {
  it('should have correct command description', () => {
    const create = new Create();
    const command = create.command();

    expect(command).toBeDefined();

    expect(command.description()).toContain('Creates an Asena project');
  });

  it('should accept project-name argument', () => {
    const create = new Create();
    const command = create.command();

    const args = command.registeredArguments;

    expect(args).toBeDefined();

    expect(args.length).toBeGreaterThan(0);

    const projectNameArg = args.find((arg) => arg.name() === 'project-name');

    expect(projectNameArg).toBeDefined();

    expect(projectNameArg?.required).toBe(false); // Optional argument
  });

  it('should have adapter option', () => {
    const create = new Create();
    const command = create.command();

    const options = command.options;

    const adapterOption = options.find((opt) => opt.long === '--adapter');

    expect(adapterOption).toBeDefined();

    expect(adapterOption?.description).toContain('Adapter to use');
  });

  it('should have logger options', () => {
    const create = new Create();
    const command = create.command();

    const options = command.options;

    const loggerOption = options.find((opt) => opt.long === '--logger');
    const noLoggerOption = options.find((opt) => opt.long === '--no-logger');

    expect(loggerOption).toBeDefined();

    expect(noLoggerOption).toBeDefined();
  });

  it('should have eslint options', () => {
    const create = new Create();
    const command = create.command();

    const options = command.options;

    const eslintOption = options.find((opt) => opt.long === '--eslint');
    const noEslintOption = options.find((opt) => opt.long === '--no-eslint');

    expect(eslintOption).toBeDefined();

    expect(noEslintOption).toBeDefined();
  });

  it('should have prettier options', () => {
    const create = new Create();
    const command = create.command();

    const options = command.options;

    const prettierOption = options.find((opt) => opt.long === '--prettier');
    const noPrettierOption = options.find((opt) => opt.long === '--no-prettier');

    expect(prettierOption).toBeDefined();

    expect(noPrettierOption).toBeDefined();
  });

  it('should have skip-install option', () => {
    const create = new Create();
    const command = create.command();

    const options = command.options;

    const skipInstallOption = options.find((opt) => opt.long === '--skip-install');

    expect(skipInstallOption).toBeDefined();

    expect(skipInstallOption?.description).toContain('Skip dependency installation');
  });

  it('should parse all required options correctly', () => {
    const create = new Create();
    const command = create.command();

    const expectedOptions = [
      '--adapter',
      '--logger',
      '--no-logger',
      '--eslint',
      '--no-eslint',
      '--prettier',
      '--no-prettier',
      '--skip-install',
    ];

    const commandOptions = command.options.map((opt) => opt.long);

    for (const expectedOpt of expectedOptions) {
      expect(commandOptions).toContain(expectedOpt);
    }
  });
});

describe('Create command package.json generation', () => {
  let tempDir: string;

  beforeEach(async () => {
    // Create a temporary directory for each test
    tempDir = await mkdtemp(join(tmpdir(), 'asena-test-'));
  });

  afterEach(async () => {
    // Clean up after each test
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('should create package.json with basic scripts', async () => {
    const create = new Create();
    const projectPath = tempDir;

    // Call the private method using type assertion
    await (create as any).createPackageJson(projectPath);

    // Read and parse the generated package.json
    const packageJsonPath = join(projectPath, 'package.json');
    const packageJsonContent = await Bun.file(packageJsonPath).text();
    const packageJson = JSON.parse(packageJsonContent);

    // Verify basic scripts exist
    expect(packageJson.scripts).toBeDefined();
    expect(packageJson.scripts.start).toBe('bun src/index.ts');
    expect(packageJson.scripts.build).toBe('asena build');
    expect(packageJson.scripts['start:prod']).toBe('bun run dist/index.js');
  });

  it('should include eslint scripts when eslint is enabled', async () => {
    const create = new Create();
    const projectPath = tempDir;

    // Set preference to include eslint
    (create as any).preference = {
      projectName: 'TestProject',
      adapter: 'hono',
      logger: false,
      eslint: true,
      prettier: false,
    };

    await (create as any).createPackageJson(projectPath);

    const packageJsonPath = join(projectPath, 'package.json');
    const packageJsonContent = await Bun.file(packageJsonPath).text();
    const packageJson = JSON.parse(packageJsonContent);

    // Verify eslint scripts exist
    expect(packageJson.scripts.lint).toBe('eslint .');
    expect(packageJson.scripts['lint:fix']).toBe('eslint . --fix');
  });

  it('should include prettier scripts when prettier is enabled', async () => {
    const create = new Create();
    const projectPath = tempDir;

    // Set preference to include prettier
    (create as any).preference = {
      projectName: 'TestProject',
      adapter: 'hono',
      logger: false,
      eslint: false,
      prettier: true,
    };

    await (create as any).createPackageJson(projectPath);

    const packageJsonPath = join(projectPath, 'package.json');
    const packageJsonContent = await Bun.file(packageJsonPath).text();
    const packageJson = JSON.parse(packageJsonContent);

    // Verify prettier scripts exist
    expect(packageJson.scripts.format).toBe('prettier --write .');
    expect(packageJson.scripts['format:check']).toBe('prettier --check .');
  });

  it('should include combined check scripts when both eslint and prettier are enabled', async () => {
    const create = new Create();
    const projectPath = tempDir;

    // Set preference to include both eslint and prettier
    (create as any).preference = {
      projectName: 'TestProject',
      adapter: 'hono',
      logger: false,
      eslint: true,
      prettier: true,
    };

    await (create as any).createPackageJson(projectPath);

    const packageJsonPath = join(projectPath, 'package.json');
    const packageJsonContent = await Bun.file(packageJsonPath).text();
    const packageJson = JSON.parse(packageJsonContent);

    // Verify all scripts exist
    expect(packageJson.scripts.lint).toBe('eslint .');
    expect(packageJson.scripts['lint:fix']).toBe('eslint . --fix');
    expect(packageJson.scripts.format).toBe('prettier --write .');
    expect(packageJson.scripts['format:check']).toBe('prettier --check .');
    expect(packageJson.scripts.check).toBe('bun run lint && bun run format:check');
    expect(packageJson.scripts['check:fix']).toBe('bun run lint:fix && bun run format');
  });

  it('should not include eslint/prettier scripts when disabled', async () => {
    const create = new Create();
    const projectPath = tempDir;

    // Set preference to exclude both eslint and prettier
    (create as any).preference = {
      projectName: 'TestProject',
      adapter: 'hono',
      logger: false,
      eslint: false,
      prettier: false,
    };

    await (create as any).createPackageJson(projectPath);

    const packageJsonPath = join(projectPath, 'package.json');
    const packageJsonContent = await Bun.file(packageJsonPath).text();
    const packageJson = JSON.parse(packageJsonContent);

    // Verify eslint/prettier scripts do NOT exist
    expect(packageJson.scripts.lint).toBeUndefined();
    expect(packageJson.scripts['lint:fix']).toBeUndefined();
    expect(packageJson.scripts.format).toBeUndefined();
    expect(packageJson.scripts['format:check']).toBeUndefined();
    expect(packageJson.scripts.check).toBeUndefined();
    expect(packageJson.scripts['check:fix']).toBeUndefined();

    // But basic scripts should still exist
    expect(packageJson.scripts.start).toBe('bun src/index.ts');
    expect(packageJson.scripts.build).toBe('asena build');
    expect(packageJson.scripts['start:prod']).toBe('bun run dist/index.js');
  });

  it('should not include type field in package.json (CommonJS by default)', async () => {
    const create = new Create();
    const projectPath = tempDir;

    await (create as any).createPackageJson(projectPath);

    const packageJsonPath = join(projectPath, 'package.json');
    const packageJsonContent = await Bun.file(packageJsonPath).text();
    const packageJson = JSON.parse(packageJsonContent);

    // Without type field, package.json defaults to CommonJS
    expect(packageJson.type).toBeUndefined();
  });

  it('should set module field to src/index.ts', async () => {
    const create = new Create();
    const projectPath = tempDir;

    await (create as any).createPackageJson(projectPath);

    const packageJsonPath = join(projectPath, 'package.json');
    const packageJsonContent = await Bun.file(packageJsonPath).text();
    const packageJson = JSON.parse(packageJsonContent);

    expect(packageJson.module).toBe('src/index.ts');
  });

  it('should include dependencies in package.json when skipInstall is true', async () => {
    const create = new Create();
    const projectPath = tempDir;

    (create as any).preference = {
      projectName: 'TestProject',
      adapter: 'hono',
      logger: true,
      eslint: true,
      prettier: true,
    };

    await (create as any).createPackageJson(projectPath, true);

    const packageJsonPath = join(projectPath, 'package.json');
    const packageJsonContent = await Bun.file(packageJsonPath).text();
    const packageJson = JSON.parse(packageJsonContent);

    // Should have dependencies
    expect(packageJson.dependencies).toBeDefined();
    expect(packageJson.dependencies['@asenajs/asena']).toBe('latest');
    expect(packageJson.dependencies['@asenajs/hono-adapter']).toBe('latest');
    expect(packageJson.dependencies['@asenajs/asena-logger']).toBe('latest');

    // Should have devDependencies
    expect(packageJson.devDependencies).toBeDefined();
    expect(packageJson.devDependencies['@types/bun']).toBe('latest');
    expect(packageJson.devDependencies['typescript']).toBe('latest');
    expect(packageJson.devDependencies['@asenajs/asena-cli']).toBe('latest');
    expect(packageJson.devDependencies['eslint']).toBe('latest');
    expect(packageJson.devDependencies['prettier']).toBe('latest');
  });

  it('should not include dependencies when skipInstall is false', async () => {
    const create = new Create();
    const projectPath = tempDir;

    await (create as any).createPackageJson(projectPath, false);

    const packageJsonPath = join(projectPath, 'package.json');
    const packageJsonContent = await Bun.file(packageJsonPath).text();
    const packageJson = JSON.parse(packageJsonContent);

    expect(packageJson.dependencies).toBeUndefined();
    expect(packageJson.devDependencies).toBeUndefined();
  });

  it('should include ergenecore adapter when skipInstall is true with ergenecore', async () => {
    const create = new Create();
    const projectPath = tempDir;

    (create as any).preference = {
      projectName: 'TestProject',
      adapter: 'ergenecore',
      logger: false,
      eslint: false,
      prettier: false,
    };

    await (create as any).createPackageJson(projectPath, true);

    const packageJsonPath = join(projectPath, 'package.json');
    const packageJsonContent = await Bun.file(packageJsonPath).text();
    const packageJson = JSON.parse(packageJsonContent);

    expect(packageJson.dependencies['@asenajs/ergenecore']).toBe('latest');
    expect(packageJson.dependencies['@asenajs/asena-logger']).toBeUndefined();
  });
});
