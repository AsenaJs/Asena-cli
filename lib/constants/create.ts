export const TSCONFIG = `{
  "compilerOptions": {
    // Enable latest features
    "lib": ["ESNext", "DOM"],
    "target": "ESNext",
    "module": "ESNext",
    "moduleDetection": "force",
    "jsx": "react-jsx",
    "allowJs": true,
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,

    // Bundler mode
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "noEmit": true,
    "types": ["bun"],

    // Best practices
    "strict": true,
    "skipLibCheck": true,
    "noFallthroughCasesInSwitch": true,

    // Some stricter flags
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noPropertyAccessFromIndexSignature": true
  }
}
`;

export const PRETTIER = `module.exports = {
  // max 120 characters per line
  printWidth: 120,
  // use 2 spaces for indentation
  tabWidth: 2,
  // use spaces instead of indentations
  useTabs: false,
  // semicolon at the end of the line
  semi: true,
  // use single quotes
  singleQuote: true,
  // object's key is quoted only when necessary
  quoteProps: 'as-needed',
  // use double quotes instead of single quotes in jsx
  jsxSingleQuote: false,
  // no comma at the end
  trailingComma: 'all',
  // spaces are required at the beginning and end of the braces
  bracketSpacing: true,
  // end tag of jsx need to wrap
  jsxBracketSameLine: false,
  // brackets are required for arrow function parameter, even when there is only one parameter
  arrowParens: 'always',
  // format the entire contents of the file
  rangeStart: 0,
  rangeEnd: Infinity,
  // no need to write the beginning @prettier of the file
  requirePragma: false,
  // No need to automatically insert @prettier at the beginning of the file
  insertPragma: false,
  // use default break criteria
  proseWrap: 'preserve',
  // decide whether to break the html according to the display style
  htmlWhitespaceSensitivity: 'css',
  // vue files script and style tags indentation
  vueIndentScriptAndStyle: false,
  // lf for newline
  endOfLine: 'lf',
  // formats quoted code embedded
  embeddedLanguageFormatting: 'auto',
};
`;

// Not a dependency of asena itself in the generated project, but `asena doctor` requires each of these
// as a direct dependency. Both install paths and the doctor rule read this list, so they cannot drift apart.
export const DOCTOR_REQUIRED_DEPENDENCIES = ['reflect-metadata'];

export const ESLINT_INSTALLATIONS = [
  'eslint',
  '@eslint/js',
  '@typescript-eslint/parser',
  '@typescript-eslint/eslint-plugin',
  'typescript-eslint',
];

export const ESLINT_WITH_PRETTIER_INSTALLATIONS = ['eslint-config-prettier'];

// typescript-eslint refuses to start on TypeScript 7 (its API is not in the package), so with ESLint
// the `typescript` name keeps the TS 6 API and `@typescript/native` carries the TS 7 compiler.
export const TYPESCRIPT_DEV_DEPENDENCIES: Record<string, string> = { typescript: '^7.0.2' };

export const TYPESCRIPT_WITH_ESLINT_DEV_DEPENDENCIES: Record<string, string> = {
  typescript: 'npm:@typescript/typescript6@^6.0.2',
  '@typescript/native': 'npm:typescript@^7.0.2',
};

export const PRETTIER_INSTALLATIONS = `prettier`;

export const PRETTIER_IGNORE = `# Dependencies
node_modules/

# Build output
dist/

# Logs
*.log

# Coverage
coverage/

# Lock files
bun.lockb
package-lock.json
yarn.lock
pnpm-lock.yaml

*.md
`;

export const GITIGNORE = `# Dependencies
node_modules/

# Build output
dist/
out/

# Asena CLI
.asena/

# Environment files
.env
.env.local
.env.*.local

# Logs
logs/
*.log
npm-debug.log*

# OS files
.DS_Store
Thumbs.db

# IDE/Editor files
.idea/
.vscode/
*.swp
*.swo
`;
