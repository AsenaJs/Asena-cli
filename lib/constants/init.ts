export const INITIAL_ASENA_CONFIG_JSON = `{
  "sourceFolder": "src",
  "rootFile": "src/index.ts",
  "buildOptions": {
    "entrypoints": ["src/index.ts"],
    "outdir": "out",
    "target": "bun",
    "minify": true
  }
}`;

export const INITIAL_ASENA_CONFIG_TS = `
const config = {
  sourceFolder: "src",
  rootFile: "src/index.ts",
  buildOptions: {
    entrypoints: ["src/index.ts"],
    outdir: "out",
    target: "bun",
    minify: true,
  },
};

export default config;
`;
