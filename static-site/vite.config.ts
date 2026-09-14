import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { defineConfig } from "vite";

const staticRoot = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(staticRoot, "..");

export default defineConfig(({ mode }) => ({
  root: staticRoot,
  base: "./",
  plugins: [react()],
  css: {
    postcss: resolve(projectRoot, "postcss.config.mjs"),
  },
  build: {
    outDir: resolve(projectRoot, mode === "app" ? "android-web" : "docs"),
    emptyOutDir: true,
  },
}));
