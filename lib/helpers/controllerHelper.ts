import path from 'path';
import { getMetadata } from 'reflect-metadata/no-conflict';
import { getAllFiles } from './fileHelper';
import { loadComponentConstants } from '../constants';
import type { Class, ComponentExport, ControllerPath } from '../types';

export const checkControllerExistence = (injections: ControllerPath) => {
  return Object.values(injections).some((paths) => paths.length > 0);
};

export const getControllers = async (rootFile: string, sourceFolder: string) => {
  // Load ComponentConstants from user's project node_modules
  // This ensures we use the same Symbol instances as the decorators
  const ComponentConstants = await loadComponentConstants();

  const files = getAllFiles(sourceFolder);

  const normalizedRootFile = path.normalize(rootFile);
  const sourcePrefix = path.normalize(sourceFolder).replace(/\\/g, '/');

  const seenClasses = new Set<Class>();
  const components: ControllerPath = {};

  for (const file of files) {
    if (file === normalizedRootFile || file.endsWith('.asena.js')) {
      continue;
    }

    if (file.endsWith('.ts') || file.endsWith('.js')) {
      let fileContent: Record<string, unknown>;

      try {
        fileContent = await import(path.join(process.cwd(), file));
      } catch (e) {
        throw new Error(`Failed to import ${file}: ${e instanceof Error ? e.message : String(e)}`);
      }

      let filePath = file.replace(/\\+/g, '/');

      if (filePath.startsWith(`${sourcePrefix}/`)) {
        filePath = filePath.slice(sourcePrefix.length + 1);
      }

      const exports: ComponentExport[] = [];

      for (const [exportName, value] of Object.entries(fileContent)) {
        const isComponent = (() => {
          try {
            return !!getMetadata(ComponentConstants.IOCObjectKey, value as object);
          } catch {
            return false;
          }
        })();

        if (isComponent && !seenClasses.has(value as Class)) {
          seenClasses.add(value as Class);
          exports.push({ exportName, Class: value as Class });
        }
      }

      if (exports.length > 0) {
        components[filePath] = exports;
      }
    }
  }

  return components;
};
