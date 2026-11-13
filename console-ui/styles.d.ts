// TypeScript 7 reports side-effect imports it cannot resolve (TS2882). Bun bundles these
// stylesheets; this declares them so the console UI type-checks.
declare module '*.css';
