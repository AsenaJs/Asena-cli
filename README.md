# Asena-cli 

Asena-cli provides several command-line utilities to help developers manage their asena applications efficiently. Here's a comprehensive guide to all available commands.

## Installation

```bash
bun install -g @asenajs/asena-cli
```

### Help

```text
asena --help

Commands:
  create          Creates an Asena project and installs the required dependencies.
  build           For building the project and preparing it for production deployment
  dev             Developer options
  init [options]  Creates a asena-config.ts file with default values (requires manual updates).
  help [command]  display help for command
```

## Table of Contents
- [Create Command](#create-command)
- [Init Command](#init-command)
- [Build Command](#build-command)
- [Dev Command](#dev-command)

## Create Command

The Create command bootstraps new Asena projects with a complete development environment setup.

### Features

- **Interactive Setup**: Uses inquirer for a user-friendly setup experience
- **Project Structure**: Creates the basic project structure with necessary files and directories
- **Default Components**: Generates default controller and server setup
- **Development Tools**: Optional integration of:
    - ESLint configuration
    - Prettier setup
- **Dependency Management**: Automatically installs required dependencies

### Usage

``` bash
asena create
```
### Generated Structure
``` 
├── src/
│ ├── controllers/
│ │ └── AsenaController.ts
│ └── index.ts
├── package.json
├── tsconfig.json
├──.eslintrc.js (optional)
├──.eslintignore (optional)
└──.prettierrc.js (optional)
```

## Init Command

The Init command helps set up project configuration with default settings.

### Features

- **Configuration Generation**: Creates `asena-config` configuration file
- **Default Values**: Provides sensible defaults for quick start

### Usage

``` bash
asena init
```

#### Note

The config file may need to be edited according to your project.

## Build Command

The Build command handles project deployment preparation.

### Features

- **Configuration Processing**: Reads and processes the Asena configuration file
- **Code Generation**: Creates a temporary build file that combines all controllers and components
- **Import Management**: Handles import statements and organizes them based on the project structure. No need to add controllers manually to root file
- **Server Integration**: Processes the AsenaServer configuration and integrates components

### Usage

```bash
asena build
```

### Configuration
Configuration can be managed inside the asena-config config file. For a complete list of available options, refer to the [Bun build documentation](https://bun.sh/docs/bundler#reference)
``` json
{
    "buildOptions": {
    "outdir": "out",
    "target": "bun",
    "minify": true
  }
}
```

## Dev Command

The Dev command enables development mode with enhanced debugging capabilities.

### Features

- **Build Integration**: Automatically builds the project before starting

### Usage

``` bash
asena dev start
```


## Getting Started

To start a new Asena project, follow these steps:

1. Create a new project:

``` bash
asena create
```

2. Navigate to project directory:

``` bash
cd your-project-name
```

3. Start development server:

```bash
asena dev start
```