export const INITIAL_ASENA_CONFIG_TS = `
import {defineConfig} from "@asenajs/asena-cli";

export default defineConfig({
  sourceFolder: "src",
  rootFile: "src/index.ts",
  buildOptions: {
    outdir: "out",
    target: "bun",
    minify: true,
  },
});
`;
