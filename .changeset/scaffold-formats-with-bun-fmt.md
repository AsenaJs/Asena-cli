---
'@asenajs/asena-cli': minor
---

Projects created by `asena create` format with `bun fmt` instead of Prettier. With formatting enabled, the scaffold writes a `[fmt]` table to `bunfig.toml` (added to a `bunfig.toml` that is already there, which keeps its other settings and is then formatted with `bun fmt`) and the scripts `format` (`bun fmt --no-config`) and `format:check` (`bun fmt --check --no-config`). It no longer installs `prettier` or writes `.prettierrc.js` and `.prettierignore`; `eslint-config-prettier` is still installed with ESLint. `bun fmt` needs Bun 1.4.4 or later.

`asena create --format` / `--no-format` choose whether formatting is set up; it is set up by default, and the interactive question is "Set up formatting (bun fmt)?". `--prettier` / `--no-prettier` are deprecated aliases of `--format` / `--no-format`: they still work and print a warning. Passing `--format` together with `--no-prettier`, or `--no-format` with `--prettier`, is an error.
