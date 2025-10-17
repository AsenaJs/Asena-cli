# @asenajs/asena-cli

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
