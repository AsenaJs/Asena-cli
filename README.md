# Asena-cli

Asena cli tool for helping usage of asena framework. With asena-cli you can bundle or build a single executable file for your asena project.


## Installation

```bash
bun install -g @asenajs/asena-cli
```

## Usage

Documentation will be updated soon. For now you can use help command to see available commands.

### Help

```text
asena --help

Commands:

asena build    For building the project and preparing it for production deployment.
asena init    Creates a .asenarc.json file with default values (requires manual updates).
asena dev start    Builds the project and starts the output file in development mode.
```

### Build

Asena automatically searches for your .asenarc.json file in the root directory of your project. If it doesn't find one, you can create it using the ``asena init`` command.

```bash 
asena build
```

### Init

Creates a .asenarc.json file with default values (requires manual updates).

```bash
asena init
```
