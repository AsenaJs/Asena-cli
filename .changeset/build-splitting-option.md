---
'@asenajs/asena-cli': patch
---

Accept `splitting` in `buildOptions`. The build already passed it to `Bun.build`, but the config type rejected it.
