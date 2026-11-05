import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { scanComponents } from '../../lib/console/scan';
import { copySampleApp } from '../utils/fixtureCopy';

const scan = async (root: string) => {
  const components = await scanComponents({ root, sourceFolder: 'src', rootFile: path.join('src', 'index.ts') });

  return Object.fromEntries(
    Object.entries(components).map(([file, exports]) => [file, exports.map((entry) => entry.exportName)]),
  );
};

describe('component scan for the console', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'asena-console-scan-'));
    copySampleApp(root);
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('sees an export that a rescanned file imports from another changed file', async () => {
    const service = path.join(root, 'src', 'services', 'TestService.ts');
    const controller = path.join(root, 'src', 'controllers', 'TestController.ts');
    const original = fs.readFileSync(controller, 'utf-8');

    fs.writeFileSync(
      controller,
      `import { TestService } from '../services/TestService';\n${original}\nexport const serviceName = TestService.name;\n`,
    );

    expect(await scan(root)).toEqual({
      'controllers/TestController.ts': ['TestController'],
      'services/TestService.ts': ['TestService'],
    });

    fs.appendFileSync(service, "\nexport const GREETING = 'hello';\n");
    fs.writeFileSync(
      controller,
      `import { GREETING } from '../services/TestService';\n${original}\nexport const greeting = GREETING;\n`,
    );

    expect(await scan(root)).toEqual({
      'controllers/TestController.ts': ['TestController'],
      'services/TestService.ts': ['TestService'],
    });
  });

  it('sees a component added to an already scanned file', async () => {
    await scan(root);

    fs.appendFileSync(
      path.join(root, 'src', 'services', 'TestService.ts'),
      "\n@Service('ExtraService')\nexport class ExtraService {}\n",
    );

    expect((await scan(root))['services/TestService.ts']?.sort()).toEqual(['ExtraService', 'TestService']);
  });

  it('rejects with the file that failed to import', async () => {
    fs.writeFileSync(path.join(root, 'src', 'broken.ts'), "throw new Error('kaboom in component file');\n");

    await expect(scan(root)).rejects.toThrow(/broken\.ts.*kaboom/);
  });

  it('leaves the cwd of the CLI process alone', async () => {
    const cwd = process.cwd();

    await scan(root);

    expect(process.cwd()).toBe(cwd);
  });
});
