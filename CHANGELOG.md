# @asenajs/asena-cli

## 0.7.0

### Minor Changes

- ### Import Path Migration
  - Migrate all generated import paths from `@asenajs/asena/server` and `@asenajs/asena/web` to the new `@asenajs/asena/decorators` and `@asenajs/asena/decorators/http` subpath exports
  - Service generate command now uses `@asenajs/asena/decorators` instead of `@asenajs/asena/server`

  ### Code Generation Quality
  - Replace tab indentation with 2-space indentation in all code generators (Controller, Middleware, Validator, WebSocket, ServerConfig)
  - Use single quotes consistently in generated code
  - Add proper spacing in class declarations and method signatures
  - Fix extra whitespace before `export class` in ControllerHandler

  ### Create Command Enhancements
  - Add `--skip-install` flag for monorepo/offline workflows — writes dependencies to package.json without running `bun install`
  - Add `.gitignore` generation with sensible defaults (node_modules, dist, .env, IDE files)
  - Use current folder name as project name when creating in current directory (instead of hardcoded "myApp")
  - Add `dev` and `dev:hot` scripts to generated package.json

  ### Config Schema & IDE Support
  - Add JSON Schema for `.asena/config.json` — enables autocomplete and validation in IDEs
  - Write `config.schema.json` alongside config file with `$schema` reference
  - Add `$schema` field to AdapterConfig type

  ### Test Fixture Fix
  - Update fixture `@asenajs/asena` dependency from `^0.4.0` to `^0.7.0`
  - Install fixture dependencies so integration tests pass

  ### New Tests
  - ControllerHandler: indentation, spacing, path handling
  - MiddlewareHandler: structure, indentation, spacing
  - ValidatorHandler: structure, schema generation

  ### Dependency Updates
  - `@asenajs/asena` `^0.6.0` → `^0.7.0`
  - `eslint` `^9.39.0` → `^9.39.4`
  - `prettier` `^3.6.2` → `^3.8.1`
  - `typescript-eslint` `^8.46.2` → `^8.58.0`
  - `inquirer` `^12.10.0` → `^12.11.1`

## 0.6.0

### Minor Changes

- Add validator generation support
  - New `asena generate validator` command to create validation schemas
  - ValidatorHandler for generating validator boilerplate code
  - Adapter-specific validator imports and configurations
  - Enhanced Create command with validator setup options

### Patch Changes

- Fix test suite compatibility with CommonJS module system
  - Updated ImportHandler test to expect correct require format for scoped packages (removed incorrect './@' prefix)
  - Updated Create command test to reflect CommonJS default behavior (no 'type: "module"' field in package.json)

## 0.5.1

### Patch Changes

- fix(eslint): migrate to ESLint v9 with flat config
  - Upgraded from ESLint v8 to v9 with modern flat config format
  - Replaced deprecated alloy config with official typescript-eslint recommended rules
  - Migrated from `.eslintrc.js` to `eslint.config.cjs` (flat config)
  - Improved Prettier integration with `eslint-config-prettier`
  - Added `.prettierignore` for better file exclusion control
  - Removed unused ESLint plugins (alloy, import, n, promise)
  - Added proper TypeScript project service configuration
  - Configured sensible rule overrides for Asena framework patterns (decorators, metadata, etc.)

- feat(generate): add configurable suffix system for component generation

  Added a powerful suffix configuration system that allows developers to customize component naming conventions project-wide via `.asena/config.json`.

  **Features:**
  - **Global control**: Set `suffixes: true` for default suffixes or `false` for none
  - **Granular control**: Configure each component type independently (controller, service, middleware, config, websocket)
  - **Custom suffixes**: Use custom strings like `"Ctrl"`, `"Svc"`, or `"MW"`
  - **Mixed configuration**: Combine boolean and string values for maximum flexibility
  - **Backward compatible**: Undefined suffix settings default to standard behavior

## 0.5.0

### Minor Changes

- **Breaking Changes:**
  - AsenaConfig changed. Now it's offer partial of bun BuildOptions(because most of them not necessery for asena building system)

## 0.4.4

### Patch Changes

- 80b23fc: Add CLI arguments support for non-interactive mode

  Resolves #12 - Added command-line arguments to bypass interactive prompts in SSH/non-TTY environments. Users can now specify project name and options directly via CLI flags (--adapter, --logger, --eslint, --prettier).

## 0.4.3

### Patch Changes

- minor fixes abaout version logs and removed unnecesery logs

## 0.4.2

### Patch Changes

- Component not detecting bug fixed

## 0.4.1

### Patch Changes

- bun link cleared

## 0.4.0

### Minor Changes

- Update to align with Asena framework 0.4.0 release

  **New Features:**
  - Add adapter support (Hono, Ergenecore) for project initialization and builds
  - New adapter configuration system via `.asena/config.json`
  - Adapter-specific import handling and server configuration
  - WebSocket handler generation support

  **Improvements:**
  - Update dependencies to support Asena 0.4.0
  - Enhanced build system with adapter-aware code generation
  - All tests passing (154 tests with 81.88% line coverage)

## 0.3.4

### Patch Changes

- missing package added

## 0.3.3

### Patch Changes

- version bug fixed

## 0.3.0

### Minor Changes

- 7462369: windows operating system path bug fixed

## 0.2.0

### Minor Changes

- hono adapter system implemented
