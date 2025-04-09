<h1>
  <img src="https://avatars.githubusercontent.com/u/179836938?s=200&v=4" width="125" align="center"/>
</h1>

# Asena CLI

[![Version](https://img.shields.io/badge/version-0.2.0-blue.svg)](https://asena.dev)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)
[![Bun Version](https://img.shields.io/badge/Bun-1.2.8%2B-blueviolet)](https://bun.sh)

Asena-cli provides several command-line utilities to help developers manage their asena applications efficiently. Here's a comprehensive guide to all available commands.

## 📚 Table of Contents
- [Installation](#-installation)
- [Getting Started](#-getting-started)
- [Commands](#-commands)
- [Configuration](#-configuration)
- [Project Structure](#-project-structure)


## 🚀 Installation

Prerequisite: [Bun runtime](https://bun.sh) (v1.2.8 or higher)

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

#### Features

- **Interactive Setup**: Uses inquirer for a user-friendly setup experience
- **Project Structure**: Creates the basic project structure with necessary files and directories
- **Default Components**: Generates default controller and server setup
- **Development Tools**: Optional integration of:
  - ESLint configuration
  - Prettier setup
- **Dependency Management**: Automatically installs required dependencies

### ```asena generate```

Note: You can also use `asena g` as a shortcut.

The generate command allows you to quickly and consistently create project components.

### Features

- **Multi-Component Support**: Ability to generate controllers, services, and middlewares
- **Automatic Code Generation**: Creates template code with base structure and necessary imports
- **Project Structure Integration**: Places generated files in the correct directories
- **Shortcuts**: Command aliases for faster usage (g, c, s, m)


| **Component** | **Full Command**              | **Shortcut Command** | **Description**              |
|---------------|-------------------------------|-----------------------|--------------------------|
| Controller    | `asena generate controller`   | `asena g c`           | Generates a controller   |
| Service       | `asena generate service`      | `asena g s`           | Generates a service      |
| Middleware    | `asena generate middleware`   | `asena g m`           | Generates a middleware   |


### ```asena dev start```

The Dev command enables development mode with enhanced debugging capabilities.

#### Features

- **Build Integration**: Automatically builds the project before starting

### ```asena build```

The Build command handles project deployment preparation.

#### Features

- **Configuration Processing**: Reads and processes the Asena configuration file
- **Code Generation**: Creates a temporary build file that combines all controllers and components
- **Import Management**: Handles import statements and organizes them based on the project structure. No need to add controllers manually to root file
- **Server Integration**: Processes the AsenaServer configuration and integrates components

### ```asena init```

The Init command helps set up project configuration with default settings(no need if you used ```asena create```).

#### Features

- **Configuration Generation**: Creates `asena-config` configuration file
- **Default Values**: Provides sensible defaults for quick start

## ⚙️ Configuration

Customization via `asena.config.ts`:

```typescript
import { defineConfig } from '@asenajs/asena'

export default defineConfig({
    sourceFolder: 'src', // folder where the project files are located
    rootFile: 'src/index.ts', // entry file of the project
    buildOptions: { // build options. For more details, visit https://bun.sh/docs/bundler
        outdir: 'dist',
        sourcemap: 'linked',
        target: 'bun',
        minify: {
            whitespace: true,
            syntax: true,
            identifiers: false,
        },
    },
});
```

## 📂 Project Structure

Default project structure:

```bash
my-app/
├── src/
│   ├── controllers/    # Route controllers
│   ├── services/       # Business logic
│   ├── middlewares/    # Middleware files
│   └── index.ts        # Application entry point
├── tests/              # Test files
├── public/             # Static assets
├── asena.config.ts     # Configuration
└── package.json
```

