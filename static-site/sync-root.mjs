import { cp, copyFile, mkdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const staticRoot = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(staticRoot, "..");
const docsRoot = resolve(projectRoot, "docs");

await rm(resolve(projectRoot, "assets"), { recursive: true, force: true });
await mkdir(resolve(projectRoot, "assets"), { recursive: true });
await cp(resolve(docsRoot, "assets"), resolve(projectRoot, "assets"), {
  recursive: true,
});
await copyFile(resolve(docsRoot, "index.html"), resolve(projectRoot, "index.html"));
await copyFile(resolve(docsRoot, ".nojekyll"), resolve(projectRoot, ".nojekyll"));
