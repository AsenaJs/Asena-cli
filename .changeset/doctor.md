---
"@asenajs/asena-cli": minor
---

Add `asena doctor`, a read-only diagnostic command that checks the current project for common static mistakes the other commands do not catch: missing decorator flags in `tsconfig.json`, a missing or broken `asena-config.ts` (including `minify.identifiers` enabled without `keepNames`), `hono`/`zod`/`@asenajs/asena`/`reflect-metadata` missing as direct dependencies, duplicate installed copies of `@asenajs/asena`/`hono`/`zod` that break `instanceof` and the `HttpException` brand, and installed `@asenajs/*` packages whose peer range for `@asenajs/asena` is not satisfied by the installed core version.

Each check prints one line (`✓` or `✗` with a hint on failure); `--json` prints the result array instead. The command exits with code `1` when any check fails and `0` otherwise, so it can be used in CI. Checks never modify the project.
