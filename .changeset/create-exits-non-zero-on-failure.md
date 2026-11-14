---
'@asenajs/asena-cli': patch
---

`asena create` exits with code 1 when it fails, for example when the target directory holds a `bunfig.toml` that is not valid TOML, so a script or CI step that runs it sees the failure. It still prints `Create failed:` with the error.
