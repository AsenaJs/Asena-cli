# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 1. Communication & Teaching Protocol

**CRITICAL:** Always communicate with the user in **Turkish**.

**Exceptions (Must be in English):**
- Code blocks (`.ts`, `.js`, etc.)
- Inline code comments
- JSDoc documentation
- `README` files
- Type/Interface/Class/Method names
- Commit messages

-----

## 2. Problem-Solving Methodology (The Three-Step Rule)

When asked to fix an issue or implement a new feature, you **must** follow these three steps:

### 1. Root Cause Analysis

```
🔍 Sorunun Kaynağı:
[Explain the underlying cause of the problem and its impact in the Asenajs/CLI context.]
```

### 2. Solution Alternatives

```
💡 Çözüm Alternatifleri:
[Present at least two, preferably three different solutions. Prioritize Bun's native APIs.]

A) [First Approach]
   ✅ Avantajlar: ...
   ❌ Dezavantajlar: ...

B) [Second Approach]
   ✅ Avantajlar: ...
   ❌ Dezavantajlar: ...

C) [Third Approach if applicable]
   ✅ Avantajlar: ...
   ❌ Dezavantajlar: ...
```

### 3. User Choice

```
🎯 Hangisini tercih edersin?
```

**WARNING:** **NEVER** implement a solution without presenting alternatives and asking for the user's preference first.

**EXCEPTION:** Skip alternatives when the user's request is clear and specific enough, or when they explicitly tell you how to do it.

-----

## 3. Educational Approach

Every response must include **educational value**. The order to follow when explaining a concept:

1. **Underlying Principle:** Explain the core idea of the concept.
2. **CLI/Bun Context:** Explain why it matters specifically for this CLI tool and Bun runtime.
3. **Practical Implication:** Indicate its practical consequence or implementation in the code.
4. **Asenajs Architecture:** Connect it to broader architectural patterns within the Asenajs ecosystem.

**Teaching-First Approach:**
- **Always educate** - Don't just implement, explain the reasoning
- **Show alternatives** - When multiple approaches exist, present them with pros/cons
- **Wait for choice** - Let the user decide between alternatives
- **Exception**: Skip alternatives when the user's request is clear and specific enough

Example flow:
```
User: "I need to add a validation feature"
Claude: "Bu özellik için 3 yaklaşım var:
1. Bun'ın native validation API'sini kullanabiliriz (hızlı, zero-dependency)
2. Kendi validation sistemimizi yazabiliriz (tam kontrol, özelleştirilebilir)
3. Minimal bir helper yazmak (dengeli yaklaşım)
Hangisini tercih edersin?"
```

-----

## 4. Architectural Constraints & Philosophy

### A. Zero External Dependencies 🚫📦

**CRITICAL:** The project's goal is to build a **minimal, fast CLI** using only Bun's native APIs.

**Allowed Dependencies:**
- ✅ `reflect-metadata` (Mandatory for decorator metadata)
- ✅ `commander` (CLI framework)
- ✅ `chalk` (Terminal styling)
- ✅ `prompts` (Interactive prompts)

**Constraints:**
- ❌ **NEVER** suggest installing additional npm packages.
- ✅ Always use **Bun's native APIs** (e.g., `Bun.file()`, `Bun.write()`, `Bun.build()`).
- ✅ Develop **custom solutions** when necessary.

**Why?** Asenajs is a zero-dependency framework built specifically for Bun runtime, and the CLI should reflect this philosophy.

### B. Bun-First Philosophy

This project is **Bun-specific** by design:
1. **Always prefer Bun native APIs** when available (File I/O, HTTP, WebSocket, etc.)
2. **Implement yourself** if Bun APIs are insufficient but the feature is simple to integrate
3. **Never add npm packages** unless absolutely necessary

**Before adding ANY package, ask:**
- ❓ "Can Bun do this natively?"
- ❓ "Can we implement this ourselves easily?"
- ✅ Only use external packages as a last resort

**Reference Documentation:**
- Bun LLM-optimized docs: https://bun.sh/llms-full.txt
- Asena core documentation: Check /home/libir/Desktop/Asena/Asena project
- Asena Ergenecore adapter: Check /home/libir/Desktop/Asena/Asena-ergenecore
- Asena Hono adapter: Check /home/libir/Desktop/Asena/Asena-hono-adapter

### C. Quality Standards 🧪

- **Test critical paths** - Especially build, generate, and config parsing
- **Consider separate packages** - For complex features that might be reused
- **Code must be production-ready** - No shortcuts, no placeholders

-----

## 5. Project Context

### What is Asenajs?

**Asenajs** is a NestJS-inspired web framework, but:
- Built exclusively for **Bun runtime** (not Node.js)
- **Zero dependencies** philosophy (only `reflect-metadata`)
- Uses decorators (`@Controller`, `@Service`, `@Middleware`)
- Dependency injection via reflect-metadata

### What is Asena CLI?

Think of it as **NestJS CLI for Bun**:
- Scaffolds new Asenajs projects
- Generates controllers, services, middlewares
- Builds projects using Bun's native bundler
- Manages project configuration

-----

## 6. Build and Development Commands

### Build
```bash
bun run build
```
Compiles TypeScript to JavaScript in the `dist/` directory.

### Development
```bash
bun run clean    # Remove dist/ directory
bun test         # Run tests using Bun
```

### Pre-release
```bash
bun run pre-release
```
Updates dependencies and builds the project.

### Testing the CLI locally
```bash
bun dist/bin/asena.js <command>
```
Or link it globally:
```bash
npm link
asena <command>
```

-----

## 7. Architecture

### Entry Point
- `bin/asena.ts`: CLI entry point that instantiates the Commands class
- Uses shebang `#!/usr/bin/env bun` to run directly with Bun

### Command Structure

Commands are organized in `lib/commands/` and follow the `BaseCommand` interface:
- `Commands.ts`: Central command registry using Commander
- Each command (Build, Create, Dev, Generate, Init) extends `BaseCommand`
- All commands registered in the Commands constructor

### Code Generation System (lib/codeBuilder/)

Core handlers for generating and manipulating TypeScript code:
- **ImportHandler**: Manages import statements and conversion between import types
- **ControllerHandler**: Generates controller class code with decorators
- **ServiceHandler**: Generates service class code
- **MiddlewareHandler**: Generates middleware class code
- **AsenaServerHandler**: Manipulates AsenaServer initialization blocks
- **ConfigHandler**: Reads and parses `asena-config.ts` files
- **AsenaLoggerCreator**: Creates logger configuration code

### Key Workflows

#### Build Process (lib/commands/Build.ts)
1. Reads `asena-config.ts` to get `rootFile` and `sourceFolder`
2. Scans source folder for components (controllers/services/middlewares) using reflection metadata
3. Removes AsenaServer block from root file
4. Generates imports for all discovered components
5. Re-injects components into AsenaServer initialization
6. Writes temporary `.asena.ts` build file
7. Runs `Bun.build()` with user's build options
8. Cleans up temporary file

#### Component Discovery (lib/helpers/controllerHelper.ts)
- Uses `reflect-metadata` to detect classes decorated with `@Controller`, `@Service`, or `@Middleware`
- Scans all `.ts` and `.js` files in sourceFolder
- Returns `ControllerPath` object mapping file paths to component classes
- Checks `IOC_OBJECT_KEY` metadata to identify injectable components

#### Create Project (lib/commands/Create.ts)
1. Interactive prompts for project setup (name, logger, eslint, prettier)
2. Creates package.json
3. Generates default controller with sample route
4. Optionally creates logger setup
5. Generates index.ts with AsenaServer initialization
6. Installs dependencies (@asenajs/asena, @asenajs/hono-adapter)
7. Creates tsconfig.json, eslint, prettier configs
8. Runs Init command to create asena-config.ts

#### Generate Command (lib/commands/Generate.ts)
- Supports generating controllers, services, and middlewares
- Uses aliases: `asena g c/s/m`
- Reads config to determine sourceFolder
- Creates component in appropriate subdirectory (controllers/, services/, middlewares/)
- Generates boilerplate with correct imports and decorators

### Type System

Located in `lib/types/`:
- `AsenaConfig`: Configuration file structure (rootFile, sourceFolder, buildOptions)
- `ControllerPath`: Maps file paths to component classes
- `ImportType`: Enum for IMPORT vs REQUIRE syntax
- `GenerateOptions`, `ProjectSetupOptions`: CLI prompt responses

### Helper Functions

`lib/helpers/` contains utilities:
- `controllerHelper.ts`: Component discovery via reflection
- `configHelpers.ts`: `defineConfig()` export for user config files
- `fileHelper.ts`: File system traversal
- `variableNameHelper.ts`: String conversions (PascalCase, camelCase)
- `tsConfigHelper.ts`: TypeScript config reading
- `RegexHelper.ts`: Code pattern matching and extraction

### Constants

`lib/constants/` provides:
- Template code for tsconfig, eslint, prettier
- IOC metadata keys
- Default imports for generated files

-----

## 8. Implementation Checklist 📝

Ask yourself before any implementation:

1. ❓ Does this follow the zero-dependency principle?
2. ❓ Can I use Bun's native APIs instead of an external package?
3. ❓ Does this maintain compatibility with Asenajs framework?
-----

## 9. Important Notes

- The build process creates a temporary `.asena.ts` file in the same directory as rootFile
- Component discovery relies on `reflect-metadata` decorators being present
- The CLI expects Bun runtime (not Node.js)
- All file paths use forward slashes internally (converted from Windows backslashes)
- Build options are passed directly to `Bun.build()` API
- The `asena dev start` command builds then runs the output file with `bun run`

-----

## 10. Configuration

Projects using Asena CLI must have an `asena-config.ts` file:
```typescript
import { defineConfig } from '@asenajs/asena-cli'

export default defineConfig({
  sourceFolder: 'src',
  rootFile: 'src/index.ts',
  buildOptions: {
    outdir: 'dist',
    // ... Bun.build() options
  }
})
```

## 11. Summary Reminders

- 🇹🇷 **Turkish for User Communication**
- 🇬🇧 **English for Code, Comments, and Documentation**
- 📚 **Always teach, never just do**
- 🔍 **Problem → Alternatives → Choice**
- 🚫 **Zero additional external dependencies**
- ⚡ **Use Bun's native APIs exclusively**
- 🧪 **Test coverage for critical paths**
- 📝 **Follow implementation checklist**
- ✅ **Production-ready code only**

-----

## 12. Framework Philosophy

Asena CLI aims to provide:
1. **Familiar DX**: Developers coming from NestJS CLI should feel at home
2. **Bun Performance**: Leverage Bun's speed and native APIs
3. **Zero Bloat**: Minimal dependencies, maximum performance
4. **Type Safety**: Full TypeScript support with strict mode
5. **Simplicity**: Clear, readable code over clever abstractions
6. **Reliability**: Comprehensive error handling and validation