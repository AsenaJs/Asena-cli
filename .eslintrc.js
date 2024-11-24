module.exports = {
  env: {
    browser: true,
    es2021: true,
  },
  extends: ['alloy', 'alloy/typescript', 'prettier'],
  overrides: [
    {
      env: {
        node: true,
      },
      files: ['.eslintrc.{js,cjs}', './**/*.js'],
      parserOptions: {
        sourceType: 'script',
      },
    },
  ],
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  plugins: ['import'],
  rules: {
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    'lines-between-class-members': ['error', 'always'],
    'padded-blocks': ['error', { classes: 'always' }],
    'padding-line-between-statements': [
      'error',
      { blankLine: 'always', prev: 'directive', next: '*' },
      { blankLine: 'any', prev: 'directive', next: 'directive' },
      { blankLine: 'always', prev: ['case', 'default'], next: '*' },
      { blankLine: 'always', prev: ['const', 'let', 'var'], next: '*' },
      { blankLine: 'always', prev: 'class', next: '*' },
      { blankLine: 'always', prev: ['for', 'if', 'iife', 'do', 'expression', 'try', 'while'], next: '*' },
      { blankLine: 'any', prev: ['const', 'let', 'var'], next: ['const', 'let', 'var'] },
    ],
    'import/order': [
      'error',
      {
        groups: ['builtin', 'external', 'internal', ['parent', 'sibling', 'index'], 'object', 'type'],
        alphabetize: {
          order: 'asc', // Sort alphabetically
          caseInsensitive: false,
        },
        'newlines-between': 'never', // Add a newline between import groups
      },
    ],
  },
};
