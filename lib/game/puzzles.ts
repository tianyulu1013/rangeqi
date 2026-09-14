import type { Piece, PieceType, Player, TerrainCell } from "./types";

export type PuzzleHandEntry = {
  player: Player;
  type: PieceType;
  count: number;
};

export type PuzzleGoal =
  | {
      type: "eliminate-all-enemies";
      minFriendlySurvivors?: number;
      protectedPieceIds?: number[];
      requireEveryFriendlyEssential?: boolean;
    }
  | {
      type: "standard-victory";
    };

export type PuzzleLevel = {
  id: string;
  number: number;
  title: { en: string; zh: string };
  lesson: { en: string; zh: string };
  player: Player;
  enemy: Player;
  pieces: Piece[];
  terrain: TerrainCell[];
  hand: PuzzleHandEntry[];
  goal?: PuzzleGoal;
};

export const PUZZLE_LEVELS: PuzzleLevel[] = [
  {
    id: "first-strike",
    number: 1,
    title: { en: "First Strike", zh: "第一击" },
    lesson: {
      en: "Place the Swordsman, then eliminate the enemy Spearman.",
      zh: "放下剑兵，在清算中消灭敌方枪兵。",
    },
    player: "blue",
    enemy: "red",
    pieces: [
      { id: 101, player: "red", type: "scout", row: 3, col: 3 },
    ],
    terrain: [],
    hand: [{ player: "blue", type: "guard", count: 1 }],
    goal: { type: "eliminate-all-enemies" },
  },
  {
    id: "two-steps-away",
    number: 2,
    title: { en: "Two Steps Away", zh: "两步之外" },
    lesson: {
      en: "Use the Archer's fixed distance to eliminate the enemy Swordsman.",
      zh: "利用射手的固定距离，消灭敌方剑兵。",
    },
    player: "blue",
    enemy: "red",
    pieces: [
      { id: 201, player: "red", type: "guard", row: 3, col: 3 },
    ],
    terrain: [],
    hand: [{ player: "blue", type: "archer", count: 1 }],
    goal: { type: "eliminate-all-enemies" },
  },
];
