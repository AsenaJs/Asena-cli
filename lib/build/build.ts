import type { IocConfig } from '../types';
import { getInjectables, readConfigFile } from '../config';
import { createBuildCode } from './buildGenerator';
import path from 'path';
import { getFileExtension } from '../helpers';
import { $, type BuildConfig, write } from 'bun';
import fs from 'fs';

const createExecutable = async (buildFilePath: string, _outfile?: string) => {
  let outfile = _outfile;

  if (!outfile) {
    outfile = 'executable';
  }

  const output = await $`bun build ${buildFilePath} --outfile ${outfile} --compile`;

  return output.stdout.toString();
};

const runBuild = async (configFile: IocConfig, entrypoint: string) => {
  if (configFile?.buildOptions) {
    let buildOptions: BuildConfig = { ...configFile.buildOptions, entrypoints: [entrypoint] };

    return await Bun.build(buildOptions);
  }

  return await Bun.build({
    entrypoints: [entrypoint],
    outdir: './out',
    target: 'bun',
  });
};

export const build = async () => {
  let buildFilePath = '';

  try {
    const configFile: IocConfig = readConfigFile();
    const injections = await getInjectables(configFile);
    const buildCode = await createBuildCode(configFile, injections);
    let buildOutput = '';

    buildFilePath = `${path.dirname(configFile.rootFile)}/index.asena${getFileExtension(configFile.rootFile)}`;

    await write(buildFilePath, buildCode);

    if (configFile.buildOptions?.executable) {
      buildOutput = await createExecutable(buildFilePath, configFile.buildOptions.outdir);
    } else {
      const output = await runBuild(configFile, buildFilePath);

      if (!output.success) {
        throw new Error(output.logs.toString());
      }

      buildOutput = output.logs.toString();
    }

    fs.unlinkSync(buildFilePath);

    console.log('Build completed successfully. ', buildOutput);
  } catch (e) {
    if (buildFilePath !== '') fs.unlinkSync(buildFilePath);

    console.error('Build failed:', e);
  }
};
