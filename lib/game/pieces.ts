import type { PieceType } from "./types";

export const PIECE_CONFIG: Record<
  PieceType,
  {
    count: number;
    offsets: readonly (readonly [number, number])[];
  }
> = {
  scout: {
    count: 3,
    offsets: [
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1],
    ],
  },
  guard: {
    count: 3,
    offsets: [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ],
  },
  archer: {
    count: 1,
    offsets: [
      [-2, 0],
      [2, 0],
      [0, -2],
      [0, 2],
    ],
  },
  cannon: {
    count: 1,
    offsets: [
      [-2, 0],
      [2, 0],
      [0, -2],
      [0, 2],
    ],
  },
  musket: {
    count: 0,
    offsets: [],
  },
  shield: {
    count: 0,
    offsets: [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1]],
  },
  crossbow: {
    count: 0,
    offsets: [],
  },
  lancer: {
    count: 0,
    offsets: [[-2, 0], [-1, 0], [0, -2], [0, -1], [0, 1], [0, 2], [1, 0], [2, 0]],
  },
  charger: {
    count: 0,
    offsets: [[-2, 0], [-1, -1], [-1, 0], [-1, 1]],
  },
  halberd: {
    count: 0,
    offsets: [[-2, 0], [-1, -1], [-1, 1]],
  },
  selector: {
    count: 0,
    offsets: [],
  },
  ram: {
    count: 0,
    offsets: [[-1, 0], [-2, 0], [-3, 0]],
  },
  sentry: {
    count: 0,
    offsets: [],
  },
  mason: {
    count: 0,
    offsets: [],
  },
  knight: {
    count: 1,
    offsets: [
      [-2, -1],
      [-2, 1],
      [-1, -2],
      [-1, 2],
      [1, -2],
      [1, 2],
      [2, -1],
      [2, 1],
    ],
  },
  fortress: {
    count: 1,
    offsets: [
      [-1, -1],
      [-1, 0],
      [-1, 1],
      [0, -1],
      [0, 1],
      [1, -1],
      [1, 0],
      [1, 1],
    ],
  },
};

export const PIECE_TYPES: PieceType[] = [
  "guard",
  "scout",
  "archer",
  "cannon",
  "musket",
  "shield",
  "crossbow",
  "lancer",
  "charger",
  "halberd",
  "selector",
  "ram",
  "sentry",
  "mason",
  "knight",
  "fortress",
];

export const PIECES_PER_PLAYER = PIECE_TYPES.reduce(
  (sum, type) => sum + PIECE_CONFIG[type].count,
  0,
);
