import * as fs from 'fs';
import type {Class, TsConfig} from '../types';
import {IMPORT_MODULES} from '../constants';
import stripJsonComments from 'strip-json-comments';

export enum ImportType {
  IMPORT,
  REQUIRE,
}

export const getImportType = async () => {
  if (!fs.existsSync(`${process.cwd()}/tsconfig.json`)) {
    return ImportType.REQUIRE;
  }

  const tsconfig: TsConfig = JSON.parse(stripJsonComments(await Bun.file(`${process.cwd()}/tsconfig.json`).text()));

  if (tsconfig.compilerOptions?.module && IMPORT_MODULES.includes(tsconfig.compilerOptions.module.toLowerCase())) {
    return ImportType.IMPORT;
  }

  return ImportType.REQUIRE;
};

export const importFormatter = (injections: Class[], path: string, importType: ImportType) => {
  const components = injections.map((injection) => injection.name);
  const formattedImport =
    importType === ImportType.IMPORT
      ? `import {${components.join(',')}} from './${path}'; \n`
      : `const {${components.join(',')}} = require('./${path}'); \n`;

  return { formattedImport, components };
};
