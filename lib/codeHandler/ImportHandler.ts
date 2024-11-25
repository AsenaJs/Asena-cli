import { RegexUtils } from '../helpers';
import { ImportType } from '../types';
import type { ImportsByFiles } from '../types';

export class ImportHandler {

  private importsByFile: ImportsByFiles = {};

  private allImports: string[] = [];

  private readonly importType: ImportType;

  private code: string;

  public constructor(code: string, importType: ImportType) {
    this.code = code;

    this.importType = importType;

    this.init();
  }

  public updateImportName() {}

  public removeFromImports() {}

  public searchForImports() {}

  public isImportExists() {}

  public get getImports() {
    return this.allImports;
  }

  public importToCode(importsByFile: ImportsByFiles, importType: ImportType) {
    let imports = '';

    for (const importFilePath of Object.keys(importsByFile)) {
      if (!importFilePath.includes('.asena.') && importsByFile[importFilePath].length > 0) {
        if (this.importsByFile[importFilePath]?.some((_import) => !importsByFile[importFilePath].includes(_import))) {
          throw new Error('component already exists');
        }

        if (this.importsByFile[importFilePath]) {
          this.importsByFile[importFilePath].concat(importsByFile[importFilePath]);
        } else {
          this.importsByFile[importFilePath] = importsByFile[importFilePath];
        }

        imports += this.importFormatter(importsByFile[importFilePath], importFilePath, importType);
      }

      this.allImports = this.allImports.concat(importsByFile[importFilePath]);
    }

    this.code = imports + this.code;

    return this.code;
  }

  private importFormatter(imports: string[], filePath: string, importType: ImportType) {
    return importType === ImportType.IMPORT
      ? `import {${imports.join(',')}} from '${filePath.startsWith('@') ? '' : './'}${filePath}'; \n`
      : `const {${imports.join(',')}} = require('./${filePath}'); \n`;
  }

  private init() {
    let _importsByFile: ImportsByFiles = {};
    let _allImports: string[] = [];

    const importLines =
      this.importType === ImportType.IMPORT
        ? RegexUtils.getImportLines(this.code)
        : RegexUtils.getRequireLines(this.code);

    const importAndFiles = importLines.map((line) => {
      return this.importType === ImportType.IMPORT
        ? [RegexUtils.getImportFromLine(line), RegexUtils.getImportFilePath(line)]
        : [RegexUtils.getRequireFromLine(line), RegexUtils.getRequireFilePath(line)];
    });

    for (const [imports, filePaths] of importAndFiles) {
      const filePath = filePaths[0];

      _allImports = _allImports.concat(imports);

      _importsByFile[filePath] = _importsByFile[filePath] ? _importsByFile[filePath].concat(imports) : imports;
    }

    this.importsByFile = _importsByFile;

    this.allImports = _allImports;
  }

}
