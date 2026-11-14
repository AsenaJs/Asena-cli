---
'@asenajs/asena-cli': patch
---

The CLI's toolchain moves to TypeScript 7 (`@typescript/native`, with TypeScript 6 kept as `typescript` for ESLint). The `typescript` peer range now also accepts `^6.0.0` and `^7.0.0`. Emitted declarations are unchanged apart from quote style in three `.d.ts` files.
