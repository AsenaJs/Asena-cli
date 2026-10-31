<p width="%100" align="center">
  <img src="https://avatars.githubusercontent.com/u/179836938?s=200&v=4" width="150" align="center"/>
</p>

# Asena CLI

[![Version](https://img.shields.io/npm/v/@asenajs/asena-cli.svg)](https://asena.sh)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)
[![Bun Version](https://img.shields.io/badge/Bun-1.4%2B-blueviolet)](https://bun.sh)

Command-line tool for scaffolding, generating, running and building [Asena](https://asena.sh) applications.

**Requirements:** Bun 1.4+

## Installation

```bash
bun install -g @asenajs/asena-cli
```

## Quick Start

```bash
asena create my-app --adapter=ergenecore
cd my-app
asena dev start
```

Generate a component with `asena g c` (controller), `asena g s` (service) and friends, and bundle for production with `asena build`.

## Documentation

Full command and configuration reference: https://asena.sh/docs/cli/overview

## License

MIT
