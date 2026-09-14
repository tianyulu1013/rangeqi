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

test("server-renders the independent mode selection screen", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Battle Array: Collapse<\/title>/);
  assert.match(html, /class="home-screen"/);
  assert.match(html, />Classic<\/strong>/);
  assert.match(html, />Arena<\/strong>/);
  assert.match(html, />English<\/option>/);
  assert.match(html, />简体中文<\/option>/);
  assert.doesNotMatch(html, /aria-label="7x7 Battle Array Board"/);
});

test("keeps the AI and static build self-contained", async () => {
  const [page, packageJson, staticEntry, board, relations, collapse, random, battlefield, draft] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../static-site/main.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/game/board.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/game/relations.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/game/collapse.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/game/random.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/game/battlefield.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/game/draft.ts", import.meta.url), "utf8"),
  ]);

  assert.match(board, /export const BOARD_SIZE = 7/);
  assert.match(board, /export function isLegalPlacement/);
  assert.match(relations, /export function getControlledCells/);
  assert.match(relations, /export function getRelations/);
  assert.match(relations, /export function getOutgoingRelations/);
  assert.match(relations, /attackers/);
  assert.match(relations, /supporters/);
  assert.match(collapse, /export function settleForEvaluation/);
  assert.match(collapse, /export function resolveCollapse/);
  assert.match(random, /export function createSeededRandom/);
  assert.match(random, /export function deriveSeed/);
  assert.match(battlefield, /export function generateArenaBattlefield/);
  assert.match(draft, /export function generateDraftOffers/);
  assert.match(page, /getCollapseDecision/);
  assert.match(page, /removePendingPieces/);
  assert.doesNotMatch(page, /function getControlledCells/);
  assert.doesNotMatch(page, /function getRelations/);
  assert.match(page, /strategies:\s*\{[\s\S]*balanced/);
  assert.match(page, /type SettlementFrame/);
  assert.match(page, /type Ruleset = "classic" \| "arena"/);
  assert.match(page, /rulesetCopy/);
  assert.match(page, /function openReplay/);
  assert.match(page, /t\.actions\.nextStep/);
  assert.match(packageJson, /"build:static"/);
  assert.match(staticEntry, /Home/);
  assert.doesNotMatch(page, /\bfetch\s*\(/);
  assert.doesNotMatch(page, /apiKey|OPENAI_API_KEY/i);
});
