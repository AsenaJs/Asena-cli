---
'@asenajs/asena-cli': patch
---

Drop the unused `@asenajs/asena` dependency. The CLI never imports core, but the `^0.11.0` range installed a nested 0.11 copy into core 0.12 projects, which made `asena doctor` fail `duplicate-packages` (#35).
