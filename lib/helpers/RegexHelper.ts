export class RegexHelper {

  // Legacy patterns (v0.x) - kept for backward compatibility in detection
  private static asenaServerRegex = /new\s+AsenaServer\s*\((?:[^()]*|\((?:[^()]*|\([^()]*\))*\))*\)/g;

  private static asenaServerCodeBlockRegex =
    /await\s+new\s+AsenaServer\([^)]*\)(?:\s*\.\w+\([^)]*\))*(?:\s*\.start\((true|false)?\))?;/;

  // New patterns (v1.0.0+) - AsenaServerFactory API
  private static asenaServerFactoryCodeBlockRegex =
    /const\s+\w+\s*=\s*await\s+AsenaServerFactory\.create\s*\(\s*\{[\s\S]*?\}\s*\)\s*;[\s\S]*?await\s+\w+\.start\s*\(\s*\)\s*;/;

  private static asenaServerFactoryCreateRegex =
    /await\s+AsenaServerFactory\.create\s*\(\s*\{[\s\S]*?\}\s*\)/;

  private static getImportLinesRegex =
    /import\s*(?:(?:type\s+)?[^'"{}\n]*(?:\{[^}]*\})?[^'";\n]*)(?:\s+from)?\s*['"][^'"]+['"];?/gms;

  private static getRequireLinesRegex =
    /(?:(?:const|let|var)\s+[\s\S]*?\s*=\s*)?require\(\s*['"](?:[^'"]|\\['"])+['"]\s*\)\s*;?/gms;

  private static getImportFileRegex = /from\s*['"]([^'"]+)['"]/g;

  private static getRequireFileRegex = /require\(['"]([^'"]+)['"]\)/g;

  private static getImportsRegex =
    /import\s*(?:(?:type\s+)?(\w+)\s*(?:,\s*{\s*((?:type\s+)?[^}]+)\s*})?\s*from\s*['"]([^'"]+)['"]|(?:type\s+)?{\s*((?:type\s+)?[^}]+)\s*}\s*from\s*['"]([^'"]+)['"]|(?:type\s+)?\*\s*as\s*(\w+)\s*from\s*['"]([^'"]+)['"]|['"]([^'"]+)['"])/gms;

  private static getRequiresRegex = /const\s+([\w]+|\{\s*[\w\s,]+\s*\})\s*=\s*require\(['"]([^'"]+)['"]\)/g;

  // Legacy methods - now support both old and new patterns
  public static getAsenaServerOffset = (code: string) => {
    const regex = this.asenaServerRegex;
    const match = regex.exec(code);

    if (!match) {
      return null;
    }

    return regex.lastIndex;
  };

  /**
   * Removes AsenaServer initialization from code
   * Supports both legacy (new AsenaServer) and new (AsenaServerFactory) patterns
   */
  public static removeAsenaServerFromCode = (code: string): string => {
    // Try new pattern first
    let cleaned = code.replace(this.asenaServerFactoryCodeBlockRegex, '');

    // If nothing changed, try legacy pattern
    if (cleaned === code) {
      cleaned = code.replace(this.asenaServerCodeBlockRegex, '');
    }

    return cleaned;
  };

  /**
   * Gets AsenaServer initialization code block
   * Supports both legacy (new AsenaServer) and new (AsenaServerFactory) patterns
   */
  public static getAsenaServerCodeBlock(code: string) {
    // Try new pattern first
    const newPattern = this.asenaServerFactoryCodeBlockRegex.exec(code);

    if (newPattern) return newPattern[0];

    // Fallback to legacy pattern
    const legacyPattern = this.asenaServerCodeBlockRegex.exec(code);

    if (legacyPattern) return legacyPattern[0];

    return null;
  }

  /**
   * Gets AsenaServerFactory.create() call block
   * Only works with new v1.0.0+ pattern
   */
  public static getAsenaServerFactoryCreateBlock(code: string) {
    const match = this.asenaServerFactoryCreateRegex.exec(code);

    return match ? match[0] : null;
  }

  /**
   * Finds the position of the closing brace of the options object in AsenaServerFactory.create()
   * Returns the index right before the closing brace where new properties can be inserted
   */
  public static getAsenaServerFactoryOptionsEnd(code: string): number | null {
    const createMatch = this.asenaServerFactoryCreateRegex.exec(code);

    if (!createMatch) return null;

    const createBlock = createMatch[0];
    const openBraceIndex = createBlock.indexOf('{');

    if (openBraceIndex === -1) return null;

    // Find matching closing brace
    let depth = 0;

    for (let i = openBraceIndex; i < createBlock.length; i++) {
      if (createBlock[i] === '{') depth++;

      if (createBlock[i] === '}') {
        depth--;

        if (depth === 0) {
          // Return the global position in the original code
          return createMatch.index + i;
        }
      }
    }

    return null;
  }

  /**
   * Removes the components field from AsenaServerFactory.create() options object if it exists
   * Handles comma cleanup properly to maintain valid object syntax
   */
  public static removeComponentsFromOptions(code: string): string {
    // Pattern to match the components field in the options object
    // This handles both scenarios:
    // 1. components: [...],  (has comma after)
    // 2. , components: [...]  (has comma before)
    const componentsFieldRegex = /,\s*components\s*:\s*\[[^\]]*\]|components\s*:\s*\[[^\]]*\]\s*,?/g;

    return code.replace(componentsFieldRegex, '');
  }

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
