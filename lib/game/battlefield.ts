import { BOARD_SIZE, cellKey } from "./board.ts";
import { createSeededRandom, deriveSeed } from "./random.ts";
import type { BoardDefinition, TerrainCell } from "./types.ts";

const ALL_CELLS = Array.from({ length: BOARD_SIZE * BOARD_SIZE }, (_, index) => ({
  row: Math.floor(index / BOARD_SIZE),
  col: index % BOARD_SIZE,
}));

function hasLongFenceRun(fences: TerrainCell[]) {
  const fenceKeys = new Set(fences.map((cell) => cellKey(cell.row, cell.col)));
  for (const fence of fences) {
    let horizontal = 1;
    for (let col = fence.col - 1; fenceKeys.has(cellKey(fence.row, col)); col -= 1) horizontal += 1;
    for (let col = fence.col + 1; fenceKeys.has(cellKey(fence.row, col)); col += 1) horizontal += 1;
    if (horizontal > 3) return true;

    let vertical = 1;
    for (let row = fence.row - 1; fenceKeys.has(cellKey(row, fence.col)); row -= 1) vertical += 1;
    for (let row = fence.row + 1; fenceKeys.has(cellKey(row, fence.col)); row += 1) vertical += 1;
    if (vertical > 3) return true;
  }
  return false;
}

function hasConnectedOpenArea(fences: TerrainCell[]) {
  const fenceKeys = new Set(fences.map((cell) => cellKey(cell.row, cell.col)));
  const open = ALL_CELLS.filter((cell) => !fenceKeys.has(cellKey(cell.row, cell.col)));
  const visited = new Set<string>();
  const queue = open.length ? [open[0]] : [];

  while (queue.length) {
    const cell = queue.shift();
    if (!cell) continue;
    const key = cellKey(cell.row, cell.col);
    if (visited.has(key) || fenceKeys.has(key)) continue;
    visited.add(key);
    for (const [row, col] of [
      [cell.row - 1, cell.col],
      [cell.row + 1, cell.col],
      [cell.row, cell.col - 1],
      [cell.row, cell.col + 1],
    ]) {
      if (row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE) {
        queue.push({ row, col });
      }
    }
  }

  return visited.size === open.length;
}

function isValidBattlefield(fences: TerrainCell[]) {
  const fenceKeys = new Set(fences.map((cell) => cellKey(cell.row, cell.col)));
  const openByRow = Array.from({ length: BOARD_SIZE }, (_, row) =>
    ALL_CELLS.filter((cell) => cell.row === row && !fenceKeys.has(cellKey(cell.row, cell.col))).length,
  );
  const openByCol = Array.from({ length: BOARD_SIZE }, (_, col) =>
    ALL_CELLS.filter((cell) => cell.col === col && !fenceKeys.has(cellKey(cell.row, cell.col))).length,
  );
  const cornerKeys = [cellKey(0, 0), cellKey(0, 6), cellKey(6, 0), cellKey(6, 6)];

  return (
    fences.length >= 3 &&
    fences.length <= 6 &&
    openByRow.every((count) => count >= 4) &&
    openByCol.every((count) => count >= 4) &&
    cornerKeys.some((key) => !fenceKeys.has(key)) &&
    !hasLongFenceRun(fences) &&
    hasConnectedOpenArea(fences)
  );
}

export function generateSkirmishBattlefield(seed: string): BoardDefinition {
  const random = createSeededRandom(deriveSeed(seed, "battlefield"));
  const fenceCount = random.integer(3, 6);

  for (let attempt = 0; attempt < 2000; attempt += 1) {
    const fences = random
      .shuffle(ALL_CELLS)
      .slice(0, fenceCount)
      .map((cell) => ({ ...cell, type: "fence" as const }));
    if (isValidBattlefield(fences)) {
      return { size: BOARD_SIZE, terrain: fences };
    }
  }

  return {
    size: BOARD_SIZE,
    terrain: [
      { row: 1, col: 1, type: "fence" },
      { row: 1, col: 5, type: "fence" },
      { row: 5, col: 1, type: "fence" },
    ],
  };
}
