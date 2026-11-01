---
"@asenajs/asena-cli": minor
---

Add three `asena doctor` checks for projects using `@asenajs/asena/auth` and `@asenajs/asena-auth`. They read the project's source files as text (skipping `node_modules`, `dist` and comments) and pass when they do not apply:

- `auth-enforcement` fails when `Protected` or `Roles` is imported from `@asenajs/asena/auth` but neither `authComponents` nor `AuthGuard` is imported from `@asenajs/asena-auth`. Without the guard the markers are metadata only and those routes are served open.
- `auth-better-auth-dep` fails when `@BetterAuth`, `BetterAuthService` or `BetterAuthController` from `@asenajs/asena-auth` is used but `better-auth` is not in `package.json` or not installed.
- `auth-cookie` fails when the literal `cookie` options of an `@Auth` provider form a cookie browsers reject: a `__Host-` name with `domain`, a `path` other than `/`, or `secure: false`; a `__Secure-` name with `secure: false`; `sameSite: 'none'` with `secure: false`. Non-literal values are not evaluated.
