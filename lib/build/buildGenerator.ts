import type { Components, IocConfig } from '../types';
import fs from 'fs';
import { getImportType, importFormatter, type ImportType } from './importManager';

const buildFileGenerator = (mainFilePath: IocConfig, injections: Components, importType: ImportType) => {
  const mainFile = fs.readFileSync(mainFilePath.rootFile, 'utf-8');
  let allComponents: string[][] = [];
  let imports = '\n';

  for (const path of Object.keys(injections)) {
    if (injections[path].length > 0) {
      const { formattedImport, components } = importFormatter(injections[path], path, importType);

      imports += formattedImport;

      allComponents.push(components);
    }
  }

  return { newCode: imports + mainFile, allComponents };
};

const findNewServerFunctionOffset = (code: string) => {
  const regex = /new\s+AsenaServer\s*\([\s\S]*?\)/gm;
  const match = regex.exec(code);

  if (!match) {
    throw new Error('No Server function found, please check your rootFile and .asenarc.json');
  }

  return regex.lastIndex;
};

export const importComponentsToServer = (code: string, allComponents: string[]) => {
  const endIndex = findNewServerFunctionOffset(code);
  const componentsString = allComponents.join(',');

  return `${code.substring(0, endIndex)}.components([${componentsString}])${code.substring(endIndex)}`;
};

export const createBuildCode = async (mainFilePath: IocConfig, injections: Components) => {
  const importType = await getImportType();
  const { newCode, allComponents } = buildFileGenerator(mainFilePath, injections, importType);

  return importComponentsToServer(newCode, allComponents.flat(1));
};
