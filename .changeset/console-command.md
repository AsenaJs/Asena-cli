---
"@asenajs/asena-cli": minor
---

Add `asena console`, which starts the app in development mode and opens a browser console for it. The app runs as a child process with the devtools agent from `@asenajs/asena/devtools` attached, so `asena console` needs `@asenajs/asena` 0.13.0 or newer and says so when the project's core is older. The console is served on `127.0.0.1` only, behind a random token in the opened URL, and the command does not start when `NODE_ENV=production`. It restarts the app when a file under `sourceFolder` changes. Options: `--port <port>` (default: a free port), `--no-open` and `--no-watch`.

- **The agent:** it attaches when `AsenaServer.start()` finishes, and never in an app that sets `NODE_ENV=production` itself. When it has not reported after 10 seconds the console says so, in the terminal and in the browser, and shows only the app's output until it does.
- **Several servers in one app:** every `AsenaServer` the app starts is in the same console. A picker in the sidebar, shown only when there is more than one, names each server by adapter and port (a headless one by its id) and chooses the one whose components, endpoints, schedules, events, transports, config and exception handlers are on screen. Run, emit and send actions and the endpoint tester's requests go to that server, each result says which server answered, and the request list can be narrowed to one server. A server that stops while the process runs on stays in the picker, marked as stopped, and takes no actions.
- **Output in request records:** the agent's module is loaded before any module of the app, so a console wrapper the app installs (one that redacts secrets, for example) is on top of the capture, and a record holds what that wrapper prints.
