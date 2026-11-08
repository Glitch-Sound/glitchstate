import { build } from "esbuild";

await build({
  entryPoints: ["src/extension/extension.ts"],
  outfile: "dist/extension/extension.cjs",
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  external: ["vscode"],
});
