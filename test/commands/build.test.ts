import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { Build } from '../../lib/commands/Build';
import { findAsenaJsFiles, FIXTURE_DIR } from '../utils/fixtureCopy';

const TMP_DIR = path.join(import.meta.dir, '../.tmp-build-test');

function setupTmpDir() {
  fs.mkdirSync(TMP_DIR, { recursive: true });
}

function cleanupTmpDir() {
  if (fs.existsSync(TMP_DIR)) {
    fs.rmSync(TMP_DIR, { recursive: true, force: true });
  }
}

describe('Build', () => {
  describe('copyIncludedAssets', () => {
    let build: Build;

    beforeEach(() => {
      build = new Build();
      setupTmpDir();
    });

    afterEach(() => {
      cleanupTmpDir();
    });

    it('should copy a directory recursively to outdir', async () => {
      // Create source structure: public/css/style.css, public/index.html
      const publicDir = path.join(TMP_DIR, 'public');
      const cssDir = path.join(publicDir, 'css');

      fs.mkdirSync(cssDir, { recursive: true });
      fs.writeFileSync(path.join(publicDir, 'index.html'), '<html>test</html>');
      fs.writeFileSync(path.join(cssDir, 'style.css'), 'body { color: red; }');

      const outdir = path.join(TMP_DIR, 'dist');

      fs.mkdirSync(outdir, { recursive: true });

      // Access private method via bracket notation
      build['configFile'] = {
        rootFile: 'src/index.ts',
        sourceFolder: 'src',
        include: ['public'],
        buildOptions: { outdir },
      };

      // Save and restore cwd since copyIncludedAssets uses process.cwd()
      const originalCwd = process.cwd();

      process.chdir(TMP_DIR);

      try {
        await build['copyIncludedAssets']();
      } finally {
        process.chdir(originalCwd);
      }

      // Verify files were copied
      expect(fs.existsSync(path.join(outdir, 'public', 'index.html'))).toBe(true);
      expect(fs.existsSync(path.join(outdir, 'public', 'css', 'style.css'))).toBe(true);

      // Verify content
      const htmlContent = fs.readFileSync(path.join(outdir, 'public', 'index.html'), 'utf-8');

      expect(htmlContent).toBe('<html>test</html>');

      const cssContent = fs.readFileSync(path.join(outdir, 'public', 'css', 'style.css'), 'utf-8');

      expect(cssContent).toBe('body { color: red; }');
    });

    it('should copy a single file to outdir', async () => {
      fs.writeFileSync(path.join(TMP_DIR, 'config.json'), '{"key": "value"}');

      const outdir = path.join(TMP_DIR, 'dist');

      fs.mkdirSync(outdir, { recursive: true });

      build['configFile'] = {
        rootFile: 'src/index.ts',
        sourceFolder: 'src',
        include: ['config.json'],
        buildOptions: { outdir },
      };

      const originalCwd = process.cwd();

      process.chdir(TMP_DIR);

      try {
        await build['copyIncludedAssets']();
      } finally {
        process.chdir(originalCwd);
      }

      expect(fs.existsSync(path.join(outdir, 'config.json'))).toBe(true);

      const content = fs.readFileSync(path.join(outdir, 'config.json'), 'utf-8');

      expect(content).toBe('{"key": "value"}');
    });

    it('should skip non-existent paths with a warning', async () => {
      const outdir = path.join(TMP_DIR, 'dist');

      fs.mkdirSync(outdir, { recursive: true });

      build['configFile'] = {
        rootFile: 'src/index.ts',
        sourceFolder: 'src',
        include: ['nonexistent-dir'],
        buildOptions: { outdir },
      };

      const originalCwd = process.cwd();

      process.chdir(TMP_DIR);

      try {
        // Should not throw
        await build['copyIncludedAssets']();
      } finally {
        process.chdir(originalCwd);
      }

      // outdir should still exist but be empty (no crash)
      expect(fs.existsSync(outdir)).toBe(true);
    });

    it('should do nothing when include is empty', async () => {
      const outdir = path.join(TMP_DIR, 'dist');

      fs.mkdirSync(outdir, { recursive: true });

      build['configFile'] = {
        rootFile: 'src/index.ts',
        sourceFolder: 'src',
        include: [],
        buildOptions: { outdir },
      };

      // Should not throw
      await build['copyIncludedAssets']();
    });

    it('should do nothing when include is undefined', async () => {
      build['configFile'] = {
        rootFile: 'src/index.ts',
        sourceFolder: 'src',
        buildOptions: { outdir: path.join(TMP_DIR, 'dist') },
      };

      // Should not throw
      await build['copyIncludedAssets']();
    });
  });

  describe('createHTMLPlugin', () => {
    it('should return a BunPlugin with correct name and htmlImports map', () => {
      const build = new Build();
      const { plugin, htmlImports } = build['createHTMLPlugin']();

      expect(plugin.name).toBe('asena-html-resolver');
      expect(plugin.setup).toBeFunction();
      expect(htmlImports).toBeInstanceOf(Map);
      expect(htmlImports.size).toBe(0);
    });

    it('should collect html imports when onResolve is triggered', () => {
      const build = new Build();
      const { plugin, htmlImports } = build['createHTMLPlugin']();

      // Create a real HTML file so the plugin can verify it exists
      const htmlDir = path.join(TMP_DIR, 'public');

      fs.mkdirSync(htmlDir, { recursive: true });
      fs.writeFileSync(path.join(htmlDir, 'test.html'), '<html></html>');

      // Simulate what Bun's build.onResolve does
      let resolveCallback: (args: { path: string; importer: string }) => { path: string; external: boolean };

      const fakeBuild = {
        onResolve: (_filter: unknown, cb: typeof resolveCallback) => {
          resolveCallback = cb;
        },
      };

      plugin.setup(fakeBuild as never);

      const originalCwd = process.cwd();

      process.chdir(TMP_DIR);

      try {
        // ../../public/test.html from src/controllers/ resolves to public/test.html
        const result = resolveCallback!({
          path: '../../public/test.html',
          importer: path.join(TMP_DIR, 'src', 'controllers', 'Frontend.ts'),
        });

        expect(result.external).toBe(true);
        expect(result.path).toBe('./public/test.html');
        expect(htmlImports.size).toBe(1);
        expect(htmlImports.get('../../public/test.html')).toBe('./public/test.html');
      } finally {
        process.chdir(originalCwd);
      }
    });

    it('should throw when HTML file does not exist', () => {
      const build = new Build();
      const { plugin } = build['createHTMLPlugin']();

      let resolveCallback: (args: { path: string; importer: string }) => { path: string; external: boolean };

      const fakeBuild = {
        onResolve: (_filter: unknown, cb: typeof resolveCallback) => {
          resolveCallback = cb;
        },
      };

      plugin.setup(fakeBuild as never);

      expect(() =>
        resolveCallback!({
          path: './nonexistent.html',
          importer: path.join(TMP_DIR, 'src', 'index.ts'),
        }),
      ).toThrow('HTML file not found');
    });

    it('should handle deeply nested HTML imports', () => {
      const build = new Build();
      const { plugin, htmlImports } = build['createHTMLPlugin']();

      const htmlDir = path.join(TMP_DIR, 'src', 'frontend', 'pages');

      fs.mkdirSync(htmlDir, { recursive: true });
      fs.writeFileSync(path.join(htmlDir, 'dashboard.html'), '<html></html>');

      let resolveCallback: (args: { path: string; importer: string }) => { path: string; external: boolean };

      const fakeBuild = {
        onResolve: (_filter: unknown, cb: typeof resolveCallback) => {
          resolveCallback = cb;
        },
      };

      plugin.setup(fakeBuild as never);

      const originalCwd = process.cwd();

      process.chdir(TMP_DIR);

      try {
        const result = resolveCallback!({
          path: '../../frontend/pages/dashboard.html',
          importer: path.join(TMP_DIR, 'src', 'controllers', 'sub', 'Frontend.ts'),
        });

        expect(result.path).toBe('./src/frontend/pages/dashboard.html');
        expect(htmlImports.get('../../frontend/pages/dashboard.html')).toBe('./src/frontend/pages/dashboard.html');
      } finally {
        process.chdir(originalCwd);
      }
    });

    it('should handle multiple HTML imports from different source files', () => {
      const build = new Build();
      const { plugin, htmlImports } = build['createHTMLPlugin']();

      const publicDir = path.join(TMP_DIR, 'public');
      const pagesDir = path.join(TMP_DIR, 'src', 'pages');

      fs.mkdirSync(publicDir, { recursive: true });
      fs.mkdirSync(pagesDir, { recursive: true });
      fs.writeFileSync(path.join(publicDir, 'home.html'), '<html>home</html>');
      fs.writeFileSync(path.join(pagesDir, 'about.html'), '<html>about</html>');

      let resolveCallback: (args: { path: string; importer: string }) => { path: string; external: boolean };

      const fakeBuild = {
        onResolve: (_filter: unknown, cb: typeof resolveCallback) => {
          resolveCallback = cb;
        },
      };

      plugin.setup(fakeBuild as never);

      const originalCwd = process.cwd();

      process.chdir(TMP_DIR);

      try {
        resolveCallback!({
          path: '../../public/home.html',
          importer: path.join(TMP_DIR, 'src', 'controllers', 'HomeController.ts'),
        });

        resolveCallback!({
          path: '../pages/about.html',
          importer: path.join(TMP_DIR, 'src', 'controllers', 'AboutController.ts'),
        });

        expect(htmlImports.size).toBe(2);
        expect(htmlImports.get('../../public/home.html')).toBe('./public/home.html');
        expect(htmlImports.get('../pages/about.html')).toBe('./src/pages/about.html');
      } finally {
        process.chdir(originalCwd);
      }
    });
  });

  describe('rewriteHTMLImports', () => {
    let build: Build;

    beforeEach(() => {
      build = new Build();
      setupTmpDir();
    });

    afterEach(() => {
      cleanupTmpDir();
    });

    it('should rewrite HTML import paths in JS output files', () => {
      const outdir = path.join(TMP_DIR, 'dist');

      fs.mkdirSync(outdir, { recursive: true });
      fs.writeFileSync(path.join(outdir, 'index.asena.js'), 'function load(){return import("../../public/test.html")}');

      const htmlImports = new Map([['../../public/test.html', './public/test.html']]);

      build['rewriteHTMLImports'](outdir, htmlImports);

      const result = fs.readFileSync(path.join(outdir, 'index.asena.js'), 'utf-8');

      expect(result).toBe('function load(){return import("./public/test.html")}');
    });

    it('should rewrite multiple different HTML imports', () => {
      const outdir = path.join(TMP_DIR, 'dist');

      fs.mkdirSync(outdir, { recursive: true });
      fs.writeFileSync(
        path.join(outdir, 'index.asena.js'),
        [
          'function home(){return import("../../public/home.html")}',
          'function about(){return import("../pages/about.html")}',
        ].join('\n'),
      );

      const htmlImports = new Map([
        ['../../public/home.html', './public/home.html'],
        ['../pages/about.html', './src/pages/about.html'],
      ]);

      build['rewriteHTMLImports'](outdir, htmlImports);

      const result = fs.readFileSync(path.join(outdir, 'index.asena.js'), 'utf-8');

      expect(result).toContain('import("./public/home.html")');
      expect(result).toContain('import("./src/pages/about.html")');
      expect(result).not.toContain('../../public/home.html');
      expect(result).not.toContain('../pages/about.html');
    });

    it('should rewrite all occurrences of the same import', () => {
      const outdir = path.join(TMP_DIR, 'dist');

      fs.mkdirSync(outdir, { recursive: true });
      fs.writeFileSync(
        path.join(outdir, 'index.asena.js'),
        'import("../../public/a.html");import("../../public/a.html");import("../../public/a.html")',
      );

      const htmlImports = new Map([['../../public/a.html', './public/a.html']]);

      build['rewriteHTMLImports'](outdir, htmlImports);

      const result = fs.readFileSync(path.join(outdir, 'index.asena.js'), 'utf-8');

      expect(result).toBe('import("./public/a.html");import("./public/a.html");import("./public/a.html")');
    });

    it('should not modify files without HTML imports', () => {
      const outdir = path.join(TMP_DIR, 'dist');

      fs.mkdirSync(outdir, { recursive: true });

      const originalContent = 'const x = 1; export default x;';

      fs.writeFileSync(path.join(outdir, 'index.asena.js'), originalContent);

      const htmlImports = new Map([['../../public/test.html', './public/test.html']]);

      build['rewriteHTMLImports'](outdir, htmlImports);

      const result = fs.readFileSync(path.join(outdir, 'index.asena.js'), 'utf-8');

      expect(result).toBe(originalContent);
    });

    it('should only process .js files', () => {
      const outdir = path.join(TMP_DIR, 'dist');

      fs.mkdirSync(outdir, { recursive: true });

      const jsContent = 'import("../../public/test.html")';
      const cssContent = '/* import("../../public/test.html") */';

      fs.writeFileSync(path.join(outdir, 'index.asena.js'), jsContent);
      fs.writeFileSync(path.join(outdir, 'styles.css'), cssContent);

      const htmlImports = new Map([['../../public/test.html', './public/test.html']]);

      build['rewriteHTMLImports'](outdir, htmlImports);

      // JS file should be rewritten
      const jsResult = fs.readFileSync(path.join(outdir, 'index.asena.js'), 'utf-8');

      expect(jsResult).toBe('import("./public/test.html")');

      // CSS file should be untouched
      const cssResult = fs.readFileSync(path.join(outdir, 'styles.css'), 'utf-8');

      expect(cssResult).toBe(cssContent);
    });

    it('should handle empty outdir gracefully', () => {
      const outdir = path.join(TMP_DIR, 'dist');

      fs.mkdirSync(outdir, { recursive: true });

      const htmlImports = new Map([['../../public/test.html', './public/test.html']]);

      // Should not throw
      build['rewriteHTMLImports'](outdir, htmlImports);
    });

    it('should handle empty htmlImports map', () => {
      const outdir = path.join(TMP_DIR, 'dist');

      fs.mkdirSync(outdir, { recursive: true });
      fs.writeFileSync(path.join(outdir, 'index.asena.js'), 'const x = 1;');

      const htmlImports = new Map<string, string>();

      build['rewriteHTMLImports'](outdir, htmlImports);

      const result = fs.readFileSync(path.join(outdir, 'index.asena.js'), 'utf-8');

      expect(result).toBe('const x = 1;');
    });

    it('should preserve non-HTML import strings in the file', () => {
      const outdir = path.join(TMP_DIR, 'dist');

      fs.mkdirSync(outdir, { recursive: true });
      fs.writeFileSync(
        path.join(outdir, 'index.asena.js'),
        'import("@asenajs/asena");import("../../public/test.html");import("hono");',
      );

      const htmlImports = new Map([['../../public/test.html', './public/test.html']]);

      build['rewriteHTMLImports'](outdir, htmlImports);

      const result = fs.readFileSync(path.join(outdir, 'index.asena.js'), 'utf-8');

      expect(result).toBe('import("@asenajs/asena");import("./public/test.html");import("hono");');
    });
  });

  describe('rewriteHTMLImports - security', () => {
    let build: Build;

    beforeEach(() => {
      build = new Build();
      setupTmpDir();
    });

    afterEach(() => {
      cleanupTmpDir();
    });

    it('should only replace exact path matches within quotes', () => {
      const outdir = path.join(TMP_DIR, 'dist');

      fs.mkdirSync(outdir, { recursive: true });

      // The string "../../public/test.html" appears in a different context (e.g., a log message)
      fs.writeFileSync(
        path.join(outdir, 'index.asena.js'),
        ['const msg = "path is ../../public/test.html ok";', 'import("../../public/test.html");'].join('\n'),
      );

      const htmlImports = new Map([['../../public/test.html', './public/test.html']]);

      build['rewriteHTMLImports'](outdir, htmlImports);

      const result = fs.readFileSync(path.join(outdir, 'index.asena.js'), 'utf-8');

      // The import should be rewritten
      expect(result).toContain('import("./public/test.html")');
      // The standalone string without quotes around only the path should NOT be affected
      // because replaceAll targets `"../../public/test.html"` (with quotes)
      expect(result).toContain('const msg = "path is ../../public/test.html ok"');
    });

    it('should not be affected by path traversal in import strings', () => {
      const outdir = path.join(TMP_DIR, 'dist');

      fs.mkdirSync(outdir, { recursive: true });

      // A malicious-looking path that goes above the project root
      fs.writeFileSync(path.join(outdir, 'index.asena.js'), 'import("../../../../etc/passwd.html")');

      // Only rewrite known mappings - this path is NOT in the map
      const htmlImports = new Map([['../../public/test.html', './public/test.html']]);

      build['rewriteHTMLImports'](outdir, htmlImports);

      const result = fs.readFileSync(path.join(outdir, 'index.asena.js'), 'utf-8');

      // Unknown path should remain untouched
      expect(result).toBe('import("../../../../etc/passwd.html")');
    });

    it('should not perform partial string replacements within longer paths', () => {
      const outdir = path.join(TMP_DIR, 'dist');

      fs.mkdirSync(outdir, { recursive: true });

      fs.writeFileSync(path.join(outdir, 'index.asena.js'), 'import("../../public/test.html.bak")');

      const htmlImports = new Map([['../../public/test.html', './public/test.html']]);

      build['rewriteHTMLImports'](outdir, htmlImports);

      const result = fs.readFileSync(path.join(outdir, 'index.asena.js'), 'utf-8');

      // Should NOT match because "../../public/test.html.bak" != "../../public/test.html"
      expect(result).toBe('import("../../public/test.html.bak")');
    });

    it('should not replace paths embedded in other strings', () => {
      const outdir = path.join(TMP_DIR, 'dist');

      fs.mkdirSync(outdir, { recursive: true });

      fs.writeFileSync(path.join(outdir, 'index.asena.js'), 'const x = "prefix../../public/test.htmlsuffix";');

      const htmlImports = new Map([['../../public/test.html', './public/test.html']]);

      build['rewriteHTMLImports'](outdir, htmlImports);

      const result = fs.readFileSync(path.join(outdir, 'index.asena.js'), 'utf-8');

      // The replacement targets `"../../public/test.html"` with quotes, so this should NOT match
      expect(result).toBe('const x = "prefix../../public/test.htmlsuffix";');
    });

    it('should handle paths with special regex characters safely', () => {
      const outdir = path.join(TMP_DIR, 'dist');

      fs.mkdirSync(outdir, { recursive: true });

      fs.writeFileSync(path.join(outdir, 'index.asena.js'), 'import("../../public/test (1).html")');

      const htmlImports = new Map([['../../public/test (1).html', './public/test (1).html']]);

      build['rewriteHTMLImports'](outdir, htmlImports);

      const result = fs.readFileSync(path.join(outdir, 'index.asena.js'), 'utf-8');

      expect(result).toBe('import("./public/test (1).html")');
    });

    it('should handle paths with unicode characters', () => {
      const outdir = path.join(TMP_DIR, 'dist');

      fs.mkdirSync(outdir, { recursive: true });

      fs.writeFileSync(path.join(outdir, 'index.asena.js'), 'import("../../public/sayfa-türkçe.html")');

      const htmlImports = new Map([['../../public/sayfa-türkçe.html', './public/sayfa-türkçe.html']]);

      build['rewriteHTMLImports'](outdir, htmlImports);

      const result = fs.readFileSync(path.join(outdir, 'index.asena.js'), 'utf-8');

      expect(result).toBe('import("./public/sayfa-türkçe.html")');
    });

    it('should handle multiple JS output files', () => {
      const outdir = path.join(TMP_DIR, 'dist');

      fs.mkdirSync(outdir, { recursive: true });
      fs.writeFileSync(path.join(outdir, 'index.asena.js'), 'import("../../public/a.html")');
      fs.writeFileSync(path.join(outdir, 'chunk-abc123.js'), 'import("../../public/b.html")');

      const htmlImports = new Map([
        ['../../public/a.html', './public/a.html'],
        ['../../public/b.html', './public/b.html'],
      ]);

      build['rewriteHTMLImports'](outdir, htmlImports);

      const result1 = fs.readFileSync(path.join(outdir, 'index.asena.js'), 'utf-8');
      const result2 = fs.readFileSync(path.join(outdir, 'chunk-abc123.js'), 'utf-8');

      expect(result1).toBe('import("./public/a.html")');
      expect(result2).toBe('import("./public/b.html")');
    });
  });

  describe('writeWrapperFiles', () => {
    it('should generate aliased imports, default export handling and the global assignment', () => {
      const build = new Build();

      build['configFile'] = {
        rootFile: path.join(TMP_DIR, 'src/index.ts'),
        sourceFolder: path.join(TMP_DIR, 'src'),
      };

      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'asena-wrapper-test-'));

      try {
        build['writeWrapperFiles'](tmpDir, {
          'services/UserService.ts': [{ exportName: 'UserService', Class: class UserService {} }],
          'DefaultComponent.ts': [{ exportName: 'default', Class: class DefaultComponent {} }],
        });

        const componentsCode = fs.readFileSync(path.join(tmpDir, 'asena.components.js'), 'utf-8');

        expect(componentsCode).toContain(
          `import { UserService as c0 } from '${path.resolve(TMP_DIR, 'src', 'services', 'UserService.ts')}';`,
        );
        expect(componentsCode).toContain(
          `import { default as c1 } from '${path.resolve(TMP_DIR, 'src', 'DefaultComponent.ts')}';`,
        );
        expect(componentsCode).toContain(`globalThis[Symbol.for('asena.buildComponents')] = [c0, c1];`);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('should import the components module before the entry in index.asena.js', () => {
      const build = new Build();

      build['configFile'] = {
        rootFile: path.join(TMP_DIR, 'src/index.ts'),
        sourceFolder: path.join(TMP_DIR, 'src'),
      };

      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'asena-wrapper-test-'));

      try {
        build['writeWrapperFiles'](tmpDir, {
          'services/UserService.ts': [{ exportName: 'UserService', Class: class UserService {} }],
        });

        const entryCode = fs.readFileSync(path.join(tmpDir, 'index.asena.js'), 'utf-8');

        expect(entryCode).toBe(
          `import './asena.components.js';\nimport '${path.resolve(TMP_DIR, 'src', 'index.ts')}';\n`,
        );
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  });

  describe('temp build directory', () => {
    const originalCwd = process.cwd();
    let build: Build;
    let capturedTmp: string | undefined;

    beforeEach(() => {
      build = new Build();
      setupTmpDir();
      capturedTmp = undefined;
    });

    afterEach(() => {
      process.chdir(originalCwd);
      cleanupTmpDir();
      fs.rmSync(path.join(FIXTURE_DIR, 'dist'), { recursive: true, force: true });
    });

    it('should live outside sourceFolder, be removed after a successful build, and return the output path', async () => {
      process.chdir(FIXTURE_DIR);

      build['executeBuild'] = async (tmpDir: string) => {
        capturedTmp = tmpDir;
      };

      const outputPath = await build.build();

      expect(path.isAbsolute(outputPath)).toBe(true);
      expect(outputPath).toBe(path.join(FIXTURE_DIR, 'dist', 'index.asena.js'));

      expect(capturedTmp).toBeDefined();
      expect(capturedTmp!.startsWith(path.join(os.tmpdir(), 'asena-build-'))).toBe(true);
      expect(fs.existsSync(capturedTmp!)).toBe(false);

      expect(findAsenaJsFiles(path.join(FIXTURE_DIR, 'src'))).toEqual([]);
    });

    it('should be removed after a failed build and the error should propagate', async () => {
      process.chdir(FIXTURE_DIR);

      build['executeBuild'] = async (tmpDir: string) => {
        capturedTmp = tmpDir;
        throw new Error('simulated bundler failure');
      };

      await expect(build.build()).rejects.toThrow('simulated bundler failure');

      expect(capturedTmp).toBeDefined();
      expect(fs.existsSync(capturedTmp!)).toBe(false);
      expect(findAsenaJsFiles(path.join(FIXTURE_DIR, 'src'))).toEqual([]);
    });
  });

  describe('normalizeMinify', () => {
    it('should expand minify: true with keepNames enabled', () => {
      const build = new Build();

      expect(build['normalizeMinify'](true)).toEqual({
        whitespace: true,
        syntax: true,
        identifiers: true,
        keepNames: true,
      });
    });

    it('should force keepNames when identifiers are minified and log one line', () => {
      const build = new Build();
      const originalLog = console.log;
      const logs: string[] = [];

      console.log = (...args: unknown[]) => {
        logs.push(args.map(String).join(' '));
      };

      let result: unknown;

      try {
        result = build['normalizeMinify']({ identifiers: true });
      } finally {
        console.log = originalLog;
      }

      expect(result).toEqual({ identifiers: true, keepNames: true });
      expect(logs).toEqual(['[build] minify.keepNames forced to true: component names are read at runtime']);
    });

    it('should leave minify objects without identifier minification untouched', () => {
      const build = new Build();

      expect(build['normalizeMinify']({ identifiers: false })).toBeUndefined();
    });

    it('should leave undefined untouched', () => {
      const build = new Build();

      expect(build['normalizeMinify'](undefined)).toBeUndefined();
    });

    it('should leave minify untouched when keepNames is already true', () => {
      const build = new Build();

      expect(build['normalizeMinify']({ identifiers: true, keepNames: true })).toBeUndefined();
    });
  });
});
