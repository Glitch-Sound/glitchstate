import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  root: "src/webview",
  base: "./",
  plugins: [tailwindcss()],
  build: {
    outDir: "../../dist/webview",
    emptyOutDir: true,
  },
});
