---
'@asenajs/asena-cli': patch
---

`asena generate` writes its `require` and `import type` lines as `const { Service } = require('@asenajs/asena/decorators');` and `import type { Context } from '...';` in a project whose `tsconfig.json` `module` is not an ES module kind, such as `CommonJS`, so the generated file passes `bun fmt --check`.
