import fs from 'fs';
import stripJsonComments from 'strip-json-comments';
import { IMPORT_MODULES } from '../constants';
import { ImportType, type TsConfig } from '../types';

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
