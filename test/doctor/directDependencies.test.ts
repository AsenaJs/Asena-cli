import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { FRAMEWORK_PACKAGES } from '../../lib/constants/framework';
import { checkDirectDependencies } from '../../lib/doctor/checks/directDependencies';

describe('checkDirectDependencies', () => {
  let projectDir: string;

  beforeEach(async () => {
    projectDir = await mkdtemp(join(tmpdir(), 'asena-doctor-deps-'));
  });

  afterEach(async () => {
    await rm(projectDir, { recursive: true, force: true });
  });

  const writeDependencies = (dependencies: Record<string, string>) =>
    writeFile(join(projectDir, 'package.json'), JSON.stringify({ dependencies }));

  const everyRequiredPackage = (): Record<string, string> =>
    Object.fromEntries(FRAMEWORK_PACKAGES.map((name) => [name, 'latest']));

  // Pinned by name: the loop below makes no assertion when the shared list is empty.
  it('requires @asenajs/asena and reflect-metadata, which the scaffold declares and the doctor checks', () => {
    expect(FRAMEWORK_PACKAGES).toContain('@asenajs/asena');
    expect(FRAMEWORK_PACKAGES).toContain('reflect-metadata');
  });

  it('passes when every package the scaffold declares is a direct dependency', async () => {
    await writeDependencies(everyRequiredPackage());

    expect((await checkDirectDependencies(projectDir)).ok).toBe(true);
  });

  // The scaffold writes FRAMEWORK_PACKAGES; the doctor must require exactly those, or a package
  // added to one and not the other leaves a freshly scaffolded project failing its own doctor.
  for (const name of FRAMEWORK_PACKAGES) {
    it(`fails when the scaffolded package ${name} is not a direct dependency`, async () => {
      const dependencies = everyRequiredPackage();

      delete dependencies[name];
      await writeDependencies(dependencies);

      const result = await checkDirectDependencies(projectDir);

      expect(result.ok).toBe(false);
      expect(result.detail).toContain(name);
    });
  }
});
