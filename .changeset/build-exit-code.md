---
"@asenajs/asena-cli": patch
---

`asena build` exits with a non-zero code when the build fails, so `asena build && ...`, CI steps and Docker builds stop instead of running a stale artifact.
