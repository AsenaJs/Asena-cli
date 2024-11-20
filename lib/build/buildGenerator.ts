import type { Components } from '../types';
import { getImportType, importFormatter, type ImportType } from './importManager';

const buildFileGenerator = (code: string, injections: Components, importType: ImportType) => {
  let allComponents: string[][] = [];
  let imports = '\n';

  for (const path of Object.keys(injections)) {
    if (injections[path].length > 0) {
      const { formattedImport, components } = importFormatter(injections[path], path, importType);

      if (!path.includes('.asena.')) imports += formattedImport;

      allComponents.push(components);
    }
  }

  return { newCode: imports + code, allComponents };
};

const findNewServerFunctionOffset = (code: string) => {
  const regex = /new\s+AsenaServer\s*\([\s\S]*?\)/gm;
  const match = regex.exec(code);

  if (!match) {
    throw new Error('No Server function found, please check your rootFile and .asenarc.json');
  }

  return regex.lastIndex;
};

export const importComponentsToServer = (asenaEntry: string, allComponents: string[]) => {
  const endIndex = findNewServerFunctionOffset(asenaEntry);
  const componentsString = allComponents.join(',');

  return `${asenaEntry.substring(0, endIndex)}.components([${componentsString}])${asenaEntry.substring(endIndex)}`;
};

export const createBuildCode = async (code: string, injections: Components, asenaEntry: string) => {
  const importType = await getImportType();
  const { newCode, allComponents } = buildFileGenerator(code, injections, importType);

  return newCode + importComponentsToServer(asenaEntry, allComponents.flat(1));
};
