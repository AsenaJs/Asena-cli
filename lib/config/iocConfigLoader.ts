import type { Class, Components, ComponentsPath, IocConfig } from '../types';
import path from 'node:path';
import {getAllFiles, readJson} from '../helpers';
import {getMetadata} from 'reflect-metadata/no-conflict';
import {IOC_OBJECT_KEY} from '../constants';

export const readConfigFile = (): IocConfig => {
  const folderPath = path.join(process.cwd());
  const files: string[] = getAllFiles(folderPath);
  let config: IocConfig | null = null;

  for (const file of files) {
    if (file.endsWith('asenarc.json')) {
      config = readJson(file) as IocConfig;

      break;
    }
  }

  if (!config || !config.rootFile || !config.sourceFolder) {
    throw new Error('No config file detected or invalid format');
  }

  return config;
};

export const getInjectables = async (config: IocConfig) => {
  const files = getAllFiles(config.sourceFolder);
  const components: Components = {};

  await Promise.all(
    files.map(async (file) => {
      if ((file.endsWith('.ts') || file.endsWith('.js')) && !path.join(process.cwd(), file).endsWith(config.rootFile)) {
        let fileContent: any;

        try {
          fileContent = await import(path.join(process.cwd(), file));
        } catch (e) {
          console.log(e);

          return [];
        }

        let filePath = path.normalize(file);

        if (filePath.startsWith(config.sourceFolder)) {
          filePath = filePath.slice(config.sourceFolder.length + 1);
        }

        components[filePath] = Object.values(fileContent);

        return;
      }

      return {};
    }),
  );

  const injectionsByFile: ComponentsPath = {};

  for (const file of Object.keys(components)) {
    injectionsByFile[file] = Object.values(components[file])
      .flat()
      .filter((c) => {
        try {
          return !!getMetadata(IOC_OBJECT_KEY, c as any);
        } catch (e) {
          return false;
        }
      }) as Class[];
  }

  return injectionsByFile;
};
