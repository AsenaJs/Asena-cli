import path from 'node:path';
import { getMetadata } from 'reflect-metadata/no-conflict';
import { ConfigHandler } from '../codeHandler';
import { IOC_OBJECT_KEY } from '../constants';
import { getAllFiles } from '../helpers';
import type { Class, ComponentsPath } from '../types';

export class InjectionHandler {

  private injectablesWithFiles: ComponentsPath = {};

  private config: ConfigHandler;

  public constructor() {
    this.config = new ConfigHandler();
  }

  public async init() {
    const files = getAllFiles(this.config.sourceFolder);
    const components: ComponentsPath = {};

    await Promise.all(
      files.map(async (file) => {
        if (
          (file.endsWith('.ts') || file.endsWith('.js')) &&
          !path.join(process.cwd(), file).endsWith(this.config.rootFile)
        ) {
          let fileContent: any;

          try {
            fileContent = await import(path.join(process.cwd(), file));
          } catch (e) {
            console.log(e);

            return [];
          }

          let filePath = path.normalize(file);

          if (filePath.startsWith(this.config.sourceFolder)) {
            filePath = filePath.slice(this.config.sourceFolder.length + 1);
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

    this.injectablesWithFiles = injectionsByFile;

    return this;
  }

  public get injections(): ComponentsPath {
    return this.injectablesWithFiles;
  }

}
