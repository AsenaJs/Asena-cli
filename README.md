<h1>
  <img src="https://avatars.githubusercontent.com/u/179836938?s=200&v=4" width="125" align="center"/>
</h1>

# Asena CLI

[![Version](https://img.shields.io/badge/version-0.11.0-blue.svg)](https://asena.sh)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)
[![Bun Version](https://img.shields.io/badge/Bun-1.4%2B-blueviolet)](https://bun.sh)

Asena-cli provides several command-line utilities to help developers manage their asena applications efficiently. Here's a comprehensive guide to all available commands.

## 📚 Table of Contents
- [Installation](#-installation)
- [Getting Started](#-getting-started)
- [Commands](#-commands)
- [Configuration](#-configuration)
- [Project Structure](#-project-structure)


## 🚀 Installation

Prerequisite: [Bun runtime](https://bun.sh) (v1.4 or higher)

```bash
bun install -g @asenajs/asena-cli
````

Verify installation:

```bash
asena --version
```

## 🏁 Getting Started

3 steps to create a new project:

1. Scaffold a new project:

```bash
asena create
```

2. Navigate into the project directory:

```bash
cd <Project name>
```

3. Start development:

```bash
asena dev start
```

Your application will be available at http://localhost:3000.

## 📖 Commands

### ```asena create```

The Create command bootstraps new Asena projects with a complete development environment setup.

##### Features

- **Interactive Setup**: Uses inquirer for a user-friendly setup experience
- **Non-Interactive Mode**: Support for CLI arguments to run in non-TTY environments (SSH, CI/CD)
- **Multi-Adapter Support**: Choose between Hono or Ergenecore adapters during project setup
- **Project Structure**: Creates the basic project structure with necessary files and directories
- **Default Components**: Generates default controller and server setup
- **Development Tools**: Optional integration of:
  - ESLint configuration
  - Prettier setup
- **Dependency Management**: Automatically installs required dependencies based on selected adapter

##### Usage

**Interactive Mode** (prompts for all options):
```bash
asena create
# or create in current directory
asena create .
```

**Non-Interactive Mode** (specify all options via CLI):
```bash
# Create with all features enabled
asena create my-project --adapter=hono --logger --eslint --prettier

# Create in current directory without optional features
asena create . --adapter=ergenecore --no-logger --no-eslint --no-prettier

# Mix of CLI arguments and interactive prompts
asena create my-app --adapter=hono  # Will prompt for other options
```

##### CLI Options

| Option | Description | Values |
|--------|-------------|--------|
| `[project-name]` | Project name (use `.` for current directory) | Any string |
| `--adapter <adapter>` | Adapter to use | `hono`, `ergenecore` |
| `--logger` / `--no-logger` | Setup Asena logger | boolean (default: true) |
| `--eslint` / `--no-eslint` | Setup ESLint | boolean (default: true) |
| `--prettier` / `--no-prettier` | Setup Prettier | boolean (default: true) |

### ```asena generate```

Note: You can also use `asena g` as a shortcut.

The generate command allows you to quickly and consistently create project components.

### Features

- **Multi-Component Support**: Ability to generate controllers, services, middlewares, configs, and websockets
- **Automatic Code Generation**: Creates template code with base structure and necessary imports
- **Adapter-Aware Generation**: Generates adapter-specific code based on project configuration
- **Project Structure Integration**: Places generated files in the correct directories
- **Shortcuts**: Command aliases for faster usage (g, c, s, m, ws)


| **Component** | **Full Command**              | **Shortcut Command** | **Description**                    |
|---------------|-------------------------------|----------------------|------------------------------------|
| Controller    | `asena generate controller`   | `asena g c`          | Generates a controller             |
| Service       | `asena generate service`      | `asena g s`          | Generates a service                |
| Middleware    | `asena generate middleware`   | `asena g m`          | Generates a middleware             |
| Config        | `asena generate config`       | `asena g config`     | Generates a server config class    |
| WebSocket     | `asena generate websocket`    | `asena g ws`         | Generates a WebSocket namespace    |


### ```asena dev start```

The Dev command enables development mode with enhanced debugging capabilities.

#### Features

- **Build Integration**: Automatically builds the project before starting

### ```asena build```

The Build command handles project deployment preparation.

#### Features

- **Configuration Processing**: Reads and processes the Asena configuration file
- **Wrapper Entry**: Bundles through a temporary wrapper file created outside your source folder — your entry file is never rewritten, and its module-level code is not executed at build time
- **Import Management**: Detected components are handed to the server through the build component list. No need to add controllers manually to the root file
- **Server Integration**: A hand-written `components:` array in the entry is user-owned — when present and non-empty it wins over the build's list

> The entry file no longer has to follow any formatting rules: comments inside the `AsenaServerFactory.create({...})` options, a repeated factory token, or arbitrary code around the call are all fine. When `buildOptions.minify` enables identifier minification, the build turns it off (`identifiers: false`): component names (e.g. `@Inject('UserService')`) are read at runtime, and Bun's bundler does not preserve class names under identifier minification even with `keepNames: true`.

### ```asena init```

The Init command helps set up project configuration with default settings(no need if you used ```asena create```).

#### Features

- **Configuration Generation**: Creates `asena-config` configuration file
- **Default Values**: Provides sensible defaults for quick start

## ⚙️ Configuration

Customization via `asena.config.ts`:

```typescript
import { defineConfig } from '@asenajs/asena-cli'

export default defineConfig({
    sourceFolder: 'src', // folder where the project files are located
    rootFile: 'src/index.ts', // entry file of the project
    include: ['public'], // files/directories to copy to output (required for @FrontendController)
    buildOptions: { // build options. For more details, visit https://bun.sh/docs/bundler
        outdir: 'dist',
        sourcemap: 'linked',
        minify: {
            whitespace: true,
            syntax: true,
            identifiers: false,
        },
    },
});
```

> **Note:** When using `@FrontendController`, the `include` option must list directories containing your HTML files. The CLI automatically rewrites HTML import paths during build so they resolve correctly from the output directory. Do **not** add `*.html` to `buildOptions.external`.

## 📂 Project Structure

Default project structure:

```bash
my-app/
├── src/
│   ├── controllers/    # Route controllers
│   ├── services/       # Business logic
│   ├── middlewares/    # Middleware files
│   ├── config/         # Server configuration classes
│   ├── namespaces/     # WebSocket namespaces
│   └── index.ts        # Application entry point
├── tests/              # Test files
├── public/             # Static assets
├── asena.config.ts     # Configuration
└── package.json
```

