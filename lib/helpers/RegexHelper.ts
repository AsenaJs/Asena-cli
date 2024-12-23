export class RegexHelper {

  private static asenaServerRegex = /new\s+AsenaServer\s*\((?:[^()]*|\((?:[^()]*|\([^()]*\))*\))*\)/g;

  private static asenaServerCodeBlockRegex = /await\s+new\s+AsenaServer\((?:.|\n)*?\)\s*\.start\(\);/;

  private static getImportLinesRegex = /import\s+.*?from\s+['"].*?['"];?|import\s+['"].*?['"];?/g;

  private static getRequireLinesRegex = /const\s+.*?=\s+require\(['"].*?['"]\);?|require\(['"].*?['"]\)/g;

  private static getImportFileRegex = /from\s+['"]([^'"]+)['"];?|require\(['"]([^'"]+)['"]\)/g;

  private static getRequireFileRegex = /require\(['"]([^'"]+)['"]\)/g;

  private static getImportsRegex =
    /import\s+(?:type\s+)?(?:(\w+)|(?:\{\s*(type\s+)?([\w\s,{}as]*)\s*\}))?\s*from\s*['"].*?['"];?/g;

  private static getRequiresRegex = /const\s+(?:\w+|\{\s*[\w\s,]*\s*\})\s*=\s*require\(['"]([^'"]+)['"]\)/g;

  public static getAsenaServerOffset = (code: string) => {
    const regex = this.asenaServerRegex;
    const match = regex.exec(code);

    if (!match) {
      return null;
    }

    return regex.lastIndex;
  };

  public static removeAsenaServerFromCode = (code: string): string => {
    return code.replace(this.asenaServerCodeBlockRegex, '');
  };

  public static getAsenaServerCodeBlock(code: string) {
    const regex = this.asenaServerCodeBlockRegex;
    const codeBlock = regex.exec(code);

    if (!codeBlock) return null;

    return codeBlock[0];
  }

  public static getImportLines(code: string) {
    const regex = this.getImportLinesRegex;

    return code.match(regex) || [];
  }

  public static getRequireLines(code: string) {
    const regex = this.getRequireLinesRegex;

    return code.match(regex) || [];
  }

  public static getImportFromLine(code: string) {
    const regex = this.getImportsRegex;

    const matches = [...code.matchAll(regex)];

    return matches.map((match) => match[3]?.trim());
  }

  public static getRequireFromLine(code: string) {
    const regex = this.getRequiresRegex;

    const matches = [...code.matchAll(regex)];

    return matches.map((match) => match[3]?.trim());
  }

  public static getImportFilePath(code: string) {
    const regex = this.getImportFileRegex;

    const matches = [...code.matchAll(regex)];

    return matches.map((match) => match[1]?.trim());
  }

  public static getRequireFilePath(code: string) {
    const regex = this.getRequireFileRegex;

    const matches = [...code.matchAll(regex)];

    return matches.map((match) => match[1]?.trim());
  }

  public static getControllerIndexByName = (code: string, className: string): number | null => {
    const escapedClassName = className.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const regex = new RegExp(`@Controller\\(\\)\\s*export\\s+class\\s+${escapedClassName}\\s*{`);

    const match = regex.exec(code);

    if (!match) {
      return null;
    }

    const startIndex = match.index + match[0].length;
    let openBraces = 1;

    for (let i = startIndex; i < code.length; i++) {
      if (code[i] === '{') {
        openBraces++;
      } else if (code[i] === '}') {
        openBraces--;
      }

      if (openBraces === 0) {
        return i;
      }
    }

    return null;
  };

}
