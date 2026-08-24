export class RegexHelper {
  private static getImportLinesRegex =
    /import\s*(?:(?:type\s+)?[^'"{}\n]*(?:\{[^}]*\})?[^'";\n]*)(?:\s+from)?\s*['"][^'"]+['"];?/gms;

  private static getRequireLinesRegex =
    /(?:(?:const|let|var)\s+[\s\S]*?\s*=\s*)?require\(\s*['"](?:[^'"]|\\['"])+['"]\s*\)\s*;?/gms;

  private static getImportFileRegex = /from\s*['"]([^'"]+)['"]/g;

  private static getRequireFileRegex = /require\(['"]([^'"]+)['"]\)/g;

  private static getImportsRegex =
    /import\s*(?:(?:type\s+)?(\w+)\s*(?:,\s*{\s*((?:type\s+)?[^}]+)\s*})?\s*from\s*['"]([^'"]+)['"]|(?:type\s+)?{\s*((?:type\s+)?[^}]+)\s*}\s*from\s*['"]([^'"]+)['"]|(?:type\s+)?\*\s+as\s*(\w+)\s*from\s*['"]([^'"]+)['"]|['"]([^'"]+)['"])/gms;

  private static getRequiresRegex = /const\s+([\w]+|\{\s*[\w\s,]+\s*})\s*=\s*require\(['"]([^'"]+)['"]\)/g;

  public static getImportLines(code: string) {
    const regex = this.getImportLinesRegex;

    return code.match(regex) || [];
  }

  public static getRequireLines(code: string) {
    const regex = this.getRequireLinesRegex;

    return code.match(regex) || [];
  }

  /**
   * Extracts import names from import statements
   * Handles multiple import patterns:
   * - import Foo from 'path' -> ['Foo']
   * - import { Foo, Bar } from 'path' -> ['Foo', 'Bar']
   * - import * as Foo from 'path' -> ['Foo']
   * - import Foo, { Bar } from 'path' -> ['Foo', 'Bar']
   */
  public static getImportFromLine(code: string) {
    const regex = this.getImportsRegex;
    const matches = [...code.matchAll(regex)];

    return matches.flatMap((match) => {
      const imports: string[] = [];

      // Pattern 1: import Foo, { Bar } from 'path'
      if (match[1]) imports.push(match[1].trim());

      if (match[2]) imports.push(...match[2].split(',').map((s) => s.trim().replace(/^type\s+/, '')));

      // Pattern 2: import { Foo, Bar } from 'path' (most common)
      if (match[4]) imports.push(...match[4].split(',').map((s) => s.trim().replace(/^type\s+/, '')));

      // Pattern 3: import * as Foo from 'path'
      if (match[6]) imports.push(match[6].trim());

      // Pattern 4: import 'path' (side effect, no names)
      // match[8] - no imports to extract

      return imports;
    });
  }

  /**
   * Extracts required names from require statements
   * - const { Foo } = require('path') -> ['Foo']
   * - const Foo = require('path') -> ['Foo']
   */
  public static getRequireFromLine(code: string) {
    const regex = this.getRequiresRegex;
    const matches = [...code.matchAll(regex)];

    return matches.flatMap((match) => {
      const importName = match[1]?.trim();

      if (!importName) return [];

      // Destructured: const { Foo, Bar } = require(...)
      if (importName.startsWith('{') && importName.endsWith('}')) {
        return importName
          .slice(1, -1)
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
      }

      // Simple: const Foo = require(...)
      return [importName];
    });
  }

  /**
   * Extracts file paths from import statements
   * Uses simple regex to just extract the 'from' path
   */
  public static getImportFilePath(code: string) {
    const regex = this.getImportFileRegex;
    const matches = [...code.matchAll(regex)];

    return matches.map((match) => match[1]?.trim()).filter(Boolean);
  }

  /**
   * Extracts file paths from require statements
   */
  public static getRequireFilePath(code: string) {
    const regex = this.getRequireFileRegex;
    const matches = [...code.matchAll(regex)];

    return matches.map((match) => match[1]?.trim()).filter(Boolean);
  }

  public static getElementIndexByName = (code: string, elementType: string, className: string): number | null => {
    const escapedClassName = className.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const regex = new RegExp(
      `@${elementType}\\(\\)\\s*export\\s+class\\s+${escapedClassName}(?:\\s+extends\\s+(\\w+)(?:,\\s*(\\w+))*)?\\s*{`,
    );

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
