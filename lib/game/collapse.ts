import { getRelations } from "./relations.ts";
import { BOARD_SIZE, cellKey, isFence, withinBoard } from "./board.ts";
import type {
  CollapseLayer,
  CollapseSnapshot,
  CollapseStatSnapshot,
  Piece,
  PieceStats,
  TerrainCell,
} from "./types.ts";

export type CollapseDecision =
  | { stage: "complete"; pieces: Piece[]; round: number }
  | {
      stage: "marked";
      pieces: Piece[];
      pendingIds: number[];
      round: number;
      survival: number;
    };

function clonePieces(pieces: Piece[]) {
  return pieces.map((piece) => ({ ...piece }));
}

const CHARGE_VECTORS = {
  up: [-1, 0],
  right: [0, 1],
  down: [1, 0],
  left: [0, -1],
} as const;

export function advanceLancers(
  pieces: Piece[],
  terrain: TerrainCell[] = [],
) {
  let advanced = clonePieces(pieces);
  const movedIds = new Set<number>();

  // Resolve movement one simultaneous step at a time. Occupied cells block a
  // step, and two Lancers contesting the same empty cell both remain in place.
  for (let step = 0; step < BOARD_SIZE; step += 1) {
    const occupied = new Set(advanced.map((piece) => cellKey(piece.row, piece.col)));
    const proposals = new Map<number, readonly [number, number]>();
    const destinationCounts = new Map<string, number>();

    for (const piece of advanced) {
      if (piece.type !== "charger") continue;
      const [dr, dc] = CHARGE_VECTORS[piece.direction ?? "up"];
      const row = piece.row + dr;
      const col = piece.col + dc;
      const key = cellKey(row, col);
      if (!withinBoard(row, col) || isFence(row, col, terrain) || occupied.has(key)) continue;
      proposals.set(piece.id, [row, col]);
      destinationCounts.set(key, (destinationCounts.get(key) ?? 0) + 1);
    }

    let movedThisStep = false;
    advanced = advanced.map((piece) => {
      const destination = proposals.get(piece.id);
      if (!destination || destinationCounts.get(cellKey(destination[0], destination[1])) !== 1) {
        return piece;
      }
      movedThisStep = true;
      movedIds.add(piece.id);
      return { ...piece, row: destination[0], col: destination[1] };
    });
    if (!movedThisStep) break;
  }

  return { pieces: advanced, movedIds: [...movedIds] };
}

function snapshotStats(
  pieces: Piece[],
  terrain: TerrainCell[] = [],
): CollapseStatSnapshot[] {
  const stats = getStats(pieces, terrain);
  return pieces.map((piece) => ({
    pieceId: piece.id,
    ...stats.get(piece.id)!,
  }));
}

export function createCollapseLayer(
  beforePieces: Piece[],
  removedPieces: Piece[],
  afterPieces: Piece[],
  round: number,
  minSurvival: number,
  terrain: TerrainCell[] = [],
): CollapseLayer {
  const beforeStats = snapshotStats(beforePieces, terrain);
  const afterStats = snapshotStats(afterPieces, terrain);
  const beforeById = new Map(beforeStats.map((stats) => [stats.pieceId, stats]));
  const afterById = new Map(afterStats.map((stats) => [stats.pieceId, stats]));
  const changedPieces = afterPieces
    .map((piece) => {
      const before = beforeById.get(piece.id);
      const after = afterById.get(piece.id);
      if (!before || !after) return null;
      if (
        before.attacks === after.attacks &&
        before.supports === after.supports &&
        before.survival === after.survival
      ) {
        return null;
      }
      return {
        piece: { ...piece },
        before: {
          attacks: before.attacks,
          supports: before.supports,
          survival: before.survival,
        },
        after: {
          attacks: after.attacks,
          supports: after.supports,
          survival: after.survival,
        },
      } satisfies CollapseLayer["changedPieces"][number];
    })
    .filter((change): change is CollapseLayer["changedPieces"][number] => change !== null);

  return {
    round,
    beforePieces: clonePieces(beforePieces),
    removedPieces: clonePieces(removedPieces),
    afterPieces: clonePieces(afterPieces),
    beforeStats,
    afterStats,
    changedPieces,
    minSurvival,
  };
}

export function getStats(pieces: Piece[], terrain: TerrainCell[] = []) {
  const result = new Map<number, PieceStats>();

  for (const target of pieces) {
    const relations = getRelations(target, pieces, terrain);

    result.set(target.id, {
      attacks: relations.attackers.length,
      supports: relations.supporters.length,
      survival: relations.supporters.length - relations.attackers.length,
    });
  }

  return result;
}

export function settleForEvaluation(pieces: Piece[], terrain: TerrainCell[] = []) {
  let remaining = [...pieces];

  while (remaining.length > 0) {
    remaining = advanceLancers(remaining, terrain).pieces;
    const stats = getStats(remaining, terrain);
    const minSurvival = Math.min(
      ...remaining.map((piece) => stats.get(piece.id)?.survival ?? 0),
    );
    if (minSurvival >= 0) break;
    remaining = remaining.filter(
      (piece) => stats.get(piece.id)?.survival !== minSurvival,
    );
  }

  return remaining;
}

export function getCollapseDecision(
  pieces: Piece[],
  round: number,
  terrain: TerrainCell[] = [],
): CollapseDecision {
  const stats = getStats(pieces, terrain);
  const minSurvival = Math.min(
    ...pieces.map((piece) => stats.get(piece.id)?.survival ?? 0),
  );

  if (minSurvival >= 0) {
    return { stage: "complete", pieces: clonePieces(pieces), round };
  }

  return {
    stage: "marked",
    pieces: clonePieces(pieces),
    pendingIds: pieces
      .filter((piece) => stats.get(piece.id)?.survival === minSurvival)
      .map((piece) => piece.id),
    round: round + 1,
    survival: minSurvival,
  };
}

export function removePendingPieces(pieces: Piece[], pendingIds: number[]) {
  const pending = new Set(pendingIds);
  return {
    removed: pieces.filter((piece) => pending.has(piece.id)).map((piece) => ({ ...piece })),
    remaining: pieces.filter((piece) => !pending.has(piece.id)).map((piece) => ({ ...piece })),
  };
}

export function resolveCollapse(
  pieces: Piece[],
  terrain: TerrainCell[] = [],
): CollapseSnapshot[] {
  let remaining = clonePieces(pieces);
  let round = 0;
  const snapshots: CollapseSnapshot[] = [
    {
      pieces: clonePieces(remaining),
      pendingIds: [],
      round: 0,
      stage: "initial",
      affectedPieces: [],
    },
  ];

  while (remaining.length > 0) {
    const charge = advanceLancers(remaining, terrain);
    remaining = charge.pieces;
    if (charge.movedIds.length > 0) {
      snapshots.push({
        pieces: clonePieces(remaining),
        pendingIds: [],
        round,
        stage: "charge",
        affectedPieces: remaining
          .filter((piece) => charge.movedIds.includes(piece.id))
          .map((piece) => ({ ...piece })),
      });
    }
    const stats = getStats(remaining, terrain);
    const minSurvival = Math.min(
      ...remaining.map((piece) => stats.get(piece.id)?.survival ?? 0),
    );

    if (minSurvival >= 0) {
      snapshots.push({
        pieces: clonePieces(remaining),
        pendingIds: [],
        round,
        stage: "complete",
        affectedPieces: [],
      });
      break;
    }

    const nextPending = remaining
      .filter((piece) => stats.get(piece.id)?.survival === minSurvival)
      .map((piece) => piece.id);
    const nextRound = round + 1;
    const affectedPieces = remaining
      .filter((piece) => nextPending.includes(piece.id))
      .map((piece) => ({ ...piece }));

    snapshots.push({
      pieces: clonePieces(remaining),
      pendingIds: nextPending,
      round: nextRound,
      stage: "marked",
      affectedPieces,
      survival: minSurvival,
    });

    remaining = remaining.filter((piece) => !nextPending.includes(piece.id));
    round = nextRound;
    snapshots.push({
      pieces: clonePieces(remaining),
      pendingIds: [],
      round,
      stage: "removed",
      affectedPieces,
    });
  }

  return snapshots;
}
