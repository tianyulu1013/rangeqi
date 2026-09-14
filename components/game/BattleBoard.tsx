import { useRef, type CSSProperties } from "react";
import { BOARD_SIZE, cellKey, findObstacleInDirection } from "../../lib/game/board";
import type {
  Direction,
  Piece,
  PieceStats,
  PieceType,
  Player,
  Relations,
  TerrainCell,
} from "../../lib/game/types";
import { PieceFace } from "./PieceVisuals";
import type { Language, PieceDisplay } from "./PieceVisuals";

const TOUCH_DRAG_LIFT_PX = 28;
const DIRECTION_VECTORS: Record<Direction, readonly [number, number]> = {
  up: [-1, 0],
  right: [0, 1],
  down: [1, 0],
  left: [0, -1],
};

type BattleBoardCopy = {
  players: Record<Player, string>;
  pieces: Record<PieceType, { name: string }>;
  inspect: { survival: string };
};

const BOARD_PIXEL_SIZE = 700;
const CELL_PIXEL_SIZE = BOARD_PIXEL_SIZE / BOARD_SIZE;
const PIECE_TOP_INSET = 32;
const PIECE_EDGE_RADIUS = 34;
type BoardPoint = Pick<Piece, "row" | "col">;

function cellCenter(piece: BoardPoint) {
  return {
    x: (piece.col + 0.5) * CELL_PIXEL_SIZE,
    y: (piece.row + 0.5) * CELL_PIXEL_SIZE,
  };
}
function relationDistance(first: BoardPoint, second: BoardPoint) {
  return Math.hypot(first.col - second.col, first.row - second.row);
}

function assignNearestAnchors(pieces: Piece[], inspected: BoardPoint) {
  if (pieces.length === 1) return new Map([[pieces[0].id, 0]]);
  const spread = Math.min(28, 10 + pieces.length * 4);
  const available = Array.from(
    { length: pieces.length },
    (_, index) => -spread + (spread * 2 * index) / (pieces.length - 1),
  );
  const assignments = new Map<number, number>();

  for (const piece of pieces) {
    const desiredOffset = Math.max(
      -spread,
      Math.min(spread, (piece.col - inspected.col) * CELL_PIXEL_SIZE),
    );
    let bestIndex = 0;
    for (let index = 1; index < available.length; index += 1) {
      const candidateDistance = Math.abs(available[index] - desiredOffset);
      const bestDistance = Math.abs(available[bestIndex] - desiredOffset);
      if (
        candidateDistance < bestDistance ||
        (candidateDistance === bestDistance &&
          Math.abs(available[index]) < Math.abs(available[bestIndex]))
      ) {
        bestIndex = index;
      }
    }
    assignments.set(piece.id, available[bestIndex]);
    available.splice(bestIndex, 1);
  }

  return assignments;
}

function relationPath(
  source: Piece,
  target: BoardPoint,
  laneSlot: number,
  sourceSpread: number,
  targetOffsetX: number,
) {
  const sourceCenter = cellCenter(source);
  const targetCenter = cellCenter(target);
  const centerDeltaX = targetCenter.x - sourceCenter.x;
  const centerDeltaY = targetCenter.y - sourceCenter.y;
  const centerDistance = Math.hypot(centerDeltaX, centerDeltaY) || 1;
  const directionX = centerDeltaX / centerDistance;
  const directionY = centerDeltaY / centerDistance;
  const start = {
    x: sourceCenter.x + directionX * PIECE_EDGE_RADIUS - directionY * sourceSpread,
    y: sourceCenter.y + directionY * PIECE_EDGE_RADIUS + directionX * sourceSpread,
  };
  const end = {
    x: targetCenter.x + targetOffsetX,
    y: targetCenter.y - PIECE_TOP_INSET,
  };
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  const distance = Math.hypot(deltaX, deltaY) || 1;
  const sameColumn = Math.abs(sourceCenter.x - targetCenter.x) < 1;
  const laneWidth = Math.min(88, (sameColumn ? 64 : 34) + distance * 0.035);
  const laneOffset =
    Math.min(86, laneWidth + (Math.abs(laneSlot) - 1) * 14) * Math.sign(laneSlot);
  const lift = Math.min(112, Math.max(44, distance * 0.22));
  const apexY = Math.max(12, Math.min(start.y, end.y) - lift);
  const descent = Math.min(64, Math.max(32, distance * 0.14));
  const approachSide = Math.sign(start.x - end.x) || Math.sign(laneSlot);
  const approachWidth = Math.min(34, Math.max(20, distance * 0.055));
  const controlOne = {
    x: start.x + laneOffset,
    y: apexY,
  };
  const controlTwo = {
    x: end.x + approachSide * approachWidth,
    y: Math.max(12, end.y - descent),
  };
  return "M " + start.x + " " + start.y + " C " + controlOne.x + " " + controlOne.y + ", " + controlTwo.x + " " + controlTwo.y + ", " + end.x + " " + end.y;
}
function InspectionArrows({
  inspected,
  relations,
  view,
  extraTargets = [],
}: {
  inspected: Piece;
  relations: Relations;
  view: "incoming" | "outgoing";
  extraTargets?: BoardPoint[];
}) {
  const arrows = [
    ...relations.attackers.map((piece, index) => ({ piece, kind: "attacker" as const, index })),
    ...relations.supporters.map((piece, index) => ({
      piece,
      kind: "supporter" as const,
      index: index + relations.attackers.length,
    })),
  ].sort(
    (first, second) =>
      relationDistance(first.piece, inspected) - relationDistance(second.piece, inspected) ||
      first.piece.id - second.piece.id,
  );
  const anchorOffsets = assignNearestAnchors(
    arrows.map(({ piece }) => piece),
    inspected,
  );
  const laneCounts = new Map<number, number>();
  return (
    <svg
      className="inspection-arrows"
      viewBox={"0 0 " + BOARD_PIXEL_SIZE + " " + BOARD_PIXEL_SIZE}
      aria-hidden="true"
    >
      <defs>
        <marker id="inspection-arrowhead-red" markerWidth="7" markerHeight="8" refX="6.5" refY="4" orient="auto" markerUnits="strokeWidth">
          <path d="M 0 0 L 7 4 L 0 8 L 2 4 z" fill="var(--arrow-red)" />
        </marker>
        <marker id="inspection-arrowhead-blue" markerWidth="7" markerHeight="8" refX="6.5" refY="4" orient="auto" markerUnits="strokeWidth">
          <path d="M 0 0 L 7 4 L 0 8 L 2 4 z" fill="var(--arrow-blue)" />
        </marker>
      </defs>
      {arrows.map(({ piece, kind, index }) => {
        const source = view === "incoming" ? piece : inspected;
        const target = view === "incoming" ? inspected : piece;
        const sourcePlayer = source.player;
        const anchorOffset = anchorOffsets.get(piece.id) ?? 0;
        const horizontalDirection = Math.sign(piece.col - inspected.col);
        const laneDirection = horizontalDirection || Math.sign(anchorOffset) || (index % 2 === 0 ? 1 : -1);
        const laneRank = (laneCounts.get(laneDirection) ?? 0) + 1;
        laneCounts.set(laneDirection, laneRank);
        const laneSlot = laneDirection * laneRank;
        const sourceSpread = view === "outgoing" ? anchorOffset : 0;
        const targetOffsetX = view === "incoming" ? anchorOffset : 0;
        return (
          <path
            className={"inspection-arrow " + kind + " " + sourcePlayer}
            d={relationPath(source, target, laneSlot, sourceSpread, targetOffsetX)}
            markerEnd={"url(#inspection-arrowhead-" + sourcePlayer + ")"}
            key={kind + "-" + piece.id}
          />
        );
      })}
      {view === "outgoing" && extraTargets.map((target, index) => (
        <path
          className={"inspection-arrow attacker " + inspected.player}
          d={relationPath(inspected, target, index + 1, 0, 0)}
          markerEnd={"url(#inspection-arrowhead-" + inspected.player + ")"}
          key={"terrain-" + target.row + "-" + target.col}
        />
      ))}
    </svg>
  );
}

function CellSourceArrows({ target, sources }: { target: BoardPoint; sources: Piece[] }) {
  const relations: Relations = {
    attackers: sources.filter((piece) => piece.player === "red"),
    supporters: sources.filter((piece) => piece.player === "blue"),
  };
  const virtualTarget: Piece = { id: -1, player: "red", type: "scout", row: target.row, col: target.col };
  return <InspectionArrows inspected={virtualTarget} relations={relations} view="incoming" />;
}

export function BattleBoard({
  boardPieces,
  stats,
  influence,
  terrain,
  highlighted,
  displayPendingIds,
  breakingPieces,
  chargingMoves,
  isBreaking,
  inspectedId,
  inspectedCell,
  inspectedCellSources,
  inspectionActive,
  inspectionFocusIds,
  activeInspectionRelations,
  inspectionObstacleTargetKeys,
  inspectionView,
  showInspectionArrows,
  placementPreview,
  previewOrigin,
  previewPlayer,
  selectorEligibleKeys,
  selectorTargetKeys,
  selectorTargetOrder,
  viewPlayer,
  phase,
  isReplaying,
  pieceDisplay,
  lang,
  copy,
  onHoverCell,
  onActivateCell,
  onAimPlacement,
  onMovePlacement,
  onCancelPlacement,
}: {
  boardPieces: Map<string, Piece>;
  stats: Map<number, PieceStats>;
  influence: Map<string, { red: number; blue: number }>;
  terrain: TerrainCell[];
  highlighted: Set<string>;
  displayPendingIds: number[];
  breakingPieces: Piece[];
  chargingMoves: { piece: Piece; fromRow: number; fromCol: number }[];
  isBreaking: boolean;
  inspectedId: number | null;
  inspectedCell: [number, number] | null;
  inspectedCellSources: Piece[];
  inspectionActive: boolean;
  inspectionFocusIds: Set<number>;
  activeInspectionRelations: Relations | null;
  inspectionObstacleTargetKeys: Set<string>;
  inspectionView: "incoming" | "outgoing";
  showInspectionArrows: boolean;
  placementPreview: {
    player: Player;
    type: PieceType;
    row: number;
    col: number;
    direction?: Direction;
  } | null;
  previewOrigin: [number, number] | null;
  previewPlayer: Player;
  selectorEligibleKeys: Set<string>;
  selectorTargetKeys: Set<string>;
  selectorTargetOrder: Map<string, number>;
  viewPlayer: Player;
  phase: "placement" | "ready" | "settling" | "finished";
  isReplaying: boolean;
  pieceDisplay: PieceDisplay;
  lang: Language;
  copy: BattleBoardCopy;
  onHoverCell: (cell: [number, number] | null) => void;
  onActivateCell: (row: number, col: number) => void;
  onAimPlacement: (direction: Direction) => void;
  onMovePlacement: (row: number, col: number) => void;
  onCancelPlacement: () => void;
}) {
  const aimGestureRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    moved: boolean;
    mode: "move" | "aim";
    liftY: number;
    outsideBoard: boolean;
  } | null>(null);
  const suppressPlacementClickRef = useRef(false);
  const terrainKeys = new Set(terrain.map((cell) => cellKey(cell.row, cell.col)));
  const inspected = inspectedId === null
    ? null
    : Array.from(boardPieces.values()).find((piece) => piece.id === inspectedId) ?? null;
  const isDirectionalPreview = placementPreview
    ? ["musket", "shield", "halberd", "ram", "charger"].includes(placementPreview.type)
    : false;
  const ramImpactKey = placementPreview?.type === "ram"
    ? (() => {
        const obstacle = findObstacleInDirection(
          placementPreview.row,
          placementPreview.col,
          placementPreview.direction ?? "up",
          terrain,
        );
        return obstacle ? cellKey(obstacle.row, obstacle.col) : null;
      })()
    : null;
  const hasTacticalPreview = Boolean(previewOrigin || placementPreview);

  function beginAim(event: React.PointerEvent<HTMLDivElement>) {
    if (!placementPreview) return;
    const target = event.target;
    const startsOnPreview = target instanceof Element && Boolean(
      target.closest(".placement-preview-piece"),
    );
    if (!startsOnPreview && !isDirectionalPreview) return;
    aimGestureRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
      mode: startsOnPreview ? "move" : "aim",
      liftY: startsOnPreview && event.pointerType === "touch" ? TOUCH_DRAG_LIFT_PX : 0,
      outsideBoard: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function updateAim(event: React.PointerEvent<HTMLDivElement>) {
    const gesture = aimGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId || !placementPreview) return;
    const moved = Math.hypot(
      event.clientX - gesture.startX,
      event.clientY - gesture.startY,
    ) >= 10;
    if (!moved && !gesture.moved) return;
    gesture.moved = true;
    event.preventDefault();

    const bounds = event.currentTarget.getBoundingClientRect();
    if (gesture.mode === "move") {
      const projectedY = event.clientY - gesture.liftY;
      const col = Math.floor(((event.clientX - bounds.left) / bounds.width) * BOARD_SIZE);
      const row = Math.floor(((projectedY - bounds.top) / bounds.height) * BOARD_SIZE);
      gesture.outsideBoard = row < 0 || row >= BOARD_SIZE || col < 0 || col >= BOARD_SIZE;
      if (!gesture.outsideBoard) {
        onMovePlacement(row, col);
      }
      return;
    }

    const centerX = bounds.left + ((placementPreview.col + 0.5) / BOARD_SIZE) * bounds.width;
    const centerY = bounds.top + ((placementPreview.row + 0.5) / BOARD_SIZE) * bounds.height;
    const dx = event.clientX - centerX;
    const dy = event.clientY - centerY;
    const direction: Direction = Math.abs(dx) > Math.abs(dy)
      ? dx >= 0 ? "right" : "left"
      : dy >= 0 ? "down" : "up";
    onAimPlacement(direction);
  }

  function finishAim(event: React.PointerEvent<HTMLDivElement>) {
    const gesture = aimGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    aimGestureRef.current = null;
    if (gesture.mode === "move" && gesture.moved && gesture.outsideBoard) {
      onCancelPlacement();
    }
    if (gesture.moved) {
      suppressPlacementClickRef.current = true;
      window.setTimeout(() => {
        suppressPlacementClickRef.current = false;
      }, 0);
    }
  }

  return (
    <div className={`board-frame ${phase === "settling" ? "is-settling" : ""} ${isReplaying ? "is-replaying" : ""}`}>
      <div
        className={`board ${inspectionActive ? "is-inspecting" : ""} ${placementPreview ? "has-placement-preview" : ""} ${hasTacticalPreview ? "has-tactical-preview" : ""} ${isDirectionalPreview ? "is-aiming-placement" : ""}`}
        role="grid"
        aria-label="7x7 Battle Array Board"
        onPointerDown={beginAim}
        onPointerMove={updateAim}
        onPointerUp={finishAim}
        onPointerCancel={finishAim}
      >
        {Array.from({ length: BOARD_SIZE * BOARD_SIZE }, (_, index) => {
          const row = Math.floor(index / BOARD_SIZE);
          const col = index % BOARD_SIZE;
          const key = cellKey(row, col);
          const piece = boardPieces.get(key);
          const isFenceCell = terrainKeys.has(key);
          const isRamImpactTarget = Boolean(isFenceCell && key === ramImpactKey);
          const pieceStats = piece ? stats.get(piece.id) : null;
          const cellInfluence = influence.get(key);
          const redInfluence = cellInfluence?.red ?? 0;
          const blueInfluence = cellInfluence?.blue ?? 0;
          const dominantPlayer: Player | null =
            redInfluence === blueInfluence
              ? null
              : redInfluence > blueInfluence
                ? "red"
                : "blue";
          const zoneClass =
            redInfluence === 0 && blueInfluence === 0
              ? ""
              : dominantPlayer === null
                ? "zone-balanced"
                : dominantPlayer === "red"
                  ? "zone-danger"
                  : "zone-support";
          const zoneSymbol =
            zoneClass === "zone-balanced"
              ? "="
              : dominantPlayer
                ? dominantPlayer === viewPlayer
                  ? "+"
                  : "!"
                : "";
          const isPending = piece ? displayPendingIds.includes(piece.id) : false;
          const isPlacementPreview = Boolean(
            placementPreview && placementPreview.row === row && placementPreview.col === col,
          );
          const isPreviewOrigin = Boolean(
            isPlacementPreview ||
            (previewOrigin && previewOrigin[0] === row && previewOrigin[1] === col),
          );
          const isSelectorEligible = Boolean(
            placementPreview &&
            (placementPreview.type === "selector" || placementPreview.type === "sentry" || placementPreview.type === "mason") &&
            selectorEligibleKeys.has(key),
          );
          const isSelectorTarget = selectorTargetKeys.has(key);
          const isPreviewAffected = Boolean(piece && (highlighted.has(key) || isSelectorTarget));
          const isPreviewAttack = Boolean(isPreviewAffected && piece?.player !== previewPlayer);
          const isPreviewSupport = Boolean(isPreviewAffected && piece?.player === previewPlayer);
          const isBreakingPiece = Boolean(piece && isBreaking && isPending);
          const isChargingPiece = Boolean(
            piece && chargingMoves.some((move) => move.piece.id === piece.id),
          );
          const isInspected = piece?.id === inspectedId;
          const isInspectedCell = Boolean(
            inspectedCell && inspectedCell[0] === row && inspectedCell[1] === col,
          );
          const isInspectionCellSource = Boolean(
            inspectionActive && piece && inspectedCellSources.some((source) => source.id === piece.id),
          );
          const isInspectionObstacleTarget = inspectionActive && inspectionObstacleTargetKeys.has(key);
          const isInspectionFocus = piece ? inspectionFocusIds.has(piece.id) : false;
          const isInspectionTarget = inspectionActive && isInspected;
          const isInspectionAttacker = Boolean(
            inspectionActive &&
              piece &&
              activeInspectionRelations?.attackers.some((candidate) => candidate.id === piece.id),
          );
          const isInspectionSupporter = Boolean(
            inspectionActive &&
              piece &&
              activeInspectionRelations?.supporters.some((candidate) => candidate.id === piece.id),
          );
          const isInspectionMuted = Boolean(
            inspectionActive && piece && !isInspectionFocus,
          );
          const survivalValue = pieceStats?.survival ?? 0;
          const badgeClass =
            survivalValue < 0
              ? "dying"
              : survivalValue > 0
                ? "living"
                : "neutral";

          return (
            <button
              className={[
                "cell",
                highlighted.has(key) ? "in-range" : "",
                zoneClass,
                piece ? "occupied" : "",
                isFenceCell ? "fence-cell" : "",
                isRamImpactTarget ? "ram-impact-target" : "",
                isPlacementPreview ? "placement-preview-cell" : "",
                isPreviewOrigin ? "preview-origin" : "",
                isSelectorEligible ? "selector-eligible" : "",
                isSelectorTarget ? "selector-selected" : "",
                isPreviewAttack ? "preview-attack" : "",
                isPreviewSupport ? "preview-support" : "",
                isInspected ? "inspected" : "",
                isInspectionTarget ? "inspection-target" : "",
                isInspectedCell ? "inspection-cell-target" : "",
                isInspectionCellSource ? "inspection-cell-source" : "",
                isInspectionObstacleTarget ? "inspection-obstacle-target" : "",
                isInspectionAttacker ? "inspection-attacker" : "",
                isInspectionSupporter ? "inspection-supporter" : "",
                inspectionActive && piece ? `inspection-player-${piece.player}` : "",
                isInspectionMuted ? "inspection-muted" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              key={key}
              role="gridcell"
              data-board-row={row}
              data-board-col={col}
              aria-label={
                isFenceCell
                  ? "Obstacle"
                  : isPlacementPreview && placementPreview
                    ? `${copy.players[placementPreview.player]} ${copy.pieces[placementPreview.type].name} preview; tap board to place`
                  : piece
                    ? `${copy.players[piece.player]}${copy.pieces[piece.type].name}`
                    : `Row ${row + 1} Col ${col + 1}`
              }
              onMouseEnter={() => onHoverCell([row, col])}
              onMouseLeave={() => onHoverCell(null)}
              onFocus={() => onHoverCell([row, col])}
              onClick={() => {
                if (suppressPlacementClickRef.current) {
                  suppressPlacementClickRef.current = false;
                  return;
                }
                onActivateCell(row, col);
              }}
            >
              {zoneSymbol && (
                <span className="zone-symbol" aria-hidden="true">
                  {zoneSymbol}
                </span>
              )}
              {isFenceCell && <span className="fence-mark" aria-hidden="true">▦</span>}
              {isInspectionObstacleTarget && (
                <span className="terrain-relation-badge">{lang === "zh" ? "目标" : "TARGET"}</span>
              )}
              {isSelectorTarget && (
                <span className="selector-target-mark" aria-hidden="true">
                  {selectorTargetOrder.get(key)}
                </span>
              )}
              {isPlacementPreview && placementPreview && !piece && (
                <span className={`piece ${placementPreview.player} placement-preview-piece`}>
                  <PieceFace
                    type={placementPreview.type}
                    display={pieceDisplay}
                    lang={lang}
                    direction={placementPreview.direction}
                  />
                </span>
              )}
              {piece && !isBreakingPiece && !isChargingPiece && (
                <span className={`piece ${piece.player} ${isPending ? "pending" : ""}`}>
                  <PieceFace type={piece.type} display={pieceDisplay} lang={lang} direction={piece.direction} />
                  {isInspectionAttacker && (
                    <span className={`relation-badge attacker ${piece.player}`}>
                      {inspectionView === "incoming"
                        ? lang === "zh" ? "攻击" : "ATTACKER"
                        : lang === "zh" ? "被攻" : "TARGET"}
                    </span>
                  )}
                  {isInspectionSupporter && (
                    <span className={`relation-badge supporter ${piece.player}`}>
                      {inspectionView === "incoming"
                        ? lang === "zh" ? "支援" : "SUPPORTER"
                        : lang === "zh" ? "受援" : "TARGET"}
                    </span>
                  )}
                  {isInspectionCellSource && (
                    <span className={`relation-badge cell-source ${piece.player}`}>
                      {lang === "zh" ? "来源" : "SOURCE"}
                    </span>
                  )}
                  {pieceStats && (
                    <span
                      className={`danger-badge ${badgeClass}`}
                      title={`${copy.inspect.survival} ${survivalValue}`}
                    >
                      {survivalValue > 0 ? `+${survivalValue}` : survivalValue}
                    </span>
                  )}
                </span>
              )}
            </button>
          );
        })}
        {chargingMoves.length > 0 && (
          <div className="lancer-charge-layer" aria-hidden="true">
            {chargingMoves.map(({ piece, fromRow, fromCol }) => (
              <span
                className="lancer-charge-slot"
                key={piece.id}
                style={{
                  left: `${(fromCol / BOARD_SIZE) * 100}%`,
                  top: `${(fromRow / BOARD_SIZE) * 100}%`,
                  "--charge-x": `${(piece.col - fromCol) * 100}%`,
                  "--charge-y": `${(piece.row - fromRow) * 100}%`,
                } as CSSProperties}
              >
                <span className={`piece ${piece.player} lancer-charge-piece`}>
                  <PieceFace
                    type={piece.type}
                    display={pieceDisplay}
                    lang={lang}
                    direction={piece.direction}
                  />
                </span>
              </span>
            ))}
          </div>
        )}
        {isBreaking && breakingPieces.length > 0 && (
          <div className="breaking-layer" aria-hidden="true">
            {breakingPieces.map((piece) => {
              const pieceStats = stats.get(piece.id);
              const survivalValue = pieceStats?.survival ?? 0;
              const badgeClass =
                survivalValue < 0
                  ? "dying"
                  : survivalValue > 0
                    ? "living"
                    : "neutral";

              return (
                <span
                  className="breaking-piece-slot"
                  key={piece.id}
                  style={{
                    left: `${((piece.col + 0.5) / BOARD_SIZE) * 100}%`,
                    top: `${((piece.row + 0.5) / BOARD_SIZE) * 100}%`,
                  }}
                >
                  <span className={`piece ${piece.player} breaking-piece`}>
                    <span className="breaking-fragment breaking-fragment-a">
                      <PieceFace type={piece.type} display={pieceDisplay} lang={lang} direction={piece.direction} />
                    </span>
                    <span className="breaking-fragment breaking-fragment-b">
                      <PieceFace type={piece.type} display={pieceDisplay} lang={lang} direction={piece.direction} />
                    </span>
                    <span className="breaking-fragment breaking-fragment-c">
                      <PieceFace type={piece.type} display={pieceDisplay} lang={lang} direction={piece.direction} />
                    </span>
                    <span className="breaking-fragment breaking-fragment-d">
                      <PieceFace type={piece.type} display={pieceDisplay} lang={lang} direction={piece.direction} />
                    </span>
                    {pieceStats && (
                      <span className={`danger-badge ${badgeClass} breaking-badge`}>
                        {survivalValue > 0 ? `+${survivalValue}` : survivalValue}
                      </span>
                    )}
                  </span>
                </span>
              );
            })}
          </div>
        )}
        {inspectionActive && showInspectionArrows && inspected && activeInspectionRelations && (
          <InspectionArrows
            inspected={inspected}
            relations={activeInspectionRelations}
            view={inspectionView}
            extraTargets={Array.from(inspectionObstacleTargetKeys).map((key) => {
              const [row, col] = key.split("-").map(Number);
              return { row, col };
            })}
          />
        )}
        {inspectionActive && showInspectionArrows && inspectedCell && (
          <CellSourceArrows
            target={{ row: inspectedCell[0], col: inspectedCell[1] }}
            sources={inspectedCellSources}
          />
        )}
      </div>
    </div>
  );
}
