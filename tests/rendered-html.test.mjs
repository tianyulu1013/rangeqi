import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the complete game board and inventory", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>阵衡｜静态布阵棋<\/title>/);
  assert.match(html, /aria-label="七乘七阵衡棋盘"/);
  assert.equal((html.match(/role="gridcell"/g) ?? []).length, 49);
  assert.match(html, /枪兵/);
  assert.match(html, /剑兵/);
  assert.match(html, /射手/);
  assert.match(html, /炮台/);
  assert.match(html, /骑士/);
  assert.match(html, /堡垒/);
  assert.match(html, /已放 0\/20/);
});

test("keeps the AI and static build self-contained", async () => {
  const [page, packageJson, staticEntry] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../static-site/main.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(page, /type PieceType[\s\S]*"cannon"/);
  assert.match(page, /function getControlledCells/);
  assert.match(page, /function settleForEvaluation/);
  assert.match(page, /STRATEGY_DESCRIPTIONS/);
  assert.match(packageJson, /"build:static"/);
  assert.match(staticEntry, /Home/);
  assert.doesNotMatch(page, /\bfetch\s*\(/);
  assert.doesNotMatch(page, /apiKey|OPENAI_API_KEY/i);
});
