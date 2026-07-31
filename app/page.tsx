"use client";

import { useEffect, useMemo, useState } from "react";
import {
  GiBroadsword,
  GiCannon,
  GiHorseHead,
} from "react-icons/gi";
import type { IconType } from "react-icons";

const BOARD_SIZE = 7;
type Player = "red" | "blue";
type PieceType =
  | "scout"
  | "guard"
  | "archer"
  | "cannon"
  | "knight"
  | "fortress";
type Phase = "placement" | "ready" | "settling" | "finished";
type GameMode = "ai" | "local";
type ColorTheme = "standard" | "vivid" | "accessible";
type StrategyStyle = "balanced" | "aggressive" | "defensive" | "territorial";
type AiStyle = StrategyStyle | "random";
type FirstChoice = "human" | "ai" | "random";
type PieceDisplay = "mark" | "icon" | "range";
type Language = "zh" | "en";

type Piece = {
  id: number;
  player: Player;
  type: PieceType;
  row: number;
  col: number;
};

type PieceStats = {
  attacks: number;
  supports: number;
  survival: number;
};

const PLAYER_ORDER: readonly Player[] = ["blue", "red"];

const PIECE_CONFIG: Record<
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

const PIECE_TYPES: PieceType[] = [
  "guard",
  "scout",
  "archer",
  "cannon",
  "knight",
  "fortress",
];

const PIECE_ICONS: Record<
  Exclude<PieceType, "scout" | "archer" | "fortress">,
  IconType
> = {
  guard: GiBroadsword,
  cannon: GiCannon,
  knight: GiHorseHead,
};

const PIECES_PER_PLAYER = PIECE_TYPES.reduce(
  (sum, type) => sum + PIECE_CONFIG[type].count,
  0,
);

const I18N = {
  zh: {
    title: "阵衡",
    subtitle: "静态布阵棋",
    players: { red: "赤方", blue: "青方" },
    pieces: {
      scout: { name: "枪兵", mark: "枪", desc: "四个斜角相邻格" },
      guard: { name: "剑兵", mark: "剑", desc: "上下左右相邻格" },
      archer: { name: "射手", mark: "射", desc: "上下左右正好两格" },
      cannon: { name: "炮台", mark: "炮", desc: "隔一枚棋子控制其后直线" },
      knight: { name: "骑士", mark: "骑", desc: "马步八个落点" },
      fortress: { name: "堡垒", mark: "堡", desc: "周围八个相邻格" },
    },
    strategies: {
      balanced: { label: "均衡", desc: "兼顾威胁、互保与后期清算" },
      aggressive: { label: "猛攻", desc: "主动制造危险，较早投入强棋" },
      defensive: { label: "结阵", desc: "先搭互保阵型，堡垒通常后放" },
      territorial: { label: "控场", desc: "扩大有效控制，避免范围重叠" },
      random: { label: "随机", desc: "每局随机选择一种 AI 策略" },
    },
    firstChoices: { human: "我", ai: "AI", random: "随机" },
    themes: { standard: "标准", vivid: "鲜亮", accessible: "辨色辅助" },
    displays: { mark: "文字", icon: "图标", range: "范围图" },
    header: {
      placing: "布阵",
      aiThinking: "AI 正在推演",
      ready: "布阵完成",
      settling: "正在清算",
      round: "第",
      roundSuffix: "轮",
      win: "获胜",
      draw: "本局平局",
      subPlacing: "选择一枚棋子，再放入空格 · 已放",
      subReady: "可以检查棋子的攻防与生存状态，然后开始连锁清算",
      subSettling: "生存值为负（濒死）的棋子即将离场",
    },
    actions: {
      settings: "设置",
      restart: "重新开始",
      undo: "撤回一步",
      startSettlement: "开始清算",
      viewResult: "查看胜负",
      rulebook: "规则书",
      done: "完成",
      rematch: "再来一局",
      inspectBoard: "查看棋盘",
    },
    legends: {
      redControl: "己方支援",
      blueControl: "敌方威胁",
      balanced: "势均力敌",
    },
    inspect: {
      titlePiece: "棋子状态",
      titleRule: "结算规则",
      attacked: "被攻击",
      supported: "受支援",
      survival: "生存值",
      ruleDesc:
        "生存值 = 受支援 − 被攻击。生存值为负数（如 -1, -2）代表处于危险濒死状态；连锁清算时，每轮优先消灭【负得最多 / 最危急】的棋子，全部 ≥ 0 则安全存活。",
    },
    log: {
      title: "战局记录",
      empty: "双方各有 10 枚棋子。点击场上棋子，可以查看它当前受到的攻击与支援。",
      startSettle: "开始清算：每轮同时移除生存值最低（濒死）的棋子",
      roundRemove: (round: number, names: string) =>
        `第 ${round} 轮：生存值为负（最危急）的 ${names} 被移除`,
      settleFinished: "清算结束：场上已没有生存值为负的棋子",
    },
    settingsModal: {
      pref: "对局偏好",
      rulebook: "完整玩法",
      titleSettings: "设置",
      titleRulebook: "规则书",
      mode: "对战模式",
      vsAi: "对战 AI",
      pvp: "双人",
      firstPlayer: "执红先手",
      fixedRed: "红棋固定先手",
      aiStyle: "AI 风格",
      currentStyle: (name: string) => `（本局${name}）`,
      theme: "势力配色",
      display: "棋子显示",
      language: "界面语言",
    },
    resultModal: {
      kicker: "最终结算",
      win: "获胜",
      draw: "平局",
      drawMatch: "本局平局",
      survivingPieces: "存活棋子",
      controlledTiles: "控制格数",
      reasons: {
        morePieces: "存活棋子更多",
        moreTiles: "棋子数相同，以控制格数决胜",
        exactDraw: "棋子数与控制格数完全相同",
      },
    },
  },
  en: {
    title: "Grid Equilibrium",
    subtitle: "Tactical Array Chess",
    players: { red: "Crimson", blue: "Azure" },
    pieces: {
      scout: { name: "Spearman", mark: "Spear", desc: "4 diagonal adjacent tiles" },
      guard: { name: "Swordsman", mark: "Blade", desc: "4 orthogonal adjacent tiles" },
      archer: { name: "Archer", mark: "Bow", desc: "2 tiles orthogonal" },
      cannon: { name: "Artillery", mark: "Gun", desc: "Straight line behind screen piece" },
      knight: { name: "Knight", mark: "Rider", desc: "8 L-shaped jump tiles" },
      fortress: { name: "Bastion", mark: "Fort", desc: "8 surrounding tiles" },
    },
    strategies: {
      balanced: { label: "Balanced", desc: "Balance attack, support and endgame" },
      aggressive: { label: "Aggressive", desc: "Press early attacks with high impact" },
      defensive: { label: "Defensive", desc: "Build defensive formations first" },
      territorial: { label: "Control", desc: "Maximize unique tile control" },
      random: { label: "Random", desc: "Randomly pick an AI style each game" },
    },
    firstChoices: { human: "You", ai: "AI", random: "Random" },
    themes: { standard: "Standard", vivid: "Vivid", accessible: "Accessible" },
    displays: { mark: "Text", icon: "Icon", range: "Range" },
    header: {
      placing: "Placement",
      aiThinking: "AI Thinking...",
      ready: "Ready",
      settling: "Resolution",
      round: "Round",
      roundSuffix: "",
      win: "Wins",
      draw: "Draw Game",
      subPlacing: "Select a piece and place on board · Placed",
      subReady: "Check net survival ratings, then begin chain resolution",
      subSettling: "Pieces with negative survival (dying) are removed",
    },
    actions: {
      settings: "Settings",
      restart: "Restart",
      undo: "Undo",
      startSettlement: "Settle",
      viewResult: "Outcome",
      rulebook: "Rulebook",
      done: "Done",
      rematch: "Play Again",
      inspectBoard: "Inspect Board",
    },
    legends: {
      redControl: "Ally Support",
      blueControl: "Enemy Threat",
      balanced: "Balanced",
    },
    inspect: {
      titlePiece: "Piece Status",
      titleRule: "Resolution Rule",
      attacked: "Attacked",
      supported: "Supported",
      survival: "Net Survival",
      ruleDesc:
        "Net Survival = Support − Attacks. Negative values (-1, -2) mean dying state. During resolution, pieces with the lowest (most negative) survival are eliminated first.",
    },
    log: {
      title: "Battle Log",
      empty: "Each side has 10 pieces. Tap any piece to view its attacks and supports.",
      startSettle: "Resolution started: removing lowest net survival (dying) pieces each round",
      roundRemove: (round: number, names: string) =>
        `Round ${round}: ${names} with negative survival removed`,
      settleFinished: "Resolution complete: all remaining pieces have non-negative survival",
    },
    settingsModal: {
      pref: "Preferences",
      rulebook: "How to Play",
      titleSettings: "Settings",
      titleRulebook: "Rulebook",
      mode: "Game Mode",
      vsAi: "vs AI",
      pvp: "2 Players",
      firstPlayer: "First Player",
      fixedRed: "Red Moves First",
      aiStyle: "AI Strategy",
      currentStyle: (name: string) => ` (${name})`,
      theme: "Theme",
      display: "Piece Display",
      language: "Language",
    },
    resultModal: {
      kicker: "Final Outcome",
      win: "Wins!",
      draw: "Draw",
      drawMatch: "Draw Game",
      survivingPieces: "Surviving",
      controlledTiles: "Control",
      reasons: {
        morePieces: "More surviving pieces on board",
        moreTiles: "Tile dominance tiebreaker",
        exactDraw: "Identical surviving pieces and controlled tiles",
      },
    },
  },
} as const;

function withinBoard(row: number, col: number) {
  return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;
}

function cellKey(row: number, col: number) {
  return `${row}-${col}`;
}

function getControlledCells(piece: Piece, pieces: Piece[]) {
  if (piece.type !== "cannon") {
    return PIECE_CONFIG[piece.type].offsets
      .map(([dr, dc]) => [piece.row + dr, piece.col + dc] as const)
      .filter(([row, col]) => withinBoard(row, col));
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
      const occupiedHere = occupied.has(cellKey(row, col));
      if (!foundScreen) {
        if (occupiedHere) foundScreen = true;
      } else {
        controlled.push([row, col]);
        if (occupiedHere) break;
      }
      row += dr;
      col += dc;
    }
  }

  return controlled;
}

function getStats(pieces: Piece[]) {
  const result = new Map<number, PieceStats>();

  for (const target of pieces) {
    let attacks = 0;
    let supports = 0;

    for (const source of pieces) {
      if (source.id === target.id) continue;
      const reachesTarget = getControlledCells(source, pieces).some(
        ([row, col]) => row === target.row && col === target.col,
      );
      if (!reachesTarget) continue;
      if (source.player === target.player) supports += 1;
      else attacks += 1;
    }

    result.set(target.id, {
      attacks,
      supports,
      survival: supports - attacks,
    });
  }

  return result;
}

function getInfluence(pieces: Piece[]) {
  const cells = new Map<string, { red: number; blue: number }>();
  for (let row = 0; row < BOARD_SIZE; row += 1) {
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      cells.set(cellKey(row, col), { red: 0, blue: 0 });
    }
  }
  for (const piece of pieces) {
    for (const [row, col] of getControlledCells(piece, pieces)) {
      const value = cells.get(cellKey(row, col));
      if (value) value[piece.player] += 1;
    }
  }
  return cells;
}

function countControlledCells(pieces: Piece[]) {
  const influence = getInfluence(pieces);
  let red = 0;
  let blue = 0;
  let neutral = 0;
  for (const value of influence.values()) {
    if (value.red > value.blue) red += 1;
    else if (value.blue > value.red) blue += 1;
    else neutral += 1;
  }
  return { red, blue, neutral };
}

function settleForEvaluation(pieces: Piece[]) {
  let remaining = [...pieces];

  while (remaining.length > 0) {
    const stats = getStats(remaining);
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

const AI_WEIGHTS: Record<
  StrategyStyle,
  { attack: number; safety: number; support: number; territory: number }
> = {
  balanced: { attack: 3.4, safety: 3.5, support: 0.65, territory: 0.22 },
  aggressive: { attack: 5.2, safety: 2.1, support: 0.35, territory: 0.12 },
  defensive: { attack: 2.2, safety: 5.4, support: 1.05, territory: 0.16 },
  territorial: { attack: 2.8, safety: 3.1, support: 0.55, territory: 0.9 },
};

function evaluateForRed(pieces: Piece[], style: StrategyStyle) {
  const stats = getStats(pieces);
  const weights = AI_WEIGHTS[style];
  let score = 0;

  for (const piece of pieces) {
    const pieceStats = stats.get(piece.id);
    if (!pieceStats) continue;
    const exposed = Math.max(0, -pieceStats.survival);
    if (piece.player === "red") {
      score -= exposed * weights.safety;
      score += pieceStats.supports * weights.support;
      score += Math.max(0, pieceStats.survival) * 0.32;
    } else {
      score += exposed * weights.attack;
      score -= pieceStats.supports * weights.support * 0.55;
    }
  }

  const center = (BOARD_SIZE - 1) / 2;
  for (const piece of pieces) {
    const centrality =
      BOARD_SIZE -
      (Math.abs(piece.row - center) + Math.abs(piece.col - center));
    score += (piece.player === "red" ? 1 : -1) * centrality * 0.035;
  }

  const control = countControlledCells(pieces);
  score += (control.red - control.blue) * weights.territory;

  return score;
}

function getOverlap(pieces: Piece[], player: Player) {
  let overlap = 0;
  for (const value of getInfluence(pieces).values()) {
    overlap += Math.max(0, value[player] - 1);
  }
  return overlap;
}

function getMoveStyleBonus(
  type: PieceType,
  before: Piece[],
  after: Piece[],
  style: StrategyStyle,
) {
  const redPlaced = before.filter((piece) => piece.player === "red").length;
  const placed = after[after.length - 1];
  const controlledByMove = getControlledCells(placed, after);
  const enemiesHit = controlledByMove.filter(([row, col]) =>
    before.some(
      (piece) =>
        piece.player === "blue" && piece.row === row && piece.col === col,
    ),
  ).length;
  const alliesSupported = controlledByMove.filter(([row, col]) =>
    before.some(
      (piece) =>
        piece.player === "red" && piece.row === row && piece.col === col,
    ),
  ).length;

  const fortressDelay: Record<StrategyStyle, number> = {
    balanced: 4,
    aggressive: 2,
    defensive: 7,
    territorial: 5,
  };
  const fortressPenalty: Record<StrategyStyle, number> = {
    balanced: 1.25,
    aggressive: 0.7,
    defensive: 1.8,
    territorial: 1.15,
  };
  let bonus =
    type === "fortress"
      ? -Math.max(0, fortressDelay[style] - redPlaced) *
        fortressPenalty[style]
      : 0;

  if (style === "aggressive") {
    bonus += enemiesHit * 3.4 + alliesSupported * 0.15;
    if (redPlaced < 2 && type === "archer") bonus += 2.2;
  } else if (style === "defensive") {
    bonus += alliesSupported * 2.6 + enemiesHit * 0.35;
    if (redPlaced < 2 && (type === "guard" || type === "scout")) bonus += 2.3;
  } else if (style === "territorial") {
    const beforeControl = countControlledCells(before).red;
    const afterControl = countControlledCells(after).red;
    const addedControl = afterControl - beforeControl;
    const addedOverlap = getOverlap(after, "red") - getOverlap(before, "red");
    bonus += addedControl * 1.45 - addedOverlap * 0.85;
    if (redPlaced < 2 && type === "knight") bonus += 1.8;
  } else {
    bonus += enemiesHit * 1.15 + alliesSupported * 0.85;
    if (redPlaced < 2 && (type === "guard" || type === "scout")) bonus += 0.9;
  }

  return bonus;
}

function getResolutionScore(pieces: Piece[]) {
  const settled = settleForEvaluation(pieces);
  const redAlive = settled.filter((piece) => piece.player === "red").length;
  const blueAlive = settled.length - redAlive;
  const control = countControlledCells(settled);
  return (redAlive - blueAlive) * 5 + (control.red - control.blue) * 0.16;
}

function chooseRedMove(
  pieces: Piece[],
  redInventory: Record<PieceType, number>,
  blueInventory: Record<PieceType, number>,
  style: StrategyStyle,
) {
  const occupied = new Set(
    pieces.map((piece) => cellKey(piece.row, piece.col)),
  );
  const candidates: {
    type: PieceType;
    row: number;
    col: number;
    score: number;
  }[] = [];

  for (const type of PIECE_TYPES) {
    if (redInventory[type] <= 0) continue;
    for (let row = 0; row < BOARD_SIZE; row += 1) {
      for (let col = 0; col < BOARD_SIZE; col += 1) {
        if (occupied.has(cellKey(row, col))) continue;
        const candidate: Piece = {
          id: -1,
          player: "red",
          type,
          row,
          col,
        };
        const imagined = [...pieces, candidate];
        candidates.push({
          type,
          row,
          col,
          score:
            evaluateForRed(imagined, style) +
            getMoveStyleBonus(type, pieces, imagined, style),
        });
      }
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  const shortlist = candidates.slice(0, Math.min(16, candidates.length));
  let best = shortlist[0] ?? null;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const candidate of shortlist) {
    const redPiece: Piece = {
      id: -1,
      player: "red",
      type: candidate.type,
      row: candidate.row,
      col: candidate.col,
    };
    const afterRed = [...pieces, redPiece];
    const afterRedOccupied = new Set([
      ...occupied,
      cellKey(candidate.row, candidate.col),
    ]);
    let strongestBlueReply = Number.POSITIVE_INFINITY;
    let strongestBlueReplyPosition: Piece[] | null = null;
    let hasBlueReply = false;

    for (const type of PIECE_TYPES) {
      if (blueInventory[type] <= 0) continue;
      for (let row = 0; row < BOARD_SIZE; row += 1) {
        for (let col = 0; col < BOARD_SIZE; col += 1) {
          if (afterRedOccupied.has(cellKey(row, col))) continue;
          hasBlueReply = true;
          const blueReply: Piece = {
            id: -2,
            player: "blue",
            type,
            row,
            col,
          };
          const replyPosition = [...afterRed, blueReply];
          const replyScore = evaluateForRed(replyPosition, style);
          if (replyScore < strongestBlueReply) {
            strongestBlueReply = replyScore;
            strongestBlueReplyPosition = replyPosition;
          }
        }
      }
    }

    const lookAhead = hasBlueReply ? strongestBlueReply : candidate.score;
    const resolutionPosition = strongestBlueReplyPosition ?? afterRed;
    const progress = resolutionPosition.length / (PIECES_PER_PLAYER * 2);
    const resolutionWeight = Math.max(0, progress - 0.45) * 1.8;
    const combinedScore =
      candidate.score * 0.32 +
      lookAhead * 0.68 +
      getResolutionScore(resolutionPosition) * resolutionWeight;
    if (combinedScore > bestScore) {
      bestScore = combinedScore;
      best = candidate;
    }
  }

  return best;
}

function chooseAiMove(
  pieces: Piece[],
  aiPlayer: Player,
  aiInventory: Record<PieceType, number>,
  opponentInventory: Record<PieceType, number>,
  style: StrategyStyle,
) {
  if (aiPlayer === "red") {
    return chooseRedMove(
      pieces,
      aiInventory,
      opponentInventory,
      style,
    );
  }

  const swapped = pieces.map((piece) => ({
    ...piece,
    player: piece.player === "red" ? "blue" : "red",
  })) as Piece[];
  return chooseRedMove(swapped, aiInventory, opponentInventory, style);
}

const STRATEGY_STYLES: StrategyStyle[] = [
  "balanced",
  "aggressive",
  "defensive",
  "territorial",
];

function pickRandomStrategy(): StrategyStyle {
  return STRATEGY_STYLES[
    Math.floor(Math.random() * STRATEGY_STYLES.length)
  ];
}

function resolveHumanPlayer(choice: FirstChoice): Player {
  if (choice === "human") return "red";
  if (choice === "ai") return "blue";
  return Math.random() < 0.5 ? "blue" : "red";
}

export default function Home() {
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [lang, setLang] = useState<Language>("zh");
  const [firstChoice, setFirstChoice] = useState<FirstChoice>("random");
  const [humanPlayer, setHumanPlayer] = useState<Player>("blue");
  const [currentPlayer, setCurrentPlayer] = useState<Player>("red");
  const [selectedType, setSelectedType] = useState<PieceType>("guard");
  const [phase, setPhase] = useState<Phase>("placement");
  const [hoverCell, setHoverCell] = useState<[number, number] | null>(null);
  const [previewCell, setPreviewCell] = useState<[number, number] | null>(null);
  const [inspectedId, setInspectedId] = useState<number | null>(null);
  const [pendingIds, setPendingIds] = useState<number[]>([]);
  const [round, setRound] = useState(0);
  const [history, setHistory] = useState<string[]>([]);
  const [mode, setMode] = useState<GameMode>("ai");
  const [aiThinking, setAiThinking] = useState(false);
  const [colorTheme, setColorTheme] = useState<ColorTheme>("standard");
  const [aiStyle, setAiStyle] = useState<AiStyle>("random");
  const [activeAiStyle, setActiveAiStyle] =
    useState<StrategyStyle>("balanced");
  const [showResult, setShowResult] = useState(false);
  const [pieceDisplay, setPieceDisplay] = useState<PieceDisplay>("mark");
  const [showSettings, setShowSettings] = useState(false);
  const [showRulebook, setShowRulebook] = useState(false);

  const t = I18N[lang];
  const aiPlayer: Player = humanPlayer === "red" ? "blue" : "red";
  const viewPlayer: Player = mode === "ai" ? humanPlayer : currentPlayer;

  const stats = useMemo(() => getStats(pieces), [pieces]);
  const boardPieces = useMemo(
    () => new Map(pieces.map((piece) => [cellKey(piece.row, piece.col), piece])),
    [pieces],
  );
  const influence = useMemo(() => getInfluence(pieces), [pieces]);

  const inventory = useMemo(() => {
    const counts: Record<Player, Record<PieceType, number>> = {
      red: {} as Record<PieceType, number>,
      blue: {} as Record<PieceType, number>,
    };
    for (const player of PLAYER_ORDER) {
      for (const type of PIECE_TYPES) {
        const used = pieces.filter(
          (piece) => piece.player === player && piece.type === type,
        ).length;
        counts[player][type] = PIECE_CONFIG[type].count - used;
      }
    }
    return counts;
  }, [pieces]);

  const highlighted = useMemo(() => {
    const cells = new Set<string>();
    const focusCell = previewCell ?? hoverCell;
    if (phase !== "placement" || !focusCell) return cells;
    const [row, col] = focusCell;
    const previewPiece: Piece = {
      id: -3,
      player: currentPlayer,
      type: selectedType,
      row,
      col,
    };
    for (const [nextRow, nextCol] of getControlledCells(previewPiece, pieces)) {
      cells.add(cellKey(nextRow, nextCol));
    }
    return cells;
  }, [currentPlayer, hoverCell, phase, pieces, previewCell, selectedType]);

  const inspected = pieces.find((piece) => piece.id === inspectedId) ?? null;
  const redAlive = pieces.filter((piece) => piece.player === "red").length;
  const blueAlive = pieces.filter((piece) => piece.player === "blue").length;
  const controlled = useMemo(() => countControlledCells(pieces), [pieces]);
  const winner: Player | null =
    redAlive !== blueAlive
      ? redAlive > blueAlive
        ? "red"
        : "blue"
      : controlled.red !== controlled.blue
        ? controlled.red > controlled.blue
          ? "red"
          : "blue"
        : null;

  const winReason =
    redAlive !== blueAlive
      ? t.resultModal.reasons.morePieces
      : controlled.red !== controlled.blue
        ? t.resultModal.reasons.moreTiles
        : t.resultModal.reasons.exactDraw;

  const opponentPlayer: Player =
    mode === "ai"
      ? aiPlayer
      : currentPlayer === "blue"
        ? "red"
        : "blue";

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setHumanPlayer(resolveHumanPlayer("random"));
      setActiveAiStyle(pickRandomStrategy());
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (
      mode !== "ai" ||
      phase !== "placement" ||
      currentPlayer !== aiPlayer
    ) {
      setAiThinking(false);
      return;
    }

    setAiThinking(true);
    const timer = window.setTimeout(() => {
      const move = chooseAiMove(
        pieces,
        aiPlayer,
        inventory[aiPlayer],
        inventory[humanPlayer],
        activeAiStyle,
      );
      if (!move) {
        setAiThinking(false);
        return;
      }

      const placed: Piece = {
        id: Date.now() + pieces.length,
        player: aiPlayer,
        type: move.type,
        row: move.row,
        col: move.col,
      };
      const nextPieces = [...pieces, placed];
      setPieces(nextPieces);
      setInspectedId(placed.id);
      setAiThinking(false);

      if (nextPieces.length === PIECES_PER_PLAYER * 2) {
        setPhase("ready");
        setHoverCell(null);
      } else {
        setCurrentPlayer(humanPlayer);
        if (inventory[humanPlayer][selectedType] <= 0) {
          const available = PIECE_TYPES.find(
            (type) => inventory[humanPlayer][type] > 0,
          );
          if (available) setSelectedType(available);
        }
      }
    }, 520);

    return () => window.clearTimeout(timer);
  }, [
    currentPlayer,
    activeAiStyle,
    aiPlayer,
    humanPlayer,
    inventory,
    mode,
    phase,
    pieces,
    selectedType,
  ]);

  useEffect(() => {
    if (phase !== "settling") return;

    if (pendingIds.length > 0) {
      const timer = window.setTimeout(() => {
        const removed = pieces.filter((piece) => pendingIds.includes(piece.id));
        setPieces((current) =>
          current.filter((piece) => !pendingIds.includes(piece.id)),
        );
        const removedNames = removed
          .map(
            (piece) =>
              `${t.players[piece.player]}${t.pieces[piece.type].name}`,
          )
          .join("、");
        setHistory((current) => [
          t.log.roundRemove(round, removedNames),
          ...current,
        ]);
        setInspectedId(null);
        setPendingIds([]);
      }, 850);
      return () => window.clearTimeout(timer);
    }

    const liveStats = getStats(pieces);
    const minSurvival = Math.min(
      ...pieces.map((piece) => liveStats.get(piece.id)?.survival ?? 0),
    );

    if (minSurvival >= 0) {
      setPhase("finished");
      setShowResult(true);
      setHistory((current) => [t.log.settleFinished, ...current]);
      return;
    }

    const nextPending = pieces
      .filter((piece) => liveStats.get(piece.id)?.survival === minSurvival)
      .map((piece) => piece.id);
    setRound((current) => current + 1);
    setPendingIds(nextPending);
  }, [pendingIds, phase, pieces, round, t]);

  function chooseType(type: PieceType) {
    if (
      phase !== "placement" ||
      aiThinking ||
      inventory[currentPlayer][type] <= 0
    ) return;
    setSelectedType(type);
    setInspectedId(null);
    setPreviewCell(null);
  }

  function activateCell(row: number, col: number) {
    const existing = boardPieces.get(cellKey(row, col));
    if (existing) {
      setInspectedId(existing.id);
      setPreviewCell(null);
      return;
    }
    if (
      phase !== "placement" ||
      aiThinking ||
      (mode === "ai" && currentPlayer === aiPlayer) ||
      inventory[currentPlayer][selectedType] <= 0
    ) {
      return;
    }

    const usesTapPreview =
      window.innerWidth <= 720 ||
      window.matchMedia("(hover: none), (pointer: coarse)").matches;
    const isConfirmedPreview =
      previewCell?.[0] === row && previewCell?.[1] === col;

    if (usesTapPreview && !isConfirmedPreview) {
      setPreviewCell([row, col]);
      setInspectedId(null);
      return;
    }

    const placed: Piece = {
      id: Date.now() + pieces.length,
      player: currentPlayer,
      type: selectedType,
      row,
      col,
    };
    const nextPieces = [...pieces, placed];
    const nextPlayer = currentPlayer === "red" ? "blue" : "red";
    setPieces(nextPieces);
    setInspectedId(placed.id);
    setPreviewCell(null);

    if (nextPieces.length === PIECES_PER_PLAYER * 2) {
      setPhase("ready");
      setHoverCell(null);
      return;
    }

    setCurrentPlayer(nextPlayer);
    if (inventory[nextPlayer][selectedType] <= 0) {
      const available = PIECE_TYPES.find(
        (type) => inventory[nextPlayer][type] > 0,
      );
      if (available) setSelectedType(available);
    }
  }

  function undo() {
    if ((phase !== "placement" && phase !== "ready") || aiThinking) return;
    if (mode === "ai" && pieces.length < 2) return;
    const steps = mode === "ai" && pieces.length >= 2 ? 2 : 1;
    const nextPieces = pieces.slice(0, -steps);
    const removed = pieces.slice(-steps);
    const lastHumanMove = removed.find(
      (piece) => mode === "local" || piece.player === humanPlayer,
    );
    if (!lastHumanMove) return;
    setPieces(nextPieces);
    setCurrentPlayer(mode === "ai" ? humanPlayer : lastHumanMove.player);
    setSelectedType(lastHumanMove.type);
    setInspectedId(null);
    setPhase("placement");
  }

  function resetTo() {
    if (aiStyle === "random") {
      setActiveAiStyle(pickRandomStrategy());
    }
    setPieces([]);
    setCurrentPlayer("red");
    setSelectedType("guard");
    setPhase("placement");
    setHoverCell(null);
    setPreviewCell(null);
    setInspectedId(null);
    setPendingIds([]);
    setRound(0);
    setHistory([]);
    setAiThinking(false);
    setShowResult(false);
  }

  function reset() {
    setShowSettings(false);
    if (mode === "ai") setHumanPlayer(resolveHumanPlayer(firstChoice));
    resetTo();
  }

  function changeMode(nextMode: GameMode) {
    setMode(nextMode);
    if (nextMode === "ai") setHumanPlayer(resolveHumanPlayer(firstChoice));
    resetTo();
  }

  function changeFirstPlayer(nextChoice: FirstChoice) {
    setFirstChoice(nextChoice);
    setHumanPlayer(resolveHumanPlayer(nextChoice));
    resetTo();
  }

  function changeAiStyle(nextStyle: AiStyle) {
    setAiStyle(nextStyle);
    setActiveAiStyle(
      nextStyle === "random" ? pickRandomStrategy() : nextStyle,
    );
  }

  function startSettlement() {
    setInspectedId(null);
    setHistory([t.log.startSettle]);
    setRound(0);
    setShowResult(false);
    setPhase("settling");
  }

  const titleText =
    phase === "placement"
      ? aiThinking
        ? `${t.players[aiPlayer]} ${t.header.aiThinking}`
        : `${t.players[currentPlayer]} ${t.header.placing}`
      : phase === "ready"
        ? t.header.ready
        : phase === "settling"
          ? `${t.header.settling} · ${t.header.round} ${Math.max(round, 1)} ${t.header.roundSuffix}`
          : winner
            ? `${t.players[winner]} ${t.header.win}`
            : t.header.draw;

  const subtitleText =
    phase === "placement"
      ? `${t.header.subPlacing} ${pieces.length}/${PIECES_PER_PLAYER * 2}`
      : phase === "ready"
        ? t.header.subReady
        : phase === "settling"
          ? t.header.subSettling
          : `${t.players.red} ${redAlive} : ${blueAlive} ${t.players.blue} · ${t.players.red} ${controlled.red} : ${controlled.blue} ${t.players.blue}`;

  return (
    <main className={`game-shell theme-${colorTheme} mode-${mode} lang-${lang}`}>
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">{lang === "zh" ? "衡" : "EQ"}</span>
          <div>
            <p>{t.subtitle}</p>
            <h1>{t.title}</h1>
          </div>
        </div>
        <div className="turn-copy" aria-live="polite">
          <strong>{titleText}</strong>
          <span>{subtitleText}</span>
        </div>
        <div className="header-actions">
          <button
            className="quiet-button lang-toggle-button"
            onClick={() => setLang((prev) => (prev === "zh" ? "en" : "zh"))}
            title={lang === "zh" ? "Switch to English" : "切换为中文"}
          >
            {lang === "zh" ? "English" : "中文"}
          </button>
          <button
            className="quiet-button rulebook-button"
            onClick={() => {
              setShowSettings(false);
              setShowRulebook(true);
            }}
          >
            {t.actions.rulebook}
          </button>
          <button
            className="quiet-button settings-button"
            onClick={() => {
              setShowRulebook(false);
              setShowSettings(true);
            }}
          >
            {t.actions.settings}
          </button>
          <button className="quiet-button" onClick={reset}>
            {t.actions.restart}
          </button>
        </div>
      </header>

      <section className="game-layout">
        <aside className={`player-panel red-panel ${mode === "ai" && humanPlayer === "red" ? "human-panel" : ""} ${currentPlayer === "red" ? "active" : ""}`}>
          <div className="player-heading">
            <span className="player-dot" />
            <div>
              <span>
                {lang === "zh" ? "先手" : "First"}
                {mode === "ai" && humanPlayer === "red" && ` · ${t.firstChoices.human}`}
              </span>
              <h2>
                {t.players.red} {mode === "ai" && aiPlayer === "red" && <em>AI</em>}
              </h2>
            </div>
            <strong>{redAlive}</strong>
          </div>
          <Inventory
            player="red"
            currentPlayer={currentPlayer}
            inventory={inventory.red}
            selectedType={selectedType}
            phase={phase}
            isComputer={mode === "ai" && aiPlayer === "red"}
            pieceDisplay={pieceDisplay}
            lang={lang}
            onChoose={chooseType}
          />
        </aside>

        <div className="board-column">
          <div className={`mobile-opponent-summary ${opponentPlayer}`}>
            <strong>{t.players[opponentPlayer]}</strong>
            {PIECE_TYPES.map((type) => (
              <span key={type}>
                <i className="summary-piece">
                  <PieceFace type={type} display={pieceDisplay} lang={lang} />
                </i>
                {inventory[opponentPlayer][type]}
              </span>
            ))}
          </div>
          <div className={`board-frame ${phase === "settling" ? "is-settling" : ""}`}>
            <div className="board" role="grid" aria-label="7x7 Grid Equilibrium Board">
              {Array.from({ length: BOARD_SIZE * BOARD_SIZE }, (_, index) => {
                const row = Math.floor(index / BOARD_SIZE);
                const col = index % BOARD_SIZE;
                const piece = boardPieces.get(cellKey(row, col));
                const pieceStats = piece ? stats.get(piece.id) : null;
                const cellInfluence = influence.get(cellKey(row, col));
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
                const isPending = piece ? pendingIds.includes(piece.id) : false;
                const isInspected = piece?.id === inspectedId;

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
                      highlighted.has(cellKey(row, col)) ? "in-range" : "",
                      zoneClass,
                      previewCell?.[0] === row && previewCell?.[1] === col
                        ? "preview-origin"
                        : "",
                      piece ? "occupied" : "",
                      isInspected ? "inspected" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    key={cellKey(row, col)}
                    role="gridcell"
                    aria-label={
                      piece
                        ? `${t.players[piece.player]}${t.pieces[piece.type].name}`
                        : `Row ${row + 1} Col ${col + 1}`
                    }
                    onMouseEnter={() => setHoverCell([row, col])}
                    onMouseLeave={() => setHoverCell(null)}
                    onFocus={() => setHoverCell([row, col])}
                    onClick={() => activateCell(row, col)}
                  >
                    {zoneSymbol && (
                      <span className="zone-symbol" aria-hidden="true">
                        {zoneSymbol}
                      </span>
                    )}
                    {piece && (
                      <span
                        className={`piece ${piece.player} ${isPending ? "pending" : ""}`}
                      >
                        <PieceFace type={piece.type} display={pieceDisplay} lang={lang} />
                        {pieceStats && (
                          <span
                            className={`danger-badge ${badgeClass}`}
                            title={`${t.inspect.survival} ${survivalValue}`}
                          >
                            {survivalValue > 0 ? `+${survivalValue}` : survivalValue}
                          </span>
                        )}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="board-actions">
            <button
              className="secondary-button"
              disabled={pieces.length === 0 || aiThinking || phase === "settling" || phase === "finished"}
              onClick={undo}
            >
              {t.actions.undo}
            </button>
            {phase === "ready" && (
              <button className="primary-button" onClick={startSettlement}>
                {t.actions.startSettlement}
              </button>
            )}
            {phase === "finished" && (
              <button
                className="primary-button"
                onClick={() => setShowResult(true)}
              >
                {t.actions.viewResult}
              </button>
            )}
            <div className="range-legend">
              <span>
                <i className="legend-square danger">
                  {viewPlayer === "red" ? "+" : "!"}
                </i>
                {viewPlayer === "red" ? t.legends.redControl : t.legends.blueControl}
              </span>
              <span>
                <i className="legend-square support">
                  {viewPlayer === "blue" ? "+" : "!"}
                </i>
                {viewPlayer === "blue" ? t.legends.redControl : t.legends.blueControl}
              </span>
              <span><i className="legend-square balanced">=</i>{t.legends.balanced}</span>
            </div>
          </div>
        </div>

        <aside className={`player-panel blue-panel ${mode === "ai" && humanPlayer === "blue" ? "human-panel" : ""} ${currentPlayer === "blue" ? "active" : ""}`}>
          <div className="player-heading">
            <span className="player-dot" />
            <div>
              <span>
                {lang === "zh" ? "后手" : "Second"}
                {mode === "ai" && humanPlayer === "blue" && ` · ${t.firstChoices.human}`}
              </span>
              <h2>
                {t.players.blue} {mode === "ai" && aiPlayer === "blue" && <em>AI</em>}
              </h2>
            </div>
            <strong>{blueAlive}</strong>
          </div>
          <Inventory
            player="blue"
            currentPlayer={currentPlayer}
            inventory={inventory.blue}
            selectedType={selectedType}
            phase={phase}
            isComputer={mode === "ai" && aiPlayer === "blue"}
            pieceDisplay={pieceDisplay}
            lang={lang}
            onChoose={chooseType}
          />
        </aside>
      </section>

      <section className="info-strip">
        <div className="info-card inspect-card">
          <p className="eyebrow">{inspected ? t.inspect.titlePiece : t.inspect.titleRule}</p>
          {inspected ? (
            <>
              <div className="inspect-title">
                <span className={`mini-piece ${inspected.player}`}>
                  <PieceFace type={inspected.type} display={pieceDisplay} lang={lang} />
                </span>
                <div>
                  <h3>
                    {t.players[inspected.player]} · {t.pieces[inspected.type].name}
                  </h3>
                  <p>{t.pieces[inspected.type].desc}</p>
                </div>
              </div>
              <div className="stat-row">
                <span>{t.inspect.attacked} <strong>{stats.get(inspected.id)?.attacks ?? 0}</strong></span>
                <span>{t.inspect.supported} <strong>{stats.get(inspected.id)?.supports ?? 0}</strong></span>
                <span>{t.inspect.survival} <strong className={`stat-survival ${((stats.get(inspected.id)?.survival ?? 0) < 0) ? "dying" : ((stats.get(inspected.id)?.survival ?? 0) > 0) ? "living" : "neutral"}`}>{stats.get(inspected.id)?.survival ?? 0}</strong></span>
              </div>
            </>
          ) : (
            <p className="rule-copy">
              {t.inspect.ruleDesc}
            </p>
          )}
        </div>

        <div className="info-card log-card" aria-live="polite">
          <p className="eyebrow">{t.log.title}</p>
          {history.length ? (
            <ol>
              {history.slice(0, 3).map((entry, index) => (
                <li key={`${entry}-${index}`}>{entry}</li>
              ))}
            </ol>
          ) : (
            <p className="rule-copy">
              {t.log.empty}
            </p>
          )}
        </div>
      </section>

      {showSettings && (
        <div className="settings-overlay" role="presentation">
          <section
            className="settings-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-title"
          >
            <div className="settings-heading">
              <div>
                <p>{t.settingsModal.pref}</p>
                <h2 id="settings-title">{t.settingsModal.titleSettings}</h2>
              </div>
              <button
                className="settings-close"
                onClick={() => setShowSettings(false)}
                aria-label="Close settings"
              >
                ×
              </button>
            </div>

            <div className="setting-row">
              <span>{t.settingsModal.language}</span>
              <div className="mode-switch">
                <button
                  className={lang === "zh" ? "selected" : ""}
                  onClick={() => setLang("zh")}
                >
                  中文
                </button>
                <button
                  className={lang === "en" ? "selected" : ""}
                  onClick={() => setLang("en")}
                >
                  English
                </button>
              </div>
            </div>

            <div className="setting-row">
              <span>{t.settingsModal.mode}</span>
              <div className="mode-switch">
                <button
                  className={mode === "ai" ? "selected" : ""}
                  onClick={() => changeMode("ai")}
                >
                  {t.settingsModal.vsAi}
                </button>
                <button
                  className={mode === "local" ? "selected" : ""}
                  onClick={() => changeMode("local")}
                >
                  {t.settingsModal.pvp}
                </button>
              </div>
            </div>

            <div className="setting-row">
              <span>{t.settingsModal.firstPlayer}</span>
              {mode === "ai" ? (
                <div className="mode-switch first-switch">
                  <button
                    className={firstChoice === "human" ? "selected" : ""}
                    onClick={() => changeFirstPlayer("human")}
                  >
                    {t.firstChoices.human}
                  </button>
                  <button
                    className={firstChoice === "ai" ? "selected" : ""}
                    onClick={() => changeFirstPlayer("ai")}
                  >
                    {t.firstChoices.ai}
                  </button>
                  <button
                    className={firstChoice === "random" ? "selected" : ""}
                    onClick={() => changeFirstPlayer("random")}
                  >
                    {t.firstChoices.random}
                  </button>
                </div>
              ) : (
                <strong className="fixed-first">{t.settingsModal.fixedRed}</strong>
              )}
            </div>

            {mode === "ai" && (
              <div className="setting-row">
                <span>
                  {t.settingsModal.aiStyle}
                  {aiStyle === "random" &&
                    t.settingsModal.currentStyle(
                      t.strategies[activeAiStyle].label,
                    )}
                  <small>
                    {
                      t.strategies[
                        aiStyle === "random" ? activeAiStyle : aiStyle
                      ].desc
                    }
                  </small>
                </span>
                <select
                  className="settings-select"
                  value={aiStyle}
                  onChange={(event) =>
                    changeAiStyle(event.target.value as AiStyle)
                  }
                >
                  <option value="balanced">{t.strategies.balanced.label}</option>
                  <option value="aggressive">{t.strategies.aggressive.label}</option>
                  <option value="defensive">{t.strategies.defensive.label}</option>
                  <option value="territorial">{t.strategies.territorial.label}</option>
                  <option value="random">{t.strategies.random.label}</option>
                </select>
              </div>
            )}

            <div className="setting-row">
              <span>{t.settingsModal.theme}</span>
              <div className="setting-options">
                {(["standard", "vivid", "accessible"] as const).map((theme) => (
                  <button
                    key={theme}
                    className={colorTheme === theme ? "selected" : ""}
                    onClick={() => setColorTheme(theme)}
                  >
                    {t.themes[theme]}
                  </button>
                ))}
              </div>
            </div>

            <div className="setting-row">
              <span>{t.settingsModal.display}</span>
              <div className="setting-options">
                <button
                  className={pieceDisplay === "mark" ? "selected" : ""}
                  onClick={() => setPieceDisplay("mark")}
                >
                  {t.displays.mark}
                </button>
                <button
                  className={pieceDisplay === "icon" ? "selected" : ""}
                  onClick={() => setPieceDisplay("icon")}
                >
                  {t.displays.icon}
                </button>
                <button
                  className={pieceDisplay === "range" ? "selected" : ""}
                  onClick={() => setPieceDisplay("range")}
                >
                  {t.displays.range}
                </button>
              </div>
            </div>

            <button
              className="settings-rulebook-link"
              onClick={() => {
                setShowSettings(false);
                setShowRulebook(true);
              }}
            >
              <span>
                <strong>{t.actions.rulebook}</strong>
                <small>{lang === "zh" ? "布阵、棋子范围、清算与胜负" : "Placement, ranges & settlement"}</small>
              </span>
              <b aria-hidden="true">›</b>
            </button>

            <button
              className="primary-button settings-done"
              onClick={() => setShowSettings(false)}
            >
              {t.actions.done}
            </button>
          </section>
        </div>
      )}

      {showRulebook && (
        <div className="settings-overlay" role="presentation">
          <section
            className="settings-panel rulebook-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="rulebook-title"
          >
            <div className="settings-heading">
              <div>
                <p>{t.settingsModal.rulebook}</p>
                <h2 id="rulebook-title">{t.settingsModal.titleRulebook}</h2>
              </div>
              <button
                className="settings-close"
                onClick={() => setShowRulebook(false)}
                aria-label="Close rulebook"
              >
                ×
              </button>
            </div>
            <Rulebook lang={lang} t={t} onBack={() => setShowRulebook(false)} />
          </section>
        </div>
      )}

      {phase === "finished" && showResult && (
        <div className="result-overlay" role="presentation">
          <section
            className={`result-card ${winner ?? "draw"}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="result-title"
          >
            <p className="result-kicker">{t.resultModal.kicker}</p>
            <div className="result-emblem">{winner ? (lang === "zh" ? "胜" : "WIN") : (lang === "zh" ? "和" : "DRAW")}</div>
            <h2 id="result-title">
              {winner ? `${t.players[winner]} ${t.resultModal.win}` : t.resultModal.drawMatch}
            </h2>
            <p className="result-reason">{winReason}</p>

            <div className="result-scoreboard">
              <div>
                <span className="score-dot red" />
                <strong>{t.players.red}</strong>
                <small>
                  {mode === "ai"
                    ? humanPlayer === "red"
                      ? t.firstChoices.human
                      : "AI"
                    : lang === "zh"
                      ? "先手"
                      : "1P"}
                </small>
              </div>
              <div className="score-category">
                <span>{t.resultModal.survivingPieces}</span>
                <strong>
                  {redAlive}<i>:</i>{blueAlive}
                </strong>
              </div>
              <div className="score-category">
                <span>{t.resultModal.controlledTiles}</span>
                <strong>
                  {controlled.red}<i>:</i>{controlled.blue}
                </strong>
              </div>
              <div>
                <span className="score-dot blue" />
                <strong>{t.players.blue}</strong>
                <small>
                  {mode === "ai"
                    ? humanPlayer === "blue"
                      ? t.firstChoices.human
                      : "AI"
                    : lang === "zh"
                      ? "后手"
                      : "2P"}
                </small>
              </div>
            </div>

            <div className="result-actions">
              <button
                className="secondary-button"
                onClick={() => setShowResult(false)}
              >
                {t.actions.inspectBoard}
              </button>
              <button className="primary-button" onClick={reset}>
                {t.actions.rematch}
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

function RangeIcon({ type }: { type: PieceType }) {
  const targets = new Set(
    PIECE_CONFIG[type].offsets.map(([row, col]) => cellKey(row + 2, col + 2)),
  );
  const screens =
    type === "cannon"
      ? new Set(["1-2", "2-1", "2-3", "3-2"])
      : new Set<string>();
  return (
    <span className="range-icon" aria-hidden="true">
      {Array.from({ length: 25 }, (_, index) => {
        const row = Math.floor(index / 5);
        const col = index % 5;
        const isOrigin = row === 2 && col === 2;
        return (
          <i
            key={index}
            className={[
              "range-dot",
              isOrigin ? "origin" : "",
              screens.has(cellKey(row, col)) ? "screen" : "",
              type === "cannon" && row === 1 && col === 2 ? "arrow-up" : "",
              type === "cannon" && row === 3 && col === 2 ? "arrow-down" : "",
              type === "cannon" && row === 2 && col === 1 ? "arrow-left" : "",
              type === "cannon" && row === 2 && col === 3 ? "arrow-right" : "",
              targets.has(cellKey(row, col)) ? "target" : "",
            ]
              .filter(Boolean)
              .join(" ")}
          />
        );
      })}
    </span>
  );
}

function Rulebook({
  lang,
  t,
  onBack,
}: {
  lang: Language;
  t: (typeof I18N)["zh"] | (typeof I18N)["en"];
  onBack: () => void;
}) {
  const pieceRules: { type: PieceType; rule: string }[] =
    lang === "zh"
      ? [
          { type: "guard", rule: "控制上下左右相邻的 4 格" },
          { type: "scout", rule: "控制斜向相邻的 4 格" },
          { type: "archer", rule: "控制上下左右正好相距 2 格的位置" },
          {
            type: "cannon",
            rule: "每个直线方向须先隔过一枚棋子，再控制其后的格子，直到并包括遇到的下一枚棋子",
          },
          { type: "knight", rule: "控制“日”字形的 8 个落点" },
          { type: "fortress", rule: "控制周围相邻的 8 格" },
        ]
      : [
          { type: "guard", rule: "Controls 4 orthogonal adjacent tiles" },
          { type: "scout", rule: "Controls 4 diagonal adjacent tiles" },
          { type: "archer", rule: "Controls tiles exactly 2 steps orthogonally" },
          {
            type: "cannon",
            rule: "Fires along straight lines beyond a screen piece until the next piece",
          },
          { type: "knight", rule: "Controls 8 L-shaped jump positions" },
          { type: "fortress", rule: "Controls all 8 surrounding tiles" },
        ];

  return (
    <div className="rulebook">
      <section className="rulebook-intro">
        <strong>{lang === "zh" ? "目标" : "Objective"}</strong>
        <p>
          {lang === "zh"
            ? "双方完成布阵后进行连锁清算。清算结束时，存活棋子较多的一方获胜。"
            : "Both players place pieces, then trigger chain resolution. The player with more surviving pieces wins."}
        </p>
      </section>

      <section>
        <h3><span>01</span> {lang === "zh" ? "布阵" : "Placement"}</h3>
        <ol>
          <li>{lang === "zh" ? "棋盘为 7×7，双方各有 10 枚棋子。" : "The grid is 7x7. Each side has 10 pieces."}</li>
          <li>{lang === "zh" ? "红方先手，双方轮流在任意空格放置 1 枚棋子。" : "Red moves first, alternating placing 1 piece on any open tile."}</li>
          <li>{lang === "zh" ? "棋子放下后不能移动；全部 20 枚放完才开始清算。" : "Pieces cannot be moved once placed; resolution starts after 20 pieces are set."}</li>
        </ol>
      </section>

      <section>
        <h3><span>02</span> {lang === "zh" ? "攻击与支援" : "Attacks & Supports"}</h3>
        <ul>
          <li>{lang === "zh" ? "每枚棋子的攻击范围与支援范围相同。" : "A piece's attack range equals its support range."}</li>
          <li>{lang === "zh" ? "范围内每有 1 枚敌棋则造成 1 次攻击；每有 1 枚友棋则提供 1 次支援。" : "Each enemy in range attacks it; each ally in range supports it."}</li>
          <li><b>{lang === "zh" ? "生存值 = 受支援次数 − 被攻击次数。" : "Net Survival = Support − Attacks."}</b> {lang === "zh" ? "生存值为负数（-1, -2 等）代表濒死，清算时按【负得最多 / 最危急】顺序逐轮离场。" : "Pieces with negative survival (-1, -2) indicate dying state. Resolution eliminates pieces with the lowest (most negative) net survival first in each round."}</li>
        </ul>
      </section>

      <section>
        <h3><span>03</span> {lang === "zh" ? "棋子与范围" : "Pieces & Ranges"}</h3>
        <div className="rulebook-pieces">
          {pieceRules.map(({ type, rule }) => (
            <article key={type}>
              <div className="rulebook-piece-icon">
                <RangeIcon type={type} />
              </div>
              <div>
                <strong>
                  {t.pieces[type].name}
                  <small>×{PIECE_CONFIG[type].count}</small>
                </strong>
                <p>{rule}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section>
        <h3><span>04</span> {lang === "zh" ? "连锁清算" : "Chain Resolution"}</h3>
        <ol>
          <li>{lang === "zh" ? "计算场上每枚棋子的生存值。" : "Calculate net survival for all pieces."}</li>
          <li>{lang === "zh" ? "找出全场生存值最低（即负得最多 / 最危险）的棋子；若有并列，同时移除。" : "Identify pieces with the lowest (most negative) net survival; if tied, remove them simultaneously."}</li>
          <li>{lang === "zh" ? "根据剩余棋子重新计算所有攻击、支援和炮台范围。" : "Recalculate all attack, support, and Artillery screen ranges for remaining pieces."}</li>
          <li>{lang === "zh" ? "重复以上步骤，直到没有棋子的生存值为负数。" : "Repeat until all remaining pieces have non-negative survival."}</li>
        </ol>
      </section>

      <button className="primary-button rulebook-back" onClick={onBack}>
        {t.actions.done}
      </button>
    </div>
  );
}

function PieceIcon({ type }: { type: PieceType }) {
  if (type === "scout") {
    return (
      <svg
        className="piece-icon icon-scout"
        viewBox="0 0 64 64"
        aria-hidden="true"
      >
        <g transform="rotate(42 32 32)">
          <path
            fill="currentColor"
            d="M32 3 39 15 34 20v35h-4V20l-5-5 7-12Z"
          />
          <path fill="currentColor" d="m32 61-5-6h10l-5 6Z" />
        </g>
        <g transform="rotate(-42 32 32)">
          <path
            fill="currentColor"
            d="M32 3 39 15 34 20v35h-4V20l-5-5 7-12Z"
          />
          <path fill="currentColor" d="m32 61-5-6h10l-5 6Z" />
        </g>
      </svg>
    );
  }

  if (type === "archer") {
    return (
      <svg
        className="piece-icon icon-archer"
        viewBox="0 0 64 64"
        aria-hidden="true"
      >
        <path
          d="M29 6C43 20 43 44 29 58"
          fill="none"
          stroke="currentColor"
          strokeWidth="5"
          strokeLinecap="round"
        />
        <path
          d="m29 6-17 26 17 26"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
        <path
          d="M12 32h43"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <path fill="currentColor" d="m60 32-9-6v12l9-6Z" />
        <path
          d="m23 32-9-6m9 6-9 6"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  if (type === "fortress") {
    return (
      <svg
        className="piece-icon icon-fortress"
        viewBox="0 0 64 64"
        aria-hidden="true"
      >
        <path
          fill="currentColor"
          d="M10 54h44V10H44v8H36v-8H28v8H20v-8H10v44Zm8-28h8v8h-8v-8Zm20 0h8v8h-8v-8Zm-12 14h8v14h-8V40Z"
        />
      </svg>
    );
  }

  const Icon = PIECE_ICONS[type];
  return <Icon className={`piece-icon icon-${type}`} aria-hidden="true" />;
}

function PieceFace({
  type,
  display,
  lang,
}: {
  type: PieceType;
  display: PieceDisplay;
  lang: Language;
}) {
  // If language is English and user selected Chinese mark, force SVG icon display!
  const effectiveDisplay =
    lang === "en" && display === "mark" ? "icon" : display;

  if (effectiveDisplay === "range") return <RangeIcon type={type} />;
  if (effectiveDisplay === "icon") return <PieceIcon type={type} />;
  return <span className="piece-mark">{I18N[lang].pieces[type].mark}</span>;
}

function Inventory({
  player,
  currentPlayer,
  inventory,
  selectedType,
  phase,
  isComputer,
  pieceDisplay,
  lang,
  onChoose,
}: {
  player: Player;
  currentPlayer: Player;
  inventory: Record<PieceType, number>;
  selectedType: PieceType;
  phase: Phase;
  isComputer: boolean;
  pieceDisplay: PieceDisplay;
  lang: Language;
  onChoose: (type: PieceType) => void;
}) {
  const t = I18N[lang];
  return (
    <div className="inventory">
      {PIECE_TYPES.map((type) => {
        const pieceData = t.pieces[type];
        const enabled =
          phase === "placement" &&
          player === currentPlayer &&
          !isComputer &&
          inventory[type] > 0;
        return (
          <button
            key={type}
            disabled={!enabled}
            className={`inventory-piece ${enabled && selectedType === type ? "selected" : ""}`}
            onClick={() => onChoose(type)}
            aria-label={`${t.players[player]} select ${pieceData.name}, ${inventory[type]} left`}
          >
            <span className={`mini-piece ${player}`}>
              <PieceFace type={type} display={pieceDisplay} lang={lang} />
            </span>
            <span className="piece-copy">
              <strong>{pieceData.name}</strong>
              <small>{pieceData.desc}</small>
            </span>
            <span className="piece-count">×{inventory[type]}</span>
          </button>
        );
      })}
    </div>
  );
}
