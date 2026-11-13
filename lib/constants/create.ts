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

// Options at Bun's defaults are pinned too: bun fmt takes every option [fmt] leaves unset from a Prettier
// config in a parent directory, and only an explicit value overrides .editorconfig.
export const BUNFIG_FMT = `[fmt]
printWidth = 120
singleQuote = true
tabWidth = 2
useTabs = false
endOfLine = "lf"
semi = true
quoteProps = "as-needed"
jsxSingleQuote = false
trailingComma = "all"
bracketSpacing = true
bracketSameLine = false
arrowParens = "always"
proseWrap = "preserve"
htmlWhitespaceSensitivity = "css"
vueIndentScriptAndStyle = false
embeddedLanguageFormatting = "auto"
objectWrap = "preserve"
experimentalTernaries = false
experimentalOperatorPosition = "end"
singleAttributePerLine = false
requirePragma = false
insertPragma = false
checkIgnorePragma = false
insertFinalNewline = true
sortImports = false
jsdoc = false
sortTailwindcss = false
sortPackageJson = false
ignorePatterns = ["coverage/", "bun.lockb", "package-lock.json", "yarn.lock", "pnpm-lock.yaml", "*.md"]
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

export const ESLINT_WITH_FORMAT_INSTALLATIONS = ['eslint-config-prettier'];

// typescript-eslint refuses to start on TypeScript 7 (its API is not in the package), so with ESLint
// the `typescript` name keeps the TS 6 API and `@typescript/native` carries the TS 7 compiler.
export const TYPESCRIPT_DEV_DEPENDENCIES: Record<string, string> = { typescript: '^7.0.2' };

export const TYPESCRIPT_WITH_ESLINT_DEV_DEPENDENCIES: Record<string, string> = {
  typescript: 'npm:@typescript/typescript6@^6.0.2',
  '@typescript/native': 'npm:typescript@^7.0.2',
};

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
