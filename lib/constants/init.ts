export const INITIAL_ASENA_CONFIG_TS = `import {defineConfig} from "@asenajs/asena-cli";\n
export default defineConfig({
  sourceFolder: 'src',
  rootFile: 'src/index.ts',
  buildOptions: {
    outdir: 'dist',
    sourcemap: 'linked',
    target: 'bun',
    minify: {
      whitespace: true,
      syntax: true,
      identifiers: false, //It's better for you not to turn it off for better debugging during the running phase of the application.
    },
  },
});
`;
