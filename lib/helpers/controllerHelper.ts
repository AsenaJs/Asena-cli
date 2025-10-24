import path from 'path';
import { getMetadata } from 'reflect-metadata/no-conflict';
import { getAllFiles } from './fileHelper';
import { loadComponentConstants } from '../constants';
import type { Class, ControllerPath } from '../types';

export const checkControllerExistence = (injections: ControllerPath) => {
  return Object.values(injections).some((paths) => paths.length > 0);
};

export const getControllers = async (rootFile: string, sourceFolder: string) => {
  // Load ComponentConstants from user's project node_modules
  // This ensures we use the same Symbol instances as the decorators
  const ComponentConstants = await loadComponentConstants();

  const files = getAllFiles(sourceFolder);

  const components: ControllerPath = {};

  for (const file of files) {
    const relative = path.relative(file, rootFile);

    if (relative === '' && file === path.normalize(rootFile)) {
      continue;
    }

    if (file.endsWith('.ts') || file.endsWith('.js')) {
      let fileContent: any;

      try {
        fileContent = await import(path.join(process.cwd(), file));
      } catch {
        continue;
      }

      let filePath = file.replace(/\\+/g, '/');

      if (filePath.startsWith(sourceFolder)) {
        filePath = filePath.slice(sourceFolder.length + 1);
      }

      components[filePath] = Object.values(fileContent);
    }
  }

  const injectionsByFile: ControllerPath = {};

  for (const file of Object.keys(components)) {
    injectionsByFile[file] = Object.values(components[file])
      .flat()
      .filter((c) => {
        try {
          return !!getMetadata(ComponentConstants.IOCObjectKey, c as any);
        } catch {
          return false;
        }
      }) as Class[];
  }

  return injectionsByFile;
};
