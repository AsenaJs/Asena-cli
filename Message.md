# Commit Message

```
feat(cli): migrate import paths to v0.7.0 exports, improve code generation quality, and add --skip-install support

Migrate all generated import paths from deprecated @asenajs/asena/server
and @asenajs/asena/web to the new @asenajs/asena/decorators and
@asenajs/asena/decorators/http subpath exports for Asena v0.7.0 compat.

Replace tab indentation with 2-space indentation across all code generators
(Controller, Middleware, Validator, WebSocket, ServerConfig). Use single
quotes consistently and fix spacing in class declarations and method
signatures.

Add --skip-install flag to create command for monorepo/offline workflows.
Generate .gitignore with sensible defaults. Use current folder name as
project name instead of hardcoded "myApp".

Add JSON Schema for .asena/config.json enabling IDE autocomplete and
validation. Write config.schema.json alongside config file.

Update @asenajs/asena dependency from ^0.6.0 to ^0.7.0.
Fix test fixture dependency version and add new unit tests.
```

---

# PR Description

```
## Summary

- **Import path migration**: All generated code now uses `@asenajs/asena/decorators` and `@asenajs/asena/decorators/http` instead of the deprecated `@asenajs/asena/server` and `@asenajs/asena/web` paths, aligning with Asena v0.7.0 exports
- **Code generation quality**: Replaced tab indentation with 2-space indentation, enforced single quotes, and fixed spacing inconsistencies across all code generators (Controller, Middleware, Validator, WebSocket, ServerConfig)
- **`--skip-install` flag**: New option for `asena create` that writes dependencies to package.json without running `bun install` — useful for monorepos and offline workflows
- **`.gitignore` generation**: New projects now include a `.gitignore` with sensible defaults (node_modules, dist, .env, IDE files)
- **Config JSON Schema**: `.asena/config.json` now ships with a `config.schema.json` for IDE autocomplete and validation support
- **Create command improvements**: Uses current folder name as project name (was hardcoded "myApp"), adds `dev` and `dev:hot` scripts
- **Dependency updates**: `@asenajs/asena` ^0.6.0 → ^0.7.0, eslint, prettier, typescript-eslint bumped

## Test Plan
- [x] All 213 tests passing (0 fail)
- [x] Import path tests updated to use `@asenajs/asena/decorators`
- [x] New ControllerHandler tests (indentation, spacing, path handling)
- [x] New MiddlewareHandler tests (structure, indentation)
- [x] New ValidatorHandler tests (structure, schema generation)
- [x] Integration tests fixed (fixture dependency updated to ^0.7.0)
- [x] Adapter config helper tests updated for schema support

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```
