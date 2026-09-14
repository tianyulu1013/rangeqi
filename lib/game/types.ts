export type Player = "red" | "blue";

export type TerrainType = "fence";

export type TerrainCell = {
  row: number;
  col: number;
  type: TerrainType;
};

export type BoardDefinition = {
  size: number;
  terrain: TerrainCell[];
};

export type Direction = "up" | "right" | "down" | "left";

export type PieceType =
  | "scout"
  | "guard"
  | "archer"
  | "cannon"
  | "musket"
  | "shield"
  | "crossbow"
  | "lancer"
  | "charger"
  | "halberd"
  | "selector"
  | "ram"
  | "sentry"
  | "engineer"
  | "knight"
  | "fortress";

export type Piece = {
  id: number;
  player: Player;
  type: PieceType;
  row: number;
  col: number;
  direction?: Direction;
  targets?: [number, number][];
  anchor?: [number, number];
  destroyedObstacle?: TerrainCell;
  createdObstacle?: TerrainCell;
};

export type PieceStats = {
  attacks: number;
  supports: number;
  survival: number;
};

export type CollapseStatSnapshot = PieceStats & {
  pieceId: number;
};

export type CollapsePieceChange = {
  piece: Piece;
  before: PieceStats;
  after: PieceStats;
};

export type CollapseLayer = {
  round: number;
  beforePieces: Piece[];
  removedPieces: Piece[];
  afterPieces: Piece[];
  beforeStats: CollapseStatSnapshot[];
  afterStats: CollapseStatSnapshot[];
  changedPieces: CollapsePieceChange[];
  minSurvival: number;
};

export type Relations = {
  attackers: Piece[];
  supporters: Piece[];
};

export type CollapseStage = "initial" | "charge" | "marked" | "removed" | "complete";

export type CollapseSnapshot = {
  pieces: Piece[];
  pendingIds: number[];
  round: number;
  stage: CollapseStage;
  affectedPieces: Piece[];
  survival?: number;
};
