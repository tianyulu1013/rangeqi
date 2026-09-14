import { BOARD_SIZE, cellKey, isFence, withinBoard } from "./board.ts";
import { PIECE_CONFIG } from "./pieces.ts";
import type { Direction, Piece, Relations, TerrainCell } from "./types.ts";

const DIRECTION_VECTORS: Record<Direction, readonly [number, number]> = {
  up: [-1, 0],
  right: [0, 1],
  down: [1, 0],
  left: [0, -1],
};

function rotateOffset(dr: number, dc: number, direction: Direction) {
  if (direction === "right") return [dc, -dr] as const;
  if (direction === "down") return [-dr, -dc] as const;
  if (direction === "left") return [-dc, dr] as const;
  return [dr, dc] as const;
}

export function getControlledCells(
  piece: Piece,
  pieces: Piece[],
  terrain: TerrainCell[] = [],
) {
  if (piece.type === "selector") {
    return (piece.targets ?? []).filter(
      ([row, col]) => withinBoard(row, col) && !isFence(row, col, terrain),
    );
  }

  if (piece.type === "sentry") {
    if (!piece.anchor) return [];
    const [anchorRow, anchorCol] = piece.anchor;
    if (!isFence(anchorRow, anchorCol, terrain)) return [];
    return Object.values(DIRECTION_VECTORS)
      .map(([dr, dc]) => [anchorRow + dr, anchorCol + dc] as const)
      .filter(([row, col]) => withinBoard(row, col) && !isFence(row, col, terrain));
  }

  if (piece.type === "engineer") {
    if (!piece.createdObstacle) return [];
    const { row: obstacleRow, col: obstacleCol } = piece.createdObstacle;
    if (!isFence(obstacleRow, obstacleCol, terrain)) return [];
    return Object.values(DIRECTION_VECTORS)
      .map(([dr, dc]) => [obstacleRow + dr, obstacleCol + dc] as const)
      .filter(([row, col]) =>
        withinBoard(row, col) &&
        !isFence(row, col, terrain) &&
        (row !== piece.row || col !== piece.col));
  }

  if (piece.type === "shield" || piece.type === "halberd" || piece.type === "ram" || piece.type === "charger") {
    return PIECE_CONFIG[piece.type].offsets
      .map(([dr, dc]) => rotateOffset(dr, dc, piece.direction ?? "up"))
      .map(([dr, dc]) => [piece.row + dr, piece.col + dc] as const)
      .filter(([row, col]) => withinBoard(row, col) && !isFence(row, col, terrain));
  }

  if (piece.type === "musket") {
    const [dr, dc] = DIRECTION_VECTORS[piece.direction ?? "up"];
    const controlled: (readonly [number, number])[] = [];
    let row = piece.row + dr;
    let col = piece.col + dc;

    while (withinBoard(row, col)) {
      if (isFence(row, col, terrain)) break;
      controlled.push([row, col]);
      row += dr;
      col += dc;
    }
    return controlled;
  }

  if (piece.type === "crossbow") {
    const controlled: (readonly [number, number])[] = [];
    const occupied = new Set(
      pieces.filter((candidate) => candidate.id !== piece.id)
        .map((candidate) => cellKey(candidate.row, candidate.col)),
    );
    for (const [dr, dc] of Object.values(DIRECTION_VECTORS)) {
      let row = piece.row + dr;
      let col = piece.col + dc;
      while (withinBoard(row, col) && !isFence(row, col, terrain)) {
        controlled.push([row, col]);
        if (occupied.has(cellKey(row, col))) break;
        row += dr;
        col += dc;
      }
    }
    return controlled;
  }

  if (piece.type !== "cannon") {
    return PIECE_CONFIG[piece.type].offsets
      .map(([dr, dc]) => [piece.row + dr, piece.col + dc] as const)
      .filter(([row, col]) => withinBoard(row, col) && !isFence(row, col, terrain));
  }

  const occupied = new Set(
    pieces
      .filter((candidate) => candidate.id !== piece.id)
      .map((candidate) => cellKey(candidate.row, candidate.col)),
  );
  const controlled: (readonly [number, number])[] = [];
  const directions = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ] as const;

  for (const [dr, dc] of directions) {
    let row = piece.row + dr;
    let col = piece.col + dc;
    let foundScreen = false;

    while (withinBoard(row, col)) {
      const obstacleHere = isFence(row, col, terrain);
      const occupiedHere = occupied.has(cellKey(row, col));
      if (!foundScreen && (occupiedHere || obstacleHere)) {
        foundScreen = true;
        row += dr;
        col += dc;
        continue;
      }
      if (foundScreen && obstacleHere) break;
      if (foundScreen && !obstacleHere) {
        controlled.push([row, col]);
        if (occupiedHere) break;
      }
      row += dr;
      col += dc;
    }
  }

  return controlled;
}

export function getRelations(
  target: Piece,
  pieces: Piece[],
  terrain: TerrainCell[] = [],
): Relations {
  const attackers: Piece[] = [];
  const supporters: Piece[] = [];

  for (const source of pieces) {
    if (source.id === target.id) continue;
    const reachesTarget = getControlledCells(source, pieces, terrain).some(
      ([row, col]) => row === target.row && col === target.col,
    );
    if (!reachesTarget) continue;
    if (source.player === target.player) supporters.push(source);
    else attackers.push(source);
  }

  return { attackers, supporters };
}

export function getOutgoingRelations(
  source: Piece,
  pieces: Piece[],
  terrain: TerrainCell[] = [],
): Relations {
  const controlledCells = new Set(
    getControlledCells(source, pieces, terrain).map(([row, col]) => cellKey(row, col)),
  );
  const attackers: Piece[] = [];
  const supporters: Piece[] = [];

  for (const target of pieces) {
    if (target.id === source.id) continue;
    if (!controlledCells.has(cellKey(target.row, target.col))) continue;
    if (target.player === source.player) supporters.push(target);
    else attackers.push(target);
  }

  return { attackers, supporters };
}

export function getInfluence(pieces: Piece[], terrain: TerrainCell[] = []) {
  const cells = new Map<string, { red: number; blue: number }>();
  for (let row = 0; row < BOARD_SIZE; row += 1) {
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      cells.set(cellKey(row, col), { red: 0, blue: 0 });
    }
  }
  for (const piece of pieces) {
    for (const [row, col] of getControlledCells(piece, pieces, terrain)) {
      const value = cells.get(cellKey(row, col));
      if (value) value[piece.player] += 1;
    }
  }
  return cells;
}

export function countControlledCells(pieces: Piece[], terrain: TerrainCell[] = []) {
  const influence = getInfluence(pieces, terrain);
  const fenceKeys = new Set(terrain.map((cell) => cellKey(cell.row, cell.col)));
  let red = 0;
  let blue = 0;
  let neutral = 0;
  for (const [key, value] of influence.entries()) {
    if (fenceKeys.has(key)) continue;
    if (value.red > value.blue) red += 1;
    else if (value.blue > value.red) blue += 1;
    else neutral += 1;
  }
  return { red, blue, neutral };
}
