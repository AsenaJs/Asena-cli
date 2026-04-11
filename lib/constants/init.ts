export const INITIAL_ASENA_CONFIG_TS = `import {defineConfig} from "@asenajs/asena-cli";\n
export default defineConfig({
  sourceFolder: 'src',
  rootFile: 'src/index.ts',
  // include: ['public'], // Directories/files to copy into outdir during build
  buildOptions: {
    outdir: 'dist',
    minify: {
      whitespace: true,
      syntax: true,
      identifiers: false, //It's better for you to make this false for better debugging during the running phase of the application.
      keepNames: true
    },
  },
});
`;
