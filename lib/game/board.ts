import type { Direction, Piece, TerrainCell } from "./types";

export const BOARD_SIZE = 7;

export function withinBoard(row: number, col: number) {
  return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;
}

export function cellKey(row: number, col: number) {
  return `${row}-${col}`;
}

export function isFence(row: number, col: number, terrain: TerrainCell[] = []) {
  return terrain.some(
    (cell) => cell.type === "fence" && cell.row === row && cell.col === col,
  );
}

export function findObstacleInDirection(
  row: number,
  col: number,
  direction: Direction,
  terrain: TerrainCell[],
  maxDistance = 3,
) {
  const vectors: Record<Direction, readonly [number, number]> = {
    up: [-1, 0], right: [0, 1], down: [1, 0], left: [0, -1],
  };
  const [dr, dc] = vectors[direction];
  for (let distance = 1; distance <= maxDistance; distance += 1) {
    const obstacle = terrain.find((cell) =>
      cell.row === row + dr * distance && cell.col === col + dc * distance);
    if (obstacle) return obstacle;
  }
  return null;
}

export function isLegalPlacement(
  row: number,
  col: number,
  pieces: Piece[],
  terrain: TerrainCell[] = [],
) {
  return withinBoard(row, col) && !pieces.some(
    (piece) => piece.row === row && piece.col === col,
  ) && !isFence(row, col, terrain);
}
