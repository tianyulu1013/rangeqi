import { BOARD_SIZE, cellKey, findObstacleInDirection, isLegalPlacement } from "./board.ts";
import { countControlledCells, getControlledCells } from "./relations.ts";
import { advanceLancers, getStats, resolveCollapse, settleForEvaluation } from "./collapse.ts";
import { createSeededRandom, deriveSeed } from "./random.ts";
import type { PuzzleGoal, PuzzleLevel } from "./puzzles.ts";
import type { Direction, Piece, PieceType, Player, TerrainCell } from "./types.ts";

const DIRECTIONS: readonly Direction[] = ["up", "right", "down", "left"];
const DIRECTIONAL_TYPES = new Set<PieceType>(["musket", "shield", "halberd", "ram", "charger"]);
const ENEMY_FORMATION_TYPES: readonly PieceType[] = [
  "guard", "scout", "archer", "knight", "lancer", "cannon",
  "shield", "crossbow", "halberd", "fortress",
];
const PLAYER_FORMATION_TYPES: readonly PieceType[] = [
  "guard", "scout", "archer", "knight", "lancer", "cannon",
  "musket", "shield", "crossbow", "halberd", "fortress",
  "ram", "sentry", "selector", "charger",
  "mason",
];

const PIECE_TIER_COST: Record<PieceType, number> = {
  guard: 1,
  scout: 1,
  archer: 1,
  lancer: 1,
  knight: 1,
  cannon: 2,
  musket: 2,
  shield: 2,
  crossbow: 2,
  halberd: 2,
  ram: 2,
  sentry: 2,
  mason: 2,
  charger: 3,
  selector: 3,
  fortress: 3,
};

export type FormationThemeId = "freeform" | "stockade" | "pass" | "twin-towers" | "escort" | "ranged-line" | "pocket";

type FormationTemplate = {
  id: FormationThemeId;
  title: { en: string; zh: string };
  lesson: { en: string; zh: string };
  terrain: readonly [number, number][];
  enemies: readonly { row: number; col: number; types: readonly PieceType[] }[];
};

export const FORMATION_THEMES: readonly { id: FormationThemeId | "mixed"; title: { en: string; zh: string } }[] = [
  { id: "mixed", title: { en: "Mixed themes", zh: "混合主题" } },
  { id: "freeform", title: { en: "Free Formation", zh: "自由阵" } },
  { id: "stockade", title: { en: "Stockade", zh: "山寨" } },
  { id: "pass", title: { en: "Narrow Pass", zh: "隘口" } },
  { id: "twin-towers", title: { en: "Twin Towers", zh: "双塔" } },
  { id: "escort", title: { en: "Royal Guard", zh: "护送阵" } },
  { id: "ranged-line", title: { en: "Ranged Line", zh: "远射阵" } },
  { id: "pocket", title: { en: "Pocket Formation", zh: "口袋阵" } },
];

const FORMATION_TEMPLATES: readonly FormationTemplate[] = [
  {
    id: "stockade",
    title: { en: "Break the Stockade", zh: "破寨" },
    lesson: { en: "Find a way through the wall and collapse the defenders within.", zh: "越过寨墙，瓦解内部守军。" },
    terrain: [[0, 1], [0, 2], [0, 4], [0, 5], [1, 1], [1, 5], [2, 1], [2, 5]],
    enemies: [
      { row: 1, col: 3, types: ["fortress"] },
      { row: 2, col: 2, types: ["archer", "crossbow"] },
      { row: 2, col: 3, types: ["guard", "shield"] },
      { row: 2, col: 4, types: ["archer", "cannon"] },
      { row: 3, col: 2, types: ["guard", "lancer"] },
      { row: 3, col: 3, types: ["shield", "knight"] },
      { row: 3, col: 4, types: ["guard", "halberd"] },
    ],
  },
  {
    id: "pass",
    title: { en: "The Narrow Pass", zh: "夺隘" },
    lesson: { en: "Unravel a defense stacked through a narrow corridor.", zh: "破解沿狭窄通路层层展开的守军。" },
    terrain: [[0, 1], [0, 5], [1, 1], [1, 5], [3, 1], [3, 5], [4, 1], [4, 5], [6, 1], [6, 5]],
    enemies: [
      { row: 1, col: 3, types: ["crossbow", "archer"] },
      { row: 2, col: 2, types: ["guard", "shield"] },
      { row: 2, col: 3, types: ["fortress", "knight"] },
      { row: 2, col: 4, types: ["guard", "shield"] },
      { row: 3, col: 3, types: ["lancer", "halberd"] },
      { row: 4, col: 3, types: ["guard", "knight"] },
    ],
  },
  {
    id: "twin-towers",
    title: { en: "Twin Towers", zh: "双塔" },
    lesson: { en: "Break two mutually protected strongpoints in one collapse.", zh: "在一次崩塌中同时破解两个互保据点。" },
    terrain: [[1, 1], [1, 5], [3, 2], [3, 4]],
    enemies: [
      { row: 2, col: 2, types: ["fortress"] },
      { row: 2, col: 4, types: ["fortress"] },
      { row: 1, col: 2, types: ["archer", "crossbow"] },
      { row: 1, col: 4, types: ["archer", "cannon"] },
      { row: 2, col: 3, types: ["shield", "guard"] },
      { row: 3, col: 1, types: ["guard", "lancer"] },
      { row: 3, col: 5, types: ["guard", "halberd"] },
    ],
  },
  {
    id: "escort",
    title: { en: "Royal Guard", zh: "护送阵" },
    lesson: { en: "Cut through the layered guard around the central bastion.", zh: "切断层层护卫，击破中央堡垒。" },
    terrain: [[0, 0], [0, 6], [6, 0], [6, 6]],
    enemies: [
      { row: 3, col: 3, types: ["fortress"] },
      { row: 2, col: 3, types: ["shield", "guard"] },
      { row: 3, col: 2, types: ["guard", "knight"] },
      { row: 3, col: 4, types: ["guard", "knight"] },
      { row: 4, col: 3, types: ["shield", "halberd"] },
      { row: 2, col: 2, types: ["archer", "crossbow"] },
      { row: 2, col: 4, types: ["archer", "cannon"] },
    ],
  },
  {
    id: "ranged-line",
    title: { en: "Under Fire", zh: "破射阵" },
    lesson: { en: "Collapse the front line without feeding the ranged formation behind it.", zh: "避开远程火力，瓦解前后相护的射阵。" },
    terrain: [[1, 0], [1, 6], [5, 0], [5, 6]],
    enemies: [
      { row: 1, col: 2, types: ["cannon", "crossbow"] },
      { row: 1, col: 3, types: ["archer", "cannon"] },
      { row: 1, col: 4, types: ["crossbow", "archer"] },
      { row: 3, col: 2, types: ["shield", "guard"] },
      { row: 3, col: 3, types: ["fortress", "knight"] },
      { row: 3, col: 4, types: ["shield", "guard"] },
    ],
  },
  {
    id: "pocket",
    title: { en: "The Pocket", zh: "破口袋阵" },
    lesson: { en: "Turn an encircling formation against its own support chain.", zh: "在合围成形前，反过来利用敌方支援链。" },
    terrain: [[0, 3], [6, 3]],
    enemies: [
      { row: 1, col: 1, types: ["archer", "crossbow"] },
      { row: 2, col: 2, types: ["guard", "lancer"] },
      { row: 3, col: 2, types: ["shield", "knight"] },
      { row: 4, col: 2, types: ["guard", "halberd"] },
      { row: 5, col: 1, types: ["archer", "cannon"] },
      { row: 3, col: 3, types: ["fortress", "shield"] },
    ],
  },
];

export type GeneratedPlacement = {
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

export type GeneratedPuzzle = PuzzleLevel & {
  generation: {
    seed: string;
    theme: FormationThemeId;
    themeTitle: { en: string; zh: string };
    enemyFormationSize: number;
    handSize: number;
    essentialPieces: number;
    knownSolution: GeneratedPlacement[];
    sampledAttempts: number;
    sampledWins: number;
    estimatedWinRate: number;
    collapseRounds: number;
    score: number;
    downgradedPieces?: number;
  };
};

export type PuzzleGeneratorOptions = {
  seed: string;
  count?: number;
  attempts?: number;
  minHandSize?: number;
  maxHandSize?: number;
  minCollapseRounds?: number;
  maxSampleWinRate?: number;
  sampleAttempts?: number;
  goal?: PuzzleGoal;
  player?: Player;
  theme?: FormationThemeId | "mixed";
};

export type CustomSolutionValidation = {
  passed: boolean;
  collapseRounds: number;
  friendlySurvivors: number;
  enemySurvivors: number;
  redundantPieces: number;
  puzzle: GeneratedPuzzle | null;
};

export function evaluatePuzzleGoal(
  pieces: Piece[], terrain: TerrainCell[], player: Player, enemy: Player, goal: PuzzleGoal,
) {
  const finalPieces = settleForEvaluation(pieces, terrain);
  const friendly = finalPieces.filter((piece) => piece.player === player);
  const enemies = finalPieces.filter((piece) => piece.player === enemy);
  if (goal.type === "eliminate-all-enemies") {
    const protectedIds = new Set(goal.protectedPieceIds ?? []);
    const basePassed = enemies.length === 0 && friendly.length >= (goal.minFriendlySurvivors ?? 0) &&
      [...protectedIds].every((id) => finalPieces.some((piece) => piece.id === id));
    const reducedGoal: PuzzleGoal = { ...goal, requireEveryFriendlyEssential: false };
    const redundantFriendlyIds = basePassed && goal.requireEveryFriendlyEssential
      ? pieces.filter((piece) => piece.player === player).filter((candidate) =>
          evaluatePuzzleGoal(pieces.filter((piece) => piece.id !== candidate.id), terrain, player, enemy, reducedGoal).passed,
        ).map((piece) => piece.id)
      : [];
    return {
      passed: basePassed && redundantFriendlyIds.length === 0,
      finalPieces,
      redundantFriendlyIds,
    };
  }
  const redAlive = finalPieces.filter((piece) => piece.player === "red").length;
  const blueAlive = finalPieces.filter((piece) => piece.player === "blue").length;
  const controlled = countControlledCells(finalPieces, terrain);
  const winner = redAlive === blueAlive
    ? controlled.red === controlled.blue ? null : controlled.red > controlled.blue ? "red" : "blue"
    : redAlive > blueAlive ? "red" : "blue";
  return { passed: winner === player, finalPieces };
}

function allCells() {
  return Array.from({ length: BOARD_SIZE * BOARD_SIZE }, (_, index) =>
    [Math.floor(index / BOARD_SIZE), index % BOARD_SIZE] as [number, number]);
}

function directionFor(random: ReturnType<typeof createSeededRandom>, type: PieceType) {
  return DIRECTIONAL_TYPES.has(type) ? random.pick(DIRECTIONS) : undefined;
}

function effectiveTerrain(terrain: TerrainCell[], placements: GeneratedPlacement[]) {
  let active = terrain.map((cell) => ({ ...cell }));
  for (const placement of placements) {
    if (placement.createdObstacle && !active.some((cell) =>
      cell.row === placement.createdObstacle!.row && cell.col === placement.createdObstacle!.col)) {
      active.push({ ...placement.createdObstacle });
    }
    if (placement.destroyedObstacle) {
      active = active.filter((cell) =>
        cell.row !== placement.destroyedObstacle!.row || cell.col !== placement.destroyedObstacle!.col);
    }
  }
  return active;
}

function placementVariants(
  random: ReturnType<typeof createSeededRandom>,
  player: Player,
  type: PieceType,
  row: number,
  col: number,
  pieces: Piece[],
  terrain: TerrainCell[],
): GeneratedPlacement[] {
  if (type === "mason") {
    return [[-1, 0], [1, 0], [0, -1], [0, 1]].flatMap(([dr, dc]) => {
      const targetRow = row + dr;
      const targetCol = col + dc;
      return isLegalPlacement(targetRow, targetCol, pieces, terrain)
        ? [{ player, type, row, col, createdObstacle: { row: targetRow, col: targetCol, type: "fence" as const } }]
        : [];
    });
  }
  if (type === "sentry") {
    return random.shuffle(terrain.filter((obstacle) =>
      Math.max(Math.abs(obstacle.row - row), Math.abs(obstacle.col - col)) <= 2,
    )).slice(0, 3).map((obstacle) => ({ player, type, row, col, anchor: [obstacle.row, obstacle.col] }));
  }
  if (type === "selector") {
    const possible = allCells().filter(([targetRow, targetCol]) =>
      (targetRow !== row || targetCol !== col) &&
      Math.max(Math.abs(targetRow - row), Math.abs(targetCol - col)) <= 2 &&
      !terrain.some((cell) => cell.row === targetRow && cell.col === targetCol));
    if (possible.length < 4) return [];
    const value = ([targetRow, targetCol]: [number, number]) => {
      const target = pieces.find((piece) => piece.row === targetRow && piece.col === targetCol);
      return target ? target.player === player ? 2 : 5 : 0;
    };
    const prioritized = random.shuffle(possible).sort((left, right) => value(right) - value(left));
    return [
      { player, type, row, col, targets: prioritized.slice(0, 4) },
      { player, type, row, col, targets: random.shuffle(possible).slice(0, 4) },
    ];
  }
  if (DIRECTIONAL_TYPES.has(type)) {
    const variants = DIRECTIONS.map((direction) => {
      const placement: GeneratedPlacement = { player, type, row, col, direction };
      if (type === "ram") {
        const obstacle = findObstacleInDirection(row, col, direction, terrain);
        if (obstacle) placement.destroyedObstacle = { ...obstacle };
      }
      return placement;
    });
    return type === "ram" ? variants.filter((placement) => placement.destroyedObstacle) : variants;
  }
  return [{ player, type, row, col }];
}

function controlsPiece(source: Piece, target: Piece, pieces: Piece[], terrain: TerrainCell[]) {
  return getControlledCells(source, pieces, terrain).some(([row, col]) => row === target.row && col === target.col);
}

function relationLinks(candidate: Piece, others: Piece[], terrain: TerrainCell[]) {
  const pieces = [...others, candidate];
  return others.filter((other) =>
    controlsPiece(candidate, other, pieces, terrain) || controlsPiece(other, candidate, pieces, terrain)).length;
}

function transformCell(row: number, col: number, rotation: number, mirrored: boolean): [number, number] {
  let nextRow = row;
  let nextCol = mirrored ? BOARD_SIZE - 1 - col : col;
  for (let step = 0; step < rotation; step += 1) {
    [nextRow, nextCol] = [nextCol, BOARD_SIZE - 1 - nextRow];
  }
  return [nextRow, nextCol];
}

function buildThemedEnemyFormation(
  random: ReturnType<typeof createSeededRandom>,
  enemy: Player,
  template: FormationTemplate,
  idBase: number,
) {
  const rotation = random.integer(0, 3);
  const mirrored = random.next() < 0.5;
  const terrain: TerrainCell[] = template.terrain.filter((_, index) => index < 2 || random.next() > 0.16).map(([row, col]) => {
    const [nextRow, nextCol] = transformCell(row, col, rotation, mirrored);
    return { row: nextRow, col: nextCol, type: "fence" };
  });
  const blocked = new Set(terrain.map((cell) => cellKey(cell.row, cell.col)));
  const occupied = new Set<string>();
  const enemySlots = template.enemies.slice(0, random.integer(Math.min(5, template.enemies.length), template.enemies.length));
  const enemies: Piece[] = enemySlots.map((slot, index) => {
    const [baseRow, baseCol] = transformCell(slot.row, slot.col, rotation, mirrored);
    const nearby: [number, number][] = random.next() < 0.55
      ? random.shuffle([[baseRow, baseCol], [baseRow - 1, baseCol], [baseRow + 1, baseCol], [baseRow, baseCol - 1], [baseRow, baseCol + 1]] as [number, number][])
      : [[baseRow, baseCol]];
    const [row, col] = nearby.find(([candidateRow, candidateCol]) =>
      candidateRow >= 0 && candidateRow < BOARD_SIZE && candidateCol >= 0 && candidateCol < BOARD_SIZE &&
      !blocked.has(cellKey(candidateRow, candidateCol)) && !occupied.has(cellKey(candidateRow, candidateCol)),
    ) ?? [baseRow, baseCol];
    occupied.add(cellKey(row, col));
    const type = random.pick(slot.types);
    return { id: idBase + index, player: enemy, type, row, col, direction: directionFor(random, type) };
  });
  return { enemies, terrain };
}

function buildEnemyFormation(
  random: ReturnType<typeof createSeededRandom>, enemy: Player, count: number, terrain: TerrainCell[], idBase: number,
) {
  const formation: Piece[] = [];
  const firstCells = allCells().filter(([row, col]) => row >= 1 && row <= 5 && col >= 1 && col <= 5 && isLegalPlacement(row, col, [], terrain));
  const firstCell = random.pick(firstCells);
  const firstType = random.pick(ENEMY_FORMATION_TYPES);
  formation.push({ id: idBase, player: enemy, type: firstType, row: firstCell[0], col: firstCell[1], direction: directionFor(random, firstType) });

  while (formation.length < count) {
    const candidates: { piece: Piece; links: number }[] = [];
    for (let trial = 0; trial < 180; trial += 1) {
      const legal = allCells().filter(([row, col]) => isLegalPlacement(row, col, formation, terrain));
      if (legal.length === 0) return null;
      const [row, col] = random.pick(legal);
      const type = random.pick(ENEMY_FORMATION_TYPES);
      const piece: Piece = { id: idBase + formation.length, player: enemy, type, row, col, direction: directionFor(random, type) };
      const links = relationLinks(piece, formation, terrain);
      if (links > 0) candidates.push({ piece, links });
    }
    if (candidates.length === 0) return null;
    candidates.sort((left, right) => right.links - left.links);
    formation.push(random.pick(candidates.slice(0, Math.min(18, candidates.length))).piece);
  }
  const stats = getStats(formation, terrain);
  const supported = formation.filter((piece) => (stats.get(piece.id)?.supports ?? 0) > 0).length;
  return supported >= Math.ceil(count * 0.7) ? formation : null;
}

function buildPlayerFormation(
  random: ReturnType<typeof createSeededRandom>, player: Player, enemies: Piece[], handSize: number, terrain: TerrainCell[], restartCount = 10,
) {
  for (let restart = 0; restart < restartCount; restart += 1) {
    const formation: Piece[] = [];
    while (formation.length < handSize) {
      const occupied = [...enemies, ...formation];
      const candidates: { piece: Piece; attacks: number; links: number; score: number }[] = [];
      for (let trial = 0; trial < 320; trial += 1) {
        const legal = allCells().filter(([row, col]) => isLegalPlacement(row, col, occupied, terrain));
        if (legal.length === 0) break;
        const [row, col] = random.pick(legal);
        const type = random.pick(PLAYER_FORMATION_TYPES);
        const piece: Piece = { id: 900000 + formation.length, player, type, row, col, direction: directionFor(random, type) };
        const full = [...occupied, piece];
        const attacks = enemies.filter((enemy) => controlsPiece(piece, enemy, full, terrain)).length;
        const supportsAllies = formation.filter((ally) => controlsPiece(piece, ally, full, terrain)).length;
        const supportedByAllies = formation.filter((ally) => controlsPiece(ally, piece, full, terrain)).length;
        const incoming = enemies.filter((enemyPiece) => controlsPiece(enemyPiece, piece, full, terrain)).length;
        const links = supportsAllies + supportedByAllies;
        if (formation.length === 0 ? attacks === 0 : attacks === 0 && supportsAllies < 2) continue;
        if (attacks === 0 && incoming > 0) continue;
        const safety = Math.max(-3, supportedByAllies - incoming);
        const score = attacks * 18 + supportsAllies * 3 + supportedByAllies + safety * 5 - incoming * 8 + random.next() * 4;
        candidates.push({ piece, attacks, links, score });
      }
      if (candidates.length === 0) break;
      candidates.sort((left, right) => right.score - left.score);
      formation.push(random.pick(candidates.slice(0, Math.min(20, candidates.length))).piece);
    }
    if (formation.length === handSize) return formation;
  }
  return null;
}

type PeelingCandidate = {
  placements: GeneratedPlacement[];
  score: number;
  enemyRemoved: number;
  enemyLayers: number;
  collapseRounds: number;
  destabilization: number;
};

function placementStateKey(placements: GeneratedPlacement[]) {
  return placements.map((placement) =>
    `${placement.type}:${placement.row}:${placement.col}:${placement.direction ?? "-"}:` +
    `${placement.anchor?.join(",") ?? "-"}:${placement.targets?.map((target) => target.join(",")).join(";") ?? "-"}:` +
    `${placement.createdObstacle ? cellKey(placement.createdObstacle.row, placement.createdObstacle.col) : "-"}`,
  ).sort().join("|");
}

function scorePeelingPosition(
  initialPieces: Piece[],
  enemies: Piece[],
  placements: GeneratedPlacement[],
  terrain: TerrainCell[],
  player: Player,
  enemy: Player,
  weakEnemyIds: Set<number>,
): PeelingCandidate {
  const activeTerrain = effectiveTerrain(terrain, placements);
  const pieces = asPieces(initialPieces, placements);
  const frames = resolveCollapse(pieces, activeTerrain);
  const finalPieces = frames.at(-1)?.pieces ?? pieces;
  const finalEnemyCount = finalPieces.filter((piece) => piece.player === enemy).length;
  const finalFriendlyCount = finalPieces.filter((piece) => piece.player === player).length;
  const enemyRemoved = enemies.length - finalEnemyCount;
  const enemyLayers = frames.filter((frame) =>
    frame.stage === "removed" && frame.affectedPieces.some((piece) => piece.player === enemy),
  ).length;
  const collapseRounds = frames.filter((frame) => frame.stage === "removed").length;
  const advancedPieces = advanceLancers(pieces, activeTerrain).pieces;
  const stats = getStats(advancedPieces, activeTerrain);
  const baseEnemyStats = getStats(initialPieces, terrain);
  const directPressure = enemies.reduce((total, target) => total + placements.filter((_, index) => {
    const source = advancedPieces.find((piece) => piece.id === 900000 + index);
    const advancedTarget = advancedPieces.find((piece) => piece.id === target.id) ?? target;
    return source ? controlsPiece(source, advancedTarget, advancedPieces, activeTerrain) : false;
  }).length, 0);
  const weakPressure = enemies.filter((target) => weakEnemyIds.has(target.id)).reduce((total, target) =>
    total + placements.filter((_, index) => {
      const source = advancedPieces.find((piece) => piece.id === 900000 + index);
      const advancedTarget = advancedPieces.find((piece) => piece.id === target.id) ?? target;
      return source ? controlsPiece(source, advancedTarget, advancedPieces, activeTerrain) : false;
    }).length, 0);
  const destabilization = enemies.reduce((total, target) => {
    const before = baseEnemyStats.get(target.id)?.survival ?? 0;
    const after = stats.get(target.id)?.survival ?? before;
    return total + Math.max(0, before - after);
  }, 0);
  const exposedAttackers = advancedPieces.filter((piece) => piece.player === player &&
    (stats.get(piece.id)?.attacks ?? 0) > (stats.get(piece.id)?.supports ?? 0)).length;
  const outputless = advancedPieces.filter((piece) => piece.player === player &&
    enemies.every((target) => {
      const advancedTarget = advancedPieces.find((candidate) => candidate.id === target.id) ?? target;
      return !controlsPiece(piece, advancedTarget, advancedPieces, activeTerrain);
    })).length;
  const tierCost = placements.reduce((total, placement) => total + PIECE_TIER_COST[placement.type], 0);
  const solvedBonus = finalEnemyCount === 0 ? 1200 : 0;
  return {
    placements,
    enemyRemoved,
    enemyLayers,
    collapseRounds,
    destabilization,
    score: solvedBonus + enemyRemoved * 150 + enemyLayers * 55 + destabilization * 24 + weakPressure * 18 +
      directPressure * 10 + finalFriendlyCount * 8 - exposedAttackers * 12 - outputless * 9 - tierCost * 7,
  };
}

function buildPeelingSolution(
  random: ReturnType<typeof createSeededRandom>,
  player: Player,
  enemy: Player,
  initialPieces: Piece[],
  enemies: Piece[],
  terrain: TerrainCell[],
  minHandSize: number,
  maxHandSize: number,
  minCollapseRounds: number,
  goal: PuzzleGoal,
  excludedTypes: ReadonlySet<PieceType> = new Set(),
) {
  const enemyStats = getStats(enemies, terrain);
  const weakestSurvival = Math.min(...enemies.map((piece) => enemyStats.get(piece.id)?.survival ?? 0));
  const weakEnemyIds = new Set(enemies.filter((piece) =>
    (enemyStats.get(piece.id)?.survival ?? 0) <= weakestSurvival + 1,
  ).map((piece) => piece.id));
  let beam: PeelingCandidate[] = [{ placements: [], score: 0, enemyRemoved: 0, enemyLayers: 0, collapseRounds: 0, destabilization: 0 }];

  for (let depth = 1; depth <= maxHandSize; depth += 1) {
    const expanded: PeelingCandidate[] = [];
    const seen = new Set<string>();
    for (const state of beam) {
      const activeTerrain = effectiveTerrain(terrain, state.placements);
      const occupied = asPieces(initialPieces, state.placements);
      const legal = allCells().filter(([row, col]) =>
        isLegalPlacement(row, col, occupied, activeTerrain) &&
        isLegalPlacement(row, col, [], terrain));
      if (legal.length === 0) continue;
      const trials = state.placements.length === 0 ? 220 : 52;
      for (let trial = 0; trial < trials; trial += 1) {
        const availableTypes = PLAYER_FORMATION_TYPES.filter((type) =>
          !excludedTypes.has(type) &&
          (type !== "selector" || state.placements.every((placement) => placement.type !== "selector")));
        if (availableTypes.length === 0) continue;
        const type = random.pick(availableTypes);
        const [row, col] = random.pick(legal);
        const variants = placementVariants(random, player, type, row, col, occupied, activeTerrain);
        if (variants.length === 0) continue;
        const placement = random.pick(variants);
        const placements = [...state.placements, placement];
        const key = placementStateKey(placements);
        if (seen.has(key)) continue;
        seen.add(key);
        const scored = scorePeelingPosition(initialPieces, enemies, placements, terrain, player, enemy, weakEnemyIds);
        // A move may be preparatory, but it must improve pressure, a collapse
        // layer, or the survival of an already productive formation.
        if (depth > 1 && scored.enemyRemoved < state.enemyRemoved && random.next() > 0.08) continue;
        expanded.push(scored);
      }
    }
    expanded.sort((left, right) => right.score - left.score);
    if (depth >= minHandSize) {
      const solved = expanded.filter((candidate) => candidate.collapseRounds >= minCollapseRounds &&
        solutionMeetsSpecialConstraints(candidate.placements) &&
        evaluatePuzzleGoal(asPieces(initialPieces, candidate.placements), effectiveTerrain(terrain, candidate.placements), player, enemy, goal).passed);
      if (solved.length > 0) return solved[0].placements;
    }
    beam = expanded.slice(0, 34);
    if (beam.length === 0) break;
  }
  return null;
}

function solutionMeetsSpecialConstraints(solution: GeneratedPlacement[]) {
  if (solution.filter((placement) => placement.type === "selector").length > 1) return false;
  const rams = solution.filter((placement) => placement.type === "ram");
  if (rams.some((placement) => !placement.destroyedObstacle)) return false;
  if (solution.some((placement) => placement.type === "mason" && !placement.createdObstacle)) return false;
  return true;
}

function asPlacements(pieces: Piece[]): GeneratedPlacement[] {
  return pieces.map(({ player, type, row, col, direction, targets, anchor, destroyedObstacle, createdObstacle }) =>
    ({ player, type, row, col, direction, targets, anchor, destroyedObstacle, createdObstacle }));
}

function asPieces(initial: Piece[], placements: GeneratedPlacement[]) {
  return [...initial, ...placements.map((placement, index) => ({ ...placement, id: 900000 + index }))];
}

function enemyCollapseSignature(pieces: Piece[], terrain: TerrainCell[], enemy: Player) {
  return resolveCollapse(pieces, terrain)
    .filter((frame) => frame.stage === "removed")
    .map((frame) => frame.affectedPieces.filter((piece) => piece.player === enemy).map((piece) => piece.id).sort((a, b) => a - b))
    .filter((ids) => ids.length > 0)
    .map((ids) => ids.join(","))
    .join("|");
}

function normalizeSolutionTiers(
  enemies: Piece[],
  terrain: TerrainCell[],
  solution: GeneratedPlacement[],
  player: Player,
  enemy: Player,
  goal: PuzzleGoal,
) {
  let placements = solution.map((placement) => ({ ...placement }));
  let downgradedPieces = 0;
  for (let pass = 0; pass < 3; pass += 1) {
    let changed = false;
    for (let index = 0; index < placements.length; index += 1) {
      const original = placements[index];
      const originalCost = PIECE_TIER_COST[original.type];
      if (originalCost <= 1) continue;
      const baselineTerrain = effectiveTerrain(terrain, placements);
      const baselinePieces = asPieces(enemies, placements);
      const baselineSignature = enemyCollapseSignature(baselinePieces, baselineTerrain, enemy);
      const baselineFriendly = settleForEvaluation(baselinePieces, baselineTerrain).filter((piece) => piece.player === player).length;
      const withoutOriginal = placements.filter((_, candidateIndex) => candidateIndex !== index);
      const occupied = asPieces(enemies, withoutOriginal);
      const terrainWithoutOriginal = effectiveTerrain(terrain, withoutOriginal);
      const cells = allCells().filter(([row, col]) =>
        isLegalPlacement(row, col, occupied, terrainWithoutOriginal) &&
        isLegalPlacement(row, col, [], terrain));
      cells.sort(([leftRow, leftCol], [rightRow, rightCol]) =>
        Math.abs(leftRow - original.row) + Math.abs(leftCol - original.col) -
        Math.abs(rightRow - original.row) - Math.abs(rightCol - original.col));
      const lowerTypes = PLAYER_FORMATION_TYPES.filter((type) => PIECE_TIER_COST[type] < originalCost)
        .sort((left, right) => PIECE_TIER_COST[left] - PIECE_TIER_COST[right]);
      let replacement: GeneratedPlacement | null = null;
      for (const type of lowerTypes) {
        const directions: readonly (Direction | undefined)[] = DIRECTIONAL_TYPES.has(type) ? DIRECTIONS : [undefined];
        for (const [row, col] of cells) {
          for (const direction of directions) {
            const variants = placementVariants(
              createSeededRandom(`normalize:${index}:${type}:${row}:${col}:${direction ?? "-"}`),
              player, type, row, col, occupied, terrainWithoutOriginal,
            ).filter((candidate) => candidate.direction === direction || direction === undefined);
            for (const candidate of variants) {
            const next = [...withoutOriginal.slice(0, index), candidate, ...withoutOriginal.slice(index)];
            const nextPieces = asPieces(enemies, next);
            const nextTerrain = effectiveTerrain(terrain, next);
            const evaluation = evaluatePuzzleGoal(nextPieces, nextTerrain, player, enemy, goal);
            if (!evaluation.passed) continue;
            if (enemyCollapseSignature(nextPieces, nextTerrain, enemy) !== baselineSignature) continue;
            const friendly = evaluation.finalPieces.filter((piece) => piece.player === player).length;
            if (friendly < baselineFriendly) continue;
            replacement = candidate;
            break;
            }
            if (replacement) break;
          }
          if (replacement) break;
        }
        if (replacement) break;
      }
      if (!replacement) continue;
      placements[index] = replacement;
      downgradedPieces += 1;
      changed = true;
    }
    if (!changed) break;
  }
  return { placements, downgradedPieces };
}

function groupHand(placements: GeneratedPlacement[]) {
  const entries = new Map<string, { player: Player; type: PieceType; count: number }>();
  for (const placement of placements) {
    const key = `${placement.player}:${placement.type}`;
    const entry = entries.get(key);
    if (entry) entry.count += 1;
    else entries.set(key, { player: placement.player, type: placement.type, count: 1 });
  }
  return [...entries.values()];
}

function randomAlternative(
  random: ReturnType<typeof createSeededRandom>, initial: Piece[], terrain: TerrainCell[], solution: GeneratedPlacement[],
) {
  const placements: GeneratedPlacement[] = [];
  for (const template of random.shuffle(solution.map(({ player, type }) => ({ player, type })))) {
    const legal = allCells().filter(([row, col]) => isLegalPlacement(row, col, asPieces(initial, placements), terrain));
    if (legal.length === 0) return null;
    const [row, col] = random.pick(legal);
    placements.push({ ...template, row, col, direction: directionFor(random, template.type) });
  }
  return placements;
}

function strategicAlternative(
  random: ReturnType<typeof createSeededRandom>,
  initial: Piece[],
  terrain: TerrainCell[],
  templates: Pick<GeneratedPlacement, "player" | "type">[],
  goal: PuzzleGoal,
  enemy: Player,
) {
  const placements: GeneratedPlacement[] = [];
  const ordered = random.shuffle(templates);
  for (const template of ordered) {
    const occupied = asPieces(initial, placements);
    const legal = allCells().filter(([row, col]) => isLegalPlacement(row, col, occupied, terrain));
    if (legal.length === 0) return null;
    const candidates: { placement: GeneratedPlacement; score: number }[] = [];
    for (let trial = 0; trial < 120; trial += 1) {
      const [row, col] = random.pick(legal);
      const direction = directionFor(random, template.type);
      const placement: GeneratedPlacement = { ...template, row, col, direction };
      const piece: Piece = { ...placement, id: 900000 + placements.length };
      const full = [...occupied, piece];
      const attacks = initial.filter((target) => target.player === enemy && controlsPiece(piece, target, full, terrain)).length;
      const links = relationLinks(piece, occupied.filter((other) => other.player === template.player), terrain);
      candidates.push({ placement, score: attacks * 12 + links * 5 + random.next() * 5 });
    }
    candidates.sort((left, right) => right.score - left.score);
    placements.push(random.pick(candidates.slice(0, Math.min(16, candidates.length))).placement);
    if (evaluatePuzzleGoal(asPieces(initial, placements), terrain, template.player, enemy, goal).passed) return placements;
  }
  return evaluatePuzzleGoal(asPieces(initial, placements), terrain, ordered[0]?.player ?? "blue", enemy, goal).passed
    ? placements
    : null;
}

function findReducedSolution(
  seed: string,
  initial: Piece[],
  terrain: TerrainCell[],
  solution: GeneratedPlacement[],
  goal: PuzzleGoal,
  enemy: Player,
) {
  const random = createSeededRandom(deriveSeed(seed, "reduced-solutions"));
  const templates = solution.map(({ player, type }) => ({ player, type }));

  // First exhaust every subset in the known layout. This cheaply catches filler
  // pieces that the constructive pass appended after the position was solved.
  for (let mask = 1; mask < (1 << solution.length) - 1; mask += 1) {
    const subset = solution.filter((_, index) => (mask & (1 << index)) !== 0);
    if (evaluatePuzzleGoal(asPieces(initial, subset), terrain, subset[0]?.player ?? "blue", enemy, goal).passed) return subset;
  }

  // Then actively look for a different, shorter arrangement. Sampling every
  // hand size matters: a four-piece solution is easy to miss when only six-piece
  // alternatives are tested.
  const trials = Math.max(64, solution.length * 14);
  for (let trial = 0; trial < trials; trial += 1) {
    const size = trial < solution.length - 1
      ? trial + 1
      : random.integer(1, solution.length - 1);
    const subset = random.shuffle(templates).slice(0, size);
    const found = strategicAlternative(random, initial, terrain, subset, goal, enemy);
    if (found) return found;
  }
  return null;
}

function candidateForAttempt(rootSeed: string, attempt: number, settings: {
  player: Player; goal: PuzzleGoal; minHandSize: number; maxHandSize: number;
  minCollapseRounds: number; maxSampleWinRate: number; sampleAttempts: number;
  theme: FormationThemeId | "mixed";
}): GeneratedPuzzle | null {
  const seed = deriveSeed(rootSeed, `themed-formation-${attempt}`);
  const random = createSeededRandom(seed);
  const enemy: Player = settings.player === "red" ? "blue" : "red";
  const template = settings.theme === "freeform"
    ? null
    : random.pick(settings.theme === "mixed"
        ? FORMATION_TEMPLATES
        : FORMATION_TEMPLATES.filter((candidate) => candidate.id === settings.theme));
  let terrain: TerrainCell[];
  let enemies: Piece[] | null;
  if (template) {
    ({ enemies, terrain } = buildThemedEnemyFormation(random, enemy, template, attempt * 100 + 1));
  } else {
    terrain = random.shuffle(allCells()).slice(0, random.integer(0, 3)).map(([row, col]) => ({ row, col, type: "fence" }));
    enemies = buildEnemyFormation(random, enemy, random.integer(5, 9), terrain, attempt * 100 + 1);
  }
  if (!enemies) return null;
  const enemyCount = enemies.length;
  const reducedGoal: PuzzleGoal = settings.goal.type === "eliminate-all-enemies"
    ? { ...settings.goal, requireEveryFriendlyEssential: false }
    : settings.goal;
  const rawSolution = buildPeelingSolution(
    random,
    settings.player,
    enemy,
    enemies,
    enemies,
    terrain,
    settings.minHandSize,
    settings.maxHandSize,
    settings.minCollapseRounds,
    reducedGoal,
  );
  if (!rawSolution) return null;
  const normalized = normalizeSolutionTiers(enemies, terrain, rawSolution, settings.player, enemy, reducedGoal);
  const useNormalized = solutionMeetsSpecialConstraints(normalized.placements);
  const solution = useNormalized ? normalized.placements : rawSolution;

  const solved = asPieces(enemies, solution);
  const solvedTerrain = effectiveTerrain(terrain, solution);
  const evaluation = evaluatePuzzleGoal(solved, solvedTerrain, settings.player, enemy, reducedGoal);
  if (!evaluation.passed) return null;
  const rounds = resolveCollapse(solved, solvedTerrain).filter((frame) => frame.stage === "removed").length;
  if (rounds < settings.minCollapseRounds) return null;

  const handSize = solution.length;
  let essentialPieces = 0;
  for (let index = 0; index < solution.length; index += 1) {
    const withoutOne = solution.filter((_, candidateIndex) => candidateIndex !== index);
    if (!evaluatePuzzleGoal(asPieces(enemies, withoutOne), effectiveTerrain(terrain, withoutOne), settings.player, enemy, reducedGoal).passed) essentialPieces += 1;
  }
  if (essentialPieces !== handSize) return null;

  const sampleRandom = createSeededRandom(deriveSeed(seed, "alternatives"));
  let sampledWins = 0;
  for (let sample = 0; sample < settings.sampleAttempts; sample += 1) {
    const alternative = randomAlternative(sampleRandom, enemies, terrain, solution);
    if (alternative && evaluatePuzzleGoal(asPieces(enemies, alternative), terrain, settings.player, enemy, reducedGoal).passed) sampledWins += 1;
  }
  const estimatedWinRate = sampledWins / settings.sampleAttempts;
  if (estimatedWinRate > settings.maxSampleWinRate) return null;

  const score = rounds * 24 + handSize * 22 + enemyCount * 4 + essentialPieces * 12 + terrain.length * 5 - Math.round(estimatedWinRate * 800);
  return {
    id: `generated-formation-${rootSeed.toLowerCase()}-${attempt}`,
    number: 0,
    title: template?.title ?? { en: "Break the Formation", zh: "破阵" },
    lesson: template?.lesson ?? { en: "Read the open formation and build your own answer.", zh: "观察自由敌阵，构筑自己的破阵方案。" },
    player: settings.player,
    enemy,
    pieces: enemies,
    terrain,
    hand: groupHand(solution),
    goal: settings.goal,
    generation: {
      seed,
      theme: template?.id ?? "freeform",
      themeTitle: template?.title ?? { en: "Free Formation", zh: "自由阵" },
      enemyFormationSize: enemyCount, handSize, essentialPieces,
      knownSolution: solution, sampledAttempts: settings.sampleAttempts,
      sampledWins, estimatedWinRate, collapseRounds: rounds, score,
      downgradedPieces: useNormalized ? normalized.downgradedPieces : 0,
    },
  };
}

export function generatePuzzleCandidates(options: PuzzleGeneratorOptions): GeneratedPuzzle[] {
  const count = Math.max(1, options.count ?? 60);
  const attempts = Math.max(count, options.attempts ?? 30000);
  const settings = {
    player: options.player ?? "blue" as Player,
    goal: options.goal ?? { type: "eliminate-all-enemies", minFriendlySurvivors: 1 } as PuzzleGoal,
    theme: options.theme ?? "mixed" as FormationThemeId | "mixed",
    minHandSize: Math.max(3, options.minHandSize ?? 4),
    maxHandSize: Math.max(options.minHandSize ?? 4, options.maxHandSize ?? 7),
    minCollapseRounds: Math.max(2, options.minCollapseRounds ?? 3),
    maxSampleWinRate: Math.max(0, options.maxSampleWinRate ?? 0.02),
    sampleAttempts: Math.max(80, options.sampleAttempts ?? 120),
  };
  const candidates: GeneratedPuzzle[] = [];
  for (let attempt = 0; attempt < attempts && candidates.length < count; attempt += 1) {
    const candidate = candidateForAttempt(options.seed, attempt, settings);
    if (candidate) candidates.push(candidate);
  }
  return candidates.sort((a, b) => b.generation.score - a.generation.score)
    .map((candidate, index) => ({ ...candidate, number: index + 1 }));
}

export function validateCustomSolution(options: {
  seed: string;
  pieces: Piece[];
  terrain: TerrainCell[];
  placements: GeneratedPlacement[];
  player?: Player;
}): CustomSolutionValidation {
  const player = options.player ?? "blue";
  const enemy: Player = player === "blue" ? "red" : "blue";
  const initialPieces = options.pieces.map((piece, index) => ({ ...piece, id: index + 1 }));
  const fixedFriendlies = initialPieces.filter((piece) => piece.player === player);
  const answerCells = new Set<string>();
  const hasIllegalPlacement = options.placements.some((placement) => {
    const key = cellKey(placement.row, placement.col);
    if (answerCells.has(key)) return true;
    answerCells.add(key);
    return !isLegalPlacement(placement.row, placement.col, initialPieces, options.terrain);
  });
  if (hasIllegalPlacement) {
    return {
      passed: false,
      collapseRounds: 0,
      friendlySurvivors: fixedFriendlies.length,
      enemySurvivors: initialPieces.filter((piece) => piece.player === enemy).length,
      redundantPieces: 0,
      puzzle: null,
    };
  }
  const goal: PuzzleGoal = {
    type: "eliminate-all-enemies",
    minFriendlySurvivors: Math.max(1, fixedFriendlies.length),
    protectedPieceIds: fixedFriendlies.map((piece) => piece.id),
  };
  const placements: GeneratedPlacement[] = [];
  let activeTerrain = options.terrain.map((cell) => ({ ...cell }));
  for (const source of options.placements) {
    const placement = { ...source, player };
    if (activeTerrain.some((cell) => cell.row === placement.row && cell.col === placement.col)) {
      return { passed: false, collapseRounds: 0, friendlySurvivors: fixedFriendlies.length, enemySurvivors: initialPieces.filter((piece) => piece.player === enemy).length, redundantPieces: 0, puzzle: null };
    }
    if (placement.type === "mason") {
      const obstacle = placement.createdObstacle;
      const occupiedByAnyPiece = obstacle && [...initialPieces, ...options.placements].some((piece) =>
        piece.row === obstacle.row && piece.col === obstacle.col);
      if (
        !obstacle ||
        Math.abs(obstacle.row - placement.row) + Math.abs(obstacle.col - placement.col) !== 1 ||
        obstacle.row < 0 || obstacle.row >= BOARD_SIZE || obstacle.col < 0 || obstacle.col >= BOARD_SIZE ||
        occupiedByAnyPiece ||
        activeTerrain.some((cell) => cell.row === obstacle.row && cell.col === obstacle.col)
      ) {
        return { passed: false, collapseRounds: 0, friendlySurvivors: fixedFriendlies.length, enemySurvivors: initialPieces.filter((piece) => piece.player === enemy).length, redundantPieces: 0, puzzle: null };
      }
      activeTerrain.push({ ...obstacle });
    }
    if (placement.type === "ram" && placement.direction) {
      const obstacle = findObstacleInDirection(placement.row, placement.col, placement.direction, activeTerrain);
      placement.destroyedObstacle = obstacle ? { ...obstacle } : undefined;
      if (obstacle) activeTerrain = activeTerrain.filter((cell) => cell !== obstacle);
    }
    placements.push(placement);
  }
  const solvedPieces = asPieces(initialPieces, placements);
  const evaluation = evaluatePuzzleGoal(solvedPieces, activeTerrain, player, enemy, goal);
  const frames = resolveCollapse(solvedPieces, activeTerrain);
  const collapseRounds = frames.filter((frame) => frame.stage === "removed").length;
  const friendlySurvivors = evaluation.finalPieces.filter((piece) => piece.player === player).length;
  const enemySurvivors = evaluation.finalPieces.filter((piece) => piece.player === enemy).length;
  let redundantPieces = 0;
  for (let index = 0; index < placements.length; index += 1) {
    const reduced = placements.filter((_, candidateIndex) => candidateIndex !== index);
    if (evaluatePuzzleGoal(asPieces(initialPieces, reduced), effectiveTerrain(options.terrain, reduced), player, enemy, goal).passed) {
      redundantPieces += 1;
    }
  }
  if (!evaluation.passed) {
    return { passed: false, collapseRounds, friendlySurvivors, enemySurvivors, redundantPieces, puzzle: null };
  }
  const seed = deriveSeed(options.seed, `manual-answer:${placementStateKey(placements)}`);
  const puzzle: GeneratedPuzzle = {
    id: `manual-${seed.toLowerCase()}`,
    number: 1,
    title: { en: "Designed Puzzle", zh: "自设计关卡" },
    lesson: { en: "Break the formation with the designed answer.", zh: "按照设计好的解法破解阵型。" },
    player,
    enemy,
    pieces: initialPieces,
    terrain: options.terrain.map((cell) => ({ ...cell })),
    hand: groupHand(placements),
    goal,
    generation: {
      seed,
      theme: "freeform",
      themeTitle: { en: "Designed answer", zh: "自设计答案" },
      enemyFormationSize: initialPieces.filter((piece) => piece.player === enemy).length,
      handSize: placements.length,
      essentialPieces: placements.length - redundantPieces,
      knownSolution: placements,
      sampledAttempts: 0,
      sampledWins: 0,
      estimatedWinRate: 0,
      collapseRounds,
      score: collapseRounds * 30 + (placements.length - redundantPieces) * 18,
    },
  };
  return { passed: true, collapseRounds, friendlySurvivors, enemySurvivors, redundantPieces, puzzle };
}

export function solveCustomFormation(options: {
  seed: string;
  pieces: Piece[];
  terrain: TerrainCell[];
  count?: number;
  minHandSize?: number;
  maxHandSize?: number;
  minCollapseRounds?: number;
  player?: Player;
  attempts?: number;
  excludedTypes?: PieceType[];
}): GeneratedPuzzle[] {
  const player = options.player ?? "blue";
  const enemy: Player = player === "blue" ? "red" : "blue";
  const initialPieces = options.pieces.map((piece, index) => ({ ...piece, id: index + 1 }));
  const enemies = initialPieces.filter((piece) => piece.player === enemy);
  const fixedFriendlies = initialPieces.filter((piece) => piece.player === player);
  const terrain = options.terrain.map((cell) => ({ ...cell }));
  const count = Math.max(1, options.count ?? 3);
  const minHandSize = Math.max(2, options.minHandSize ?? 3);
  const maxHandSize = Math.max(minHandSize, options.maxHandSize ?? 7);
  const minCollapseRounds = Math.max(1, options.minCollapseRounds ?? 2);
  const goal: PuzzleGoal = {
    type: "eliminate-all-enemies",
    minFriendlySurvivors: Math.max(1, fixedFriendlies.length),
    protectedPieceIds: fixedFriendlies.map((piece) => piece.id),
  };
  const results: GeneratedPuzzle[] = [];
  const seen = new Set<string>();

  for (let attempt = 0; attempt < Math.max(1, options.attempts ?? 42) && results.length < count; attempt += 1) {
    const seed = deriveSeed(options.seed, `custom-solution-${attempt}`);
    const random = createSeededRandom(seed);
    const rawSolution = buildPeelingSolution(
      random, player, enemy, initialPieces, enemies, terrain,
      minHandSize, maxHandSize, minCollapseRounds, goal, new Set(options.excludedTypes ?? []),
    );
    if (!rawSolution) continue;
    const normalized = normalizeSolutionTiers(initialPieces, terrain, rawSolution, player, enemy, goal);
    const useNormalized = solutionMeetsSpecialConstraints(normalized.placements);
    const solution = useNormalized ? normalized.placements : rawSolution;
    const key = placementStateKey(solution);
    if (seen.has(key)) continue;
    seen.add(key);
    const solved = asPieces(initialPieces, solution);
    const solvedTerrain = effectiveTerrain(terrain, solution);
    const frames = resolveCollapse(solved, solvedTerrain);
    const rounds = frames.filter((frame) => frame.stage === "removed").length;
    let essentialPieces = 0;
    for (let index = 0; index < solution.length; index += 1) {
      const reduced = solution.filter((_, candidateIndex) => candidateIndex !== index);
      if (!evaluatePuzzleGoal(asPieces(initialPieces, reduced), effectiveTerrain(terrain, reduced), player, enemy, goal).passed) essentialPieces += 1;
    }
    if (essentialPieces !== solution.length) continue;
    results.push({
      id: `custom-${options.seed.toLowerCase()}-${attempt}`,
      number: results.length + 1,
      title: { en: "Custom Formation", zh: "自定义敌阵" },
      lesson: { en: "Find a way to peel apart the formation.", zh: "寻找薄弱点，让敌阵逐层剥落。" },
      player,
      enemy,
      pieces: initialPieces.map((piece) => ({ ...piece })),
      terrain,
      hand: groupHand(solution),
      goal,
      generation: {
        seed,
        theme: "freeform",
        themeTitle: { en: `Candidate ${results.length + 1}`, zh: `候选解 ${results.length + 1}` },
        enemyFormationSize: enemies.length,
        handSize: solution.length,
        essentialPieces,
        knownSolution: solution,
        sampledAttempts: 0,
        sampledWins: 0,
        estimatedWinRate: 0,
        collapseRounds: rounds,
        score: rounds * 30 + essentialPieces * 18 + enemies.length * 5,
        downgradedPieces: useNormalized ? normalized.downgradedPieces : 0,
      },
    });
  }
  return results;
}
