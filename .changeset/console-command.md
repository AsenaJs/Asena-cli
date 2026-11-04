---
"@asenajs/asena-cli": minor
---

Add `asena console`, which starts the app in development mode and opens a browser console for it. The app runs as a child process with the devtools agent from `@asenajs/asena/devtools` attached, so `asena console` needs `@asenajs/asena` 0.13.0 or newer and says so when the project's core is older. The console is served on `127.0.0.1` only, behind a random token in the opened URL, and the command does not start when `NODE_ENV=production`. It restarts the app when a file under `sourceFolder` changes. Options: `--port <port>` (default: a free port), `--no-open` and `--no-watch`.
