import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { defineConfig } from "vite";

const staticRoot = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(staticRoot, "..");

export default defineConfig({
  root: staticRoot,
  base: "/rangeqi/",
  plugins: [react()],
  css: {
    postcss: resolve(projectRoot, "postcss.config.mjs"),
  },
  build: {
    outDir: resolve(projectRoot, "docs"),
    emptyOutDir: true,
  },
});
