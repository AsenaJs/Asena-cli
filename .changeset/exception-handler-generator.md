---
"@asenajs/asena-cli": minor
---

Add `asena generate exception-handler` (alias `eh`), which writes an `@ExceptionHandler` class to `src/exceptions/` for `@asenajs/asena` 0.13. Its one `@Catch()` catch-all logs the error and answers HTTP with a 500 JSON body; it returns `undefined` outside HTTP and for `HttpException`s (including validation errors), so the framework default and the adapter's own status responses still apply. The suffix is configurable as `suffixes.exceptionHandler` (default `ExceptionHandler`).

`asena generate config` no longer emits an `onError` method: the generated `@Config` class is an empty `ConfigService` subclass, since `@Config.onError` is deprecated in `@asenajs/asena` 0.13 in favour of `@ExceptionHandler`.
