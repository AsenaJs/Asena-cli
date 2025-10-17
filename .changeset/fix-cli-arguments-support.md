---
"@asenajs/asena-cli": patch
---

Add CLI arguments support for non-interactive mode

Resolves #12 - Added command-line arguments to bypass interactive prompts in SSH/non-TTY environments. Users can now specify project name and options directly via CLI flags (--adapter, --logger, --eslint, --prettier).
