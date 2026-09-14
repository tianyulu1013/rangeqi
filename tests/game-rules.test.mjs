import assert from "node:assert/strict";
import test from "node:test";

import { BOARD_SIZE, cellKey, isFence, isLegalPlacement, withinBoard } from "../lib/game/board.ts";
import { generateSkirmishBattlefield } from "../lib/game/battlefield.ts";
import {
  DRAFT_POOLS,
  DRAFT_TIER_SCHEDULE,
  generateDraftAiChoices,
  generateDraftOffers,
  getDraftTier,
} from "../lib/game/draft.ts";
import { createCollapseLayer, getStats, resolveCollapse } from "../lib/game/collapse.ts";
import { transitionCollapsePlayback } from "../lib/game/collapsePlayback.ts";
import { getControlledCells, getOutgoingRelations, getRelations } from "../lib/game/relations.ts";
import { createSeededRandom, deriveSeed } from "../lib/game/random.ts";

const piece = (id, player, type, row, col) => ({ id, player, type, row, col });
const keys = (cells) => cells.map(([row, col]) => cellKey(row, col));

test("collapse playback keeps the resolution phases in order", () => {
  let state = "idle";
  state = transitionCollapsePlayback(state, "begin");
  assert.equal(state, "announce");
  state = transitionCollapsePlayback(state, "showUnstable");
  assert.equal(state, "unstable");
  state = transitionCollapsePlayback(state, "beginBreaking");
  assert.equal(state, "breaking");
  state = transitionCollapsePlayback(state, "recalculate");
  assert.equal(state, "recalculate");
  state = transitionCollapsePlayback(state, "nextRound");
  assert.equal(state, "nextRound");
  state = transitionCollapsePlayback(state, "showUnstable");
  assert.equal(state, "unstable");
  state = transitionCollapsePlayback(state, "complete");
  assert.equal(state, "complete");

  assert.equal(
    transitionCollapsePlayback("idle", "beginBreaking"),
    "idle",
  );
  assert.equal(transitionCollapsePlayback("complete", "reset"), "idle");
});

test("board helpers keep the 7x7 boundary and reject occupied cells", () => {
  assert.equal(BOARD_SIZE, 7);
  assert.equal(withinBoard(0, 0), true);
  assert.equal(withinBoard(6, 6), true);
  assert.equal(withinBoard(-1, 0), false);
  assert.equal(withinBoard(7, 0), false);
  assert.equal(isLegalPlacement(2, 2, []), true);
  assert.equal(isLegalPlacement(2, 2, [piece(1, "red", "guard", 2, 2)]), false);
});

test("all six Classic pieces use their configured ranges and clip at the edge", () => {
  const center = [piece(1, "red", "guard", 3, 3)];
  assert.equal(getControlledCells({ ...center[0], type: "scout" }, center).length, 4);
  assert.equal(getControlledCells(center[0], center).length, 4);
  assert.equal(getControlledCells({ ...center[0], type: "archer" }, center).length, 4);
  assert.equal(getControlledCells({ ...center[0], type: "knight" }, center).length, 8);
  assert.equal(getControlledCells({ ...center[0], type: "fortress" }, center).length, 8);
  assert.equal(
    getControlledCells({ ...center[0], type: "scout", row: 0, col: 0 }, center).length,
    1,
  );
});

test("musket controls only its facing line and an Obstacle stops the shot", () => {
  const musket = { ...piece(1, "red", "musket", 3, 2), direction: "right" };
  assert.deepEqual(keys(getControlledCells(musket, [musket])), [
    cellKey(3, 3),
    cellKey(3, 4),
    cellKey(3, 5),
    cellKey(3, 6),
  ]);
  assert.deepEqual(
    keys(getControlledCells(musket, [musket], [{ row: 3, col: 5, type: "fence" }])),
    [cellKey(3, 3), cellKey(3, 4)],
  );
});

test("cannon control starts behind the first screen and stops after the next piece", () => {
  const cannon = piece(1, "red", "cannon", 3, 3);
  const screen = piece(2, "blue", "guard", 3, 2);
  const target = piece(3, "red", "scout", 3, 1);
  const beyond = piece(4, "red", "scout", 3, 0);
  const controlled = keys(getControlledCells(cannon, [cannon, screen, target, beyond]));
  assert.equal(controlled.includes(cellKey(3, 1)), true);
  assert.equal(controlled.includes(cellKey(3, 0)), false);
});

test("incoming and outgoing relations classify attack and support by faction", () => {
  const target = piece(1, "red", "guard", 3, 3);
  const attacker = piece(2, "blue", "guard", 3, 2);
  const supporter = piece(3, "red", "guard", 2, 3);
  const pieces = [target, attacker, supporter];

  assert.deepEqual(getRelations(target, pieces), {
    attackers: [attacker],
    supporters: [supporter],
  });
  assert.deepEqual(getOutgoingRelations(target, pieces), {
    attackers: [attacker],
    supporters: [supporter],
  });
  assert.deepEqual(getStats(pieces).get(target.id), {
    attacks: 1,
    supports: 1,
    survival: 0,
  });
});

test("collapse marks the lowest survival pieces, removes ties together, then recalculates", () => {
  const pieces = [
    piece(1, "red", "guard", 1, 1),
    piece(2, "blue", "archer", 1, 3),
    piece(3, "red", "guard", 5, 5),
    piece(4, "blue", "archer", 5, 3),
  ];
  const timeline = resolveCollapse(pieces);
  const marked = timeline.find((frame) => frame.stage === "marked");
  const removed = timeline.find((frame) => frame.stage === "removed");
  const complete = timeline.at(-1);

  assert.deepEqual(marked?.pendingIds, [1, 3]);
  assert.deepEqual(removed?.affectedPieces.map((item) => item.id), [1, 3]);
  assert.deepEqual(removed?.pieces.map((item) => item.id), [2, 4]);
  assert.equal(complete?.stage, "complete");
  assert.deepEqual(complete?.pieces.map((item) => item.id), [2, 4]);
});

test("collapse layers preserve before and after values for changed survivors", () => {
  const target = piece(1, "red", "guard", 3, 3);
  const attacker = piece(2, "blue", "guard", 3, 2);
  const supporter = piece(3, "red", "guard", 2, 3);
  const before = [target, attacker, supporter];
  const after = [target, attacker];
  const layer = createCollapseLayer(before, [supporter], after, 1, -1);

  assert.deepEqual(layer.removedPieces.map((value) => value.id), [3]);
  assert.deepEqual(layer.beforeStats.find((value) => value.pieceId === 1), {
    pieceId: 1,
    attacks: 1,
    supports: 1,
    survival: 0,
  });
  assert.deepEqual(layer.afterStats.find((value) => value.pieceId === 1), {
    pieceId: 1,
    attacks: 1,
    supports: 0,
    survival: -1,
  });
  assert.deepEqual(layer.changedPieces.map((value) => value.piece.id), [1]);
  assert.deepEqual(layer.changedPieces[0]?.before, {
    attacks: 1,
    supports: 1,
    survival: 0,
  });
  assert.deepEqual(layer.changedPieces[0]?.after, {
    attacks: 1,
    supports: 0,
    survival: -1,
  });
});

test("seeded random stays reproducible and scoped streams stay independent", () => {
  const first = createSeededRandom("TEST-SEED");
  const second = createSeededRandom("TEST-SEED");
  const different = createSeededRandom("OTHER-SEED");

  assert.deepEqual(
    Array.from({ length: 6 }, () => first.next()),
    Array.from({ length: 6 }, () => second.next()),
  );
  assert.notDeepEqual(
    Array.from({ length: 4 }, () => createSeededRandom("TEST-SEED").next()),
    Array.from({ length: 4 }, () => different.next()),
  );
  assert.equal(deriveSeed("TEST-SEED", "battlefield"), "TEST-SEED:battlefield");
  assert.equal(deriveSeed("TEST-SEED", "draft"), "TEST-SEED:draft");
});

test("Skirmish battlefields are deterministic and leave enough open space", () => {
  for (let index = 0; index < 1000; index += 1) {
    const seed = `SEED-${index}`;
    const first = generateSkirmishBattlefield(seed);
    const second = generateSkirmishBattlefield(seed);
    assert.deepEqual(first, second);
    assert.ok(first.terrain.length >= 3 && first.terrain.length <= 6);
    assert.equal(new Set(first.terrain.map((cell) => cellKey(cell.row, cell.col))).size, first.terrain.length);
    for (let row = 0; row < BOARD_SIZE; row += 1) {
      assert.ok(first.terrain.filter((cell) => cell.row === row).length <= 3);
    }
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      assert.ok(first.terrain.filter((cell) => cell.col === col).length <= 3);
    }
  }
});

test("Obstacle cells reject placement while cannon fire passes over them", () => {
  const terrain = [{ row: 3, col: 1, type: "fence" }];
  const cannon = piece(1, "red", "cannon", 3, 3);
  const screen = piece(2, "blue", "guard", 3, 2);
  const target = piece(3, "red", "scout", 3, 0);

  assert.equal(isFence(3, 1, terrain), true);
  assert.equal(isLegalPlacement(3, 1, [], terrain), false);
  assert.equal(
    keys(getControlledCells(cannon, [cannon, screen, target], terrain)).includes(cellKey(3, 0)),
    true,
  );
  assert.equal(
    keys(getControlledCells({ ...cannon, type: "guard", row: 4, col: 1 }, [], terrain)).includes(cellKey(3, 1)),
    false,
  );
});

test("an Obstacle can serve as the first screen for Artillery", () => {
  const terrain = [{ row: 3, col: 2, type: "fence" }];
  const cannon = piece(1, "red", "cannon", 3, 3);
  const target = piece(2, "blue", "guard", 3, 0);
  const controlled = keys(getControlledCells(cannon, [cannon, target], terrain));

  assert.equal(controlled.includes(cellKey(3, 1)), true);
  assert.equal(controlled.includes(cellKey(3, 0)), true);
  assert.equal(controlled.includes(cellKey(3, 2)), false);
});

test("directional Shield Guard and Halberdier ranges rotate with their facing", () => {
  const shield = { ...piece(1, "red", "shield", 3, 3), direction: "right" };
  const halberd = { ...piece(2, "red", "halberd", 3, 3), direction: "down" };
  assert.deepEqual(new Set(keys(getControlledCells(shield, [shield]))), new Set([
    cellKey(2, 3), cellKey(2, 4), cellKey(3, 4), cellKey(4, 3), cellKey(4, 4),
  ]));
  assert.deepEqual(new Set(keys(getControlledCells(halberd, [halberd]))), new Set([
    cellKey(4, 2), cellKey(4, 4), cellKey(5, 3),
  ]));
});

test("Crossbow stops at the first piece and Obstacle on each ray", () => {
  const crossbow = piece(1, "red", "crossbow", 3, 3);
  const firstPiece = piece(2, "blue", "guard", 3, 5);
  const cells = keys(getControlledCells(
    crossbow,
    [crossbow, firstPiece],
    [{ row: 1, col: 3, type: "fence" }],
  ));
  assert.equal(cells.includes(cellKey(3, 5)), true);
  assert.equal(cells.includes(cellKey(3, 6)), false);
  assert.equal(cells.includes(cellKey(2, 3)), true);
  assert.equal(cells.includes(cellKey(1, 3)), false);
});

test("Lancer jumps the middle tile and selector preserves its four chosen targets", () => {
  const lancer = piece(1, "red", "lancer", 3, 3);
  const lancerCells = keys(getControlledCells(
    lancer,
    [lancer],
    [{ row: 3, col: 4, type: "fence" }],
  ));
  assert.equal(lancerCells.includes(cellKey(3, 5)), true);
  assert.equal(lancerCells.includes(cellKey(3, 4)), false);

  const selector = {
    ...piece(2, "blue", "selector", 2, 2),
    targets: [[0, 0], [1, 2], [2, 4], [4, 2]],
  };
  assert.deepEqual(keys(getControlledCells(selector, [selector])), [
    cellKey(0, 0), cellKey(1, 2), cellKey(2, 4), cellKey(4, 2),
  ]);
});

test("Battering Ram rotates its three-tile lane and Warden projects from an Obstacle", () => {
  const ram = { ...piece(1, "red", "ram", 3, 3), direction: "left" };
  assert.deepEqual(keys(getControlledCells(ram, [ram])), [
    cellKey(3, 2), cellKey(3, 1), cellKey(3, 0),
  ]);

  const terrain = [{ row: 2, col: 2, type: "fence" }];
  const warden = { ...piece(2, "blue", "warden", 4, 3), anchor: [2, 2] };
  assert.deepEqual(new Set(keys(getControlledCells(warden, [warden], terrain))), new Set([
    cellKey(1, 2), cellKey(3, 2), cellKey(2, 1), cellKey(2, 3),
  ]));
  assert.deepEqual(getControlledCells(warden, [warden], []), []);
});

test("Draft offers are seeded, shared, valid, and AI choices are locked to each offer", () => {
  const first = generateDraftOffers("DRAFT-SEED");
  const second = generateDraftOffers("DRAFT-SEED");
  const aiChoices = generateDraftAiChoices(first, "DRAFT-SEED");

  assert.deepEqual(first, second);
  assert.equal(first.length, 10);
  assert.deepEqual(DRAFT_TIER_SCHEDULE, [
    "core", "core", "advanced", "core", "core",
    "advanced", "elite", "core", "core", "advanced",
  ]);
  assert.equal(aiChoices.length, 10);
  for (let index = 0; index < first.length; index += 1) {
    const offer = first[index];
    const tier = getDraftTier(index);
    assert.equal(new Set(offer).size, 3);
    assert.equal(offer.every((type) => DRAFT_POOLS[tier].includes(type)), true);
    assert.ok(offer.includes(aiChoices[index]));
    if (index > 0) assert.notDeepEqual([...offer].sort(), [...first[index - 1]].sort());
  }
});
