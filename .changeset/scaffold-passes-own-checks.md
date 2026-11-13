---
'@asenajs/asena-cli': patch
---

`asena create` projects now pass their own `lint`, `format:check`, `tsc` and `asena doctor` checks on TypeScript 7 with `strict: true`. The scaffold installs `@eslint/js` and `reflect-metadata`, adds a `typecheck` script, and writes the generated sources in Prettier's style. `asena generate controller` no longer imports names that the empty class does not use.
