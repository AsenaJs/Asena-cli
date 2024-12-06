import path from 'path';
import { getMetadata } from 'reflect-metadata/no-conflict';
import { getAllFiles } from './fileHelper';
import { IOC_OBJECT_KEY } from '../constants';
import type { Class, ControllerPath } from '../types';

export const checkControllerExistence = (injections: ControllerPath) => {
  return Object.values(injections).some((paths) => paths.length > 0);
};
export const getControllers = async (rootFile: string, sourceFolder: string) => {
  const files = getAllFiles(sourceFolder);
  const components: ControllerPath = {};

  await Promise.all(
    files.map(async (file) => {
      if ((file.endsWith('.ts') || file.endsWith('.js')) && !path.join(process.cwd(), file).endsWith(rootFile)) {
        let fileContent: any;

        try {
          fileContent = await import(path.join(process.cwd(), file));
        } catch (e) {
          console.log(e);

          return [];
        }

        let filePath = path.normalize(file);

        if (filePath.startsWith(sourceFolder)) {
          filePath = filePath.slice(sourceFolder.length + 1);
        }

        components[filePath] = Object.values(fileContent);

        return;
      }

      return {};
    }),
  );

  const injectionsByFile: ControllerPath = {};

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
