"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FaGear } from "react-icons/fa6";
import { App as CapacitorApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { BattleBoard } from "../components/game/BattleBoard";
import { HomeScreen } from "../components/game/HomeScreen";
import { PuzzleMode } from "../components/puzzle/PuzzleMode";
import { PuzzleGeneratorLab } from "../components/puzzle/PuzzleGeneratorLab";
import { PieceTray, PlayerHand } from "../components/game/PlayerHand";
import { PieceFace, RangeIcon } from "../components/game/PieceVisuals";
import type { Language, PieceDisplay } from "../components/game/PieceVisuals";
import {
  SkirmishStage,
} from "../components/skirmish/SkirmishStage";
import type { SkirmishStageName } from "../components/skirmish/SkirmishStage";
import { BOARD_SIZE, cellKey, findObstacleInDirection, isLegalPlacement } from "../lib/game/board";
import { PIECE_CONFIG, PIECE_TYPES, PIECES_PER_PLAYER } from "../lib/game/pieces";
import {
  countControlledCells,
  getControlledCells,
  getInfluence,
  getOutgoingRelations,
  getRelations,
} from "../lib/game/relations";
import {
  advanceLancers,
  createCollapseLayer,
  getCollapseDecision,
  getStats,
  removePendingPieces,
  settleForEvaluation,
} from "../lib/game/collapse";
import { createMatchSeed } from "../lib/game/random";
import { generateSkirmishBattlefield } from "../lib/game/battlefield";
import { PUZZLE_LEVELS } from "../lib/game/puzzles";
import type { PuzzleHandEntry, PuzzleLevel } from "../lib/game/puzzles";
import { evaluatePuzzleGoal } from "../lib/game/puzzleGenerator";
import type { GeneratedPuzzle } from "../lib/game/puzzleGenerator";
import {
  collapseStateForFrame,
  transitionCollapsePlayback,
} from "../lib/game/collapsePlayback";
import {
  DRAFT_POOLS,
  generateDraftAiChoices,
  generateDraftOffers,
  getDraftTier,
} from "../lib/game/draft";
import type { CollapseLayer, CollapseSnapshot, Direction, Piece, PieceType, Player, TerrainCell } from "../lib/game/types";
import type { CollapsePlaybackEvent, CollapsePlaybackState } from "../lib/game/collapsePlayback";

type Phase = "placement" | "ready" | "settling" | "finished";
type Ruleset = "classic" | "skirmish";
type AppScreen = "home" | "classic" | "skirmish" | "puzzle" | "generator";
type ColorTheme = "standard" | "vivid" | "accessible";
type StrategyStyle = "balanced" | "aggressive" | "defensive" | "territorial";
type AiStyle = StrategyStyle | "random";
type FirstChoice = "human" | "ai" | "random";
type InspectionView = "incoming" | "outgoing";

const PUBLIC_RELEASE = import.meta.env.MODE === "public";

type SettlementFrame = CollapseSnapshot & {
  description: string;
  layer?: CollapseLayer;
};

type DraftOffer = [PieceType, PieceType, PieceType];

type PlacementPreview = {
  player: Player;
  type: PieceType;
  row: number;
  col: number;
  direction?: Direction;
};

type PlacementDrag = {
  pointerId: number;
  player: Player;
  type: PieceType;
  liftY: number;
  originX: number;
  originY: number;
  x: number;
  y: number;
  active: boolean;
  row: number | null;
  col: number | null;
  valid: boolean;
};

type ChargeMove = {
  piece: Piece;
  fromRow: number;
  fromCol: number;
};

type ChargeAnimation = {
  nextPieces: Piece[];
  moves: ChargeMove[];
  round: number;
};

const PLAYER_ORDER: readonly Player[] = ["blue", "red"];
const PIECE_DIRECTIONS: readonly Direction[] = ["up", "right", "down", "left"];
const DIRECTIONAL_PIECES = new Set<PieceType>(["musket", "shield", "halberd", "ram", "charger"]);
const DIRECTION_VECTORS: Record<Direction, readonly [number, number]> = {
  up: [-1, 0],
  right: [0, 1],
  down: [1, 0],
  left: [0, -1],
};
const PIECE_LAB_TERRAIN: TerrainCell[] = [
  { row: 1, col: 3, type: "fence" },
  { row: 3, col: 1, type: "fence" },
  { row: 3, col: 5, type: "fence" },
  { row: 5, col: 3, type: "fence" },
];
const PIECE_LAB_TIERS: { key: "core" | "advanced" | "elite"; types: PieceType[] }[] = [
  { key: "core", types: ["guard", "scout", "archer", "knight", "shield", "halberd"] },
  { key: "advanced", types: ["cannon", "musket", "crossbow", "lancer", "sentry", "ram", "engineer"] },
  { key: "elite", types: ["fortress", "selector", "charger"] },
];

function hasCurrentDraftSchedule(offers: DraftOffer[]) {
  return offers.length === 10 && offers.every((offer, round) => {
    const pool = DRAFT_POOLS[getDraftTier(round)];
    return offer.length === 3 && new Set(offer).size === 3 && offer.every((type) => pool.includes(type));
  });
}
const TOUCH_DRAG_LIFT_PX = 28;
const COLLAPSE_BREAK_MS = 650;
const LANCER_CHARGE_MS = 460;
const REPLAY_MARK_MS = 320;
const REPLAY_RECALCULATE_MS = 650;
const SAVED_MATCH_KEY = "battle-array:match:v1";

const I18N = {
  zh: {
    title: "阵衡",
    players: { red: "赤方", blue: "青方" },
    pieces: {
      scout: { name: "枪兵", mark: "枪", desc: "控制四个斜向相邻格。" },
      guard: { name: "剑兵", mark: "剑", desc: "控制上下左右四个相邻格。" },
      archer: { name: "射手", mark: "射", desc: "控制上下左右正好相距两格的四格；可越过中间的棋子和障碍。" },
      cannon: { name: "炮台", mark: "炮", desc: "沿四条直线分别寻找第一枚棋子或障碍作为炮架；越过这一座炮架后控制其后的格，直到并包括遇到的下一枚棋子。遇到第二个障碍时，炮线立即停止。" },
      musket: { name: "火枪", mark: "铳", desc: "放置时选择朝向；控制该方向直至棋盘边缘。棋子不阻挡，障碍会截断射线。" },
      knight: { name: "骑士", mark: "骑", desc: "控制八个“日”字形落点；中间的棋子和障碍不会阻挡。" },
      fortress: { name: "堡垒", mark: "堡", desc: "控制周围八个相邻格。" },
      shield: { name: "盾卫", mark: "盾", desc: "放置时选择朝向；控制前方三格和左右两格，共五个相邻格，背后三格为盲区。" },
      crossbow: { name: "弩手", mark: "弩", desc: "沿上下左右分别控制至遇到的第一枚棋子，并包括该棋子；障碍会截断射线。" },
      lancer: { name: "长剑士", mark: "长剑", desc: "控制上下左右距离一格和两格的八格；距离两格的目标可越过中间的棋子和障碍。" },
      charger: { name: "骑枪", mark: "骑枪", desc: "放置时确定方向；控制左前、正前、右前与正前两格。每轮清算前沿该方向冲锋，直到被棋子、障碍或棋盘边缘挡住；挡路棋子离场后会继续冲锋。" },
      halberd: { name: "戟兵", mark: "戟", desc: "放置时选择朝向；控制左前、右前，以及跳过正前一格后的远前方，共三格。" },
      selector: { name: "神射手", mark: "神射", desc: "放下后，从以自身为中心的 5×5 范围内选择四格；可以选择有棋子的格，不能选择自身或障碍。" },
      ram: { name: "冲车", mark: "冲", desc: "放置时选择朝向；控制正前方连续三格。若紧邻的正前方是障碍，落子时将其撞毁。" },
      sentry: { name: "哨兵", mark: "哨", desc: "放下后，从以自身为中心的 5×5 范围内选择一个障碍；控制该障碍上下左右四格，范围从障碍位置计算。" },
      engineer: { name: "Engineer", mark: "Build", desc: "落子后在相邻空格建造一个中立障碍。以该障碍为中心，控制除 Engineer 所在格之外的三个正交相邻格；障碍被摧毁后失去范围。" },
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
      restart: "新的一局",
      undo: "撤回一步",
      startSettlement: "开始清算",
      viewResult: "查看胜负",
      rulebook: "规则书",
      done: "完成",
      rematch: "再来一局",
      inspectBoard: "查看棋盘",
      replay: "复盘清算",
      exitReplay: "退出复盘",
      previousStep: "上一步",
      nextStep: "下一步",
      firstStep: "回到开头",
      lastStep: "跳到结尾",
      playReplay: "复盘",
      pauseReplay: "暂停",
    },
    replay: {
      title: "清算复盘",
      initial: "布阵完成：查看清算开始前的完整阵型",
      charged: (count: number) => `${count} 枚骑枪向前冲锋，阵型位置已改变`,
      marked: (round: number, names: string, survival: number) =>
        `第 ${round} 轮判定：${names} 的生存值最低（${survival}），已被标记`,
      removed: (round: number, names: string) =>
        `第 ${round} 轮移除：${names} 离场，攻击与支援即将重新计算`,
      complete: "清算完成：所有存活棋子的生存值均不低于 0",
      step: (current: number, total: number) => `步骤 ${current}/${total}`,
      recalculating: "重新计算攻击与支援…",
    },
    legends: {
      redControl: "己方支援",
      blueControl: "敌方威胁",
      balanced: "势均力敌",
      empty: "无影响",
    },
    inspect: {
      titlePiece: "棋子状态",
      titleCell: "空地势力",
      titleRule: "结算规则",
      incoming: "谁影响它",
      outgoing: "它影响谁",
      hideArrows: "隐藏箭头",
      showArrows: "显示箭头",
      attacked: "被攻击",
      supported: "受支援",
      attacking: "正在攻击",
      supporting: "正在支援",
      redSources: "红方来源",
      blueSources: "蓝方来源",
      netInfluence: "势力差",
      attackers: "攻击者",
      supporters: "支援者",
      attackTargets: "攻击目标",
      supportTargets: "支援目标",
      none: "无",
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
      firstPlayer: "执红先手",
      aiStyle: "AI 风格",
      currentStyle: (name: string) => `（本局${name}）`,
      theme: "势力配色",
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
    title: "Battle Array: Collapse",
    players: { red: "Crimson", blue: "Azure" },
    pieces: {
      scout: { name: "Spearman", mark: "Spear", desc: "Controls the 4 diagonally adjacent tiles." },
      guard: { name: "Swordsman", mark: "Blade", desc: "Controls the 4 orthogonally adjacent tiles." },
      archer: { name: "Archer", mark: "Bow", desc: "Controls the 4 tiles exactly 2 steps away orthogonally; pieces and Obstacles in between are ignored." },
      cannon: { name: "Cannon", mark: "Cannon", desc: "On each orthogonal line, the first piece or Obstacle is the screen. The Cannon fires over that one screen and controls tiles beyond it, through and including the next piece. A second Obstacle stops the line immediately." },
      musket: { name: "Musket", mark: "Rifle", desc: "Choose a facing when placed. Controls that line to the board edge; pieces do not block it, but an Obstacle stops it." },
      knight: { name: "Knight", mark: "Rider", desc: "Controls the 8 L-shaped destinations; intervening pieces and Obstacles do not block the jump." },
      fortress: { name: "Bastion", mark: "Fort", desc: "Controls all 8 surrounding tiles." },
      shield: { name: "Shield Guard", mark: "Shield", desc: "Choose a facing when placed. Controls the 3 tiles in front and the 2 side tiles; the 3 rear tiles are blind." },
      crossbow: { name: "Crossbow", mark: "Bolt", desc: "Along each orthogonal ray, controls every tile through and including the first piece encountered. An Obstacle stops the ray." },
      lancer: { name: "Longswordsman", mark: "Longsword", desc: "Controls the 8 orthogonal tiles at distances 1 and 2; distance-2 targets ignore intervening pieces and Obstacles." },
      charger: { name: "Lancer", mark: "Lance", desc: "Choose a facing when placed. Controls forward-left, forward, forward-right, and the tile 2 steps forward. Before each resolution round it charges in that direction until blocked by a piece, Obstacle, or board edge; it charges again when a blocker is removed." },
      halberd: { name: "Halberdier", mark: "Halberd", desc: "Choose a facing when placed. Controls forward-left, forward-right, and the far-forward tile after skipping the adjacent front tile." },
      selector: { name: "Sharpshooter", mark: "Aim", desc: "After placing, choose 4 tiles within the 5×5 area centered on it. Occupied tiles are valid; its own tile and Obstacles are not." },
      ram: { name: "Battering Ram", mark: "Ram", desc: "Choose a facing when placed. Controls the next 3 tiles forward and destroys the nearest Obstacle within those 3 tiles." },
      sentry: { name: "Sentry", mark: "Sentry", desc: "After placing, choose an Obstacle within the 5×5 area centered on it. Controls the 4 orthogonal tiles around that Obstacle, measured from the Obstacle." },
      engineer: { name: "Engineer", mark: "Build", desc: "After placing, build a neutral Obstacle on an orthogonally adjacent empty tile. Controls the other 3 orthogonal tiles around that Obstacle; destroying it removes this range." },
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
      restart: "New Game",
      undo: "Undo",
      startSettlement: "Settle",
      viewResult: "Outcome",
      rulebook: "Rulebook",
      done: "Done",
      rematch: "Play Again",
      inspectBoard: "Inspect Board",
      replay: "Replay Resolution",
      exitReplay: "Exit Replay",
      previousStep: "Previous",
      nextStep: "Next",
      firstStep: "First step",
      lastStep: "Last step",
      playReplay: "Replay",
      pauseReplay: "Pause",
    },
    replay: {
      title: "Resolution Replay",
      initial: "Placement complete: inspect the full formation before resolution",
      charged: (count: number) => `${count} Lancer${count === 1 ? "" : "s"} charged forward and changed the formation`,
      marked: (round: number, names: string, survival: number) =>
        `Round ${round} check: ${names} have the lowest survival (${survival}) and are marked`,
      removed: (round: number, names: string) =>
        `Round ${round} removal: ${names} leave the board; attacks and supports now recalculate`,
      complete: "Resolution complete: every survivor has a non-negative survival value",
      step: (current: number, total: number) => `Step ${current}/${total}`,
      recalculating: "Recalculating attacks and supports…",
    },
    legends: {
      redControl: "Ally Support",
      blueControl: "Enemy Threat",
      balanced: "Balanced",
      empty: "Empty",
    },
    inspect: {
      titlePiece: "Piece Status",
      titleCell: "Tile Influence",
      titleRule: "Resolution Rule",
      incoming: "Sources",
      outgoing: "Targets",
      hideArrows: "Hide Arrows",
      showArrows: "Show Arrows",
      attacked: "Attacked",
      supported: "Supported",
      attacking: "Attacking",
      supporting: "Supporting",
      redSources: "Crimson Sources",
      blueSources: "Azure Sources",
      netInfluence: "Influence Gap",
      attackers: "Attackers",
      supporters: "Supporters",
      attackTargets: "Attack Targets",
      supportTargets: "Support Targets",
      none: "None",
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
      firstPlayer: "First Player",
      aiStyle: "AI Strategy",
      currentStyle: (name: string) => ` (${name})`,
      theme: "Theme",
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

const AI_WEIGHTS: Record<
  StrategyStyle,
  { attack: number; safety: number; support: number; territory: number }
> = {
  balanced: { attack: 3.4, safety: 3.5, support: 0.65, territory: 0.22 },
  aggressive: { attack: 5.2, safety: 2.1, support: 0.35, territory: 0.12 },
  defensive: { attack: 2.2, safety: 5.4, support: 1.05, territory: 0.16 },
  territorial: { attack: 2.8, safety: 3.1, support: 0.55, territory: 0.9 },
};

function evaluateForRed(pieces: Piece[], style: StrategyStyle, terrain: TerrainCell[] = []) {
  const stats = getStats(pieces, terrain);
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

  const control = countControlledCells(pieces, terrain);
  score += (control.red - control.blue) * weights.territory;

  return score;
}

function getOverlap(pieces: Piece[], player: Player, terrain: TerrainCell[] = []) {
  let overlap = 0;
  for (const value of getInfluence(pieces, terrain).values()) {
    overlap += Math.max(0, value[player] - 1);
  }
  return overlap;
}

function getMoveStyleBonus(
  type: PieceType,
  before: Piece[],
  after: Piece[],
  style: StrategyStyle,
  terrain: TerrainCell[] = [],
) {
  const redPlaced = before.filter((piece) => piece.player === "red").length;
  const placed = after[after.length - 1];
  const controlledByMove = getControlledCells(placed, after, terrain);
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
    const beforeControl = countControlledCells(before, terrain).red;
    const afterControl = countControlledCells(after, terrain).red;
    const addedControl = afterControl - beforeControl;
    const addedOverlap = getOverlap(after, "red", terrain) - getOverlap(before, "red", terrain);
    bonus += addedControl * 1.45 - addedOverlap * 0.85;
    if (redPlaced < 2 && type === "knight") bonus += 1.8;
  } else {
    bonus += enemiesHit * 1.15 + alliesSupported * 0.85;
    if (redPlaced < 2 && (type === "guard" || type === "scout")) bonus += 0.9;
  }

  return bonus;
}

function getResolutionScore(pieces: Piece[], terrain: TerrainCell[] = []) {
  const settled = settleForEvaluation(pieces, terrain);
  const redAlive = settled.filter((piece) => piece.player === "red").length;
  const blueAlive = settled.length - redAlive;
  const control = countControlledCells(settled, terrain);
  return (redAlive - blueAlive) * 5 + (control.red - control.blue) * 0.16;
}

type PlacementVariant = Pick<Piece, "direction" | "targets" | "anchor" | "destroyedObstacle" | "createdObstacle">;

function terrainAfterPlacement(terrain: TerrainCell[], variant: PlacementVariant) {
  let next = terrain;
  if (variant.createdObstacle) next = [...next, variant.createdObstacle];
  if (variant.destroyedObstacle) next = next.filter((cell) =>
    cell.row !== variant.destroyedObstacle!.row || cell.col !== variant.destroyedObstacle!.col);
  return next;
}

function getPlacementVariants(
  type: PieceType,
  row: number,
  col: number,
  player: Player,
  pieces: Piece[],
  terrain: TerrainCell[],
): PlacementVariant[] {
  if (DIRECTIONAL_PIECES.has(type)) {
    return PIECE_DIRECTIONS.map((direction) => {
      const obstacle = type === "ram" ? findObstacleInDirection(row, col, direction, terrain) : null;
      return { direction, destroyedObstacle: obstacle ? { ...obstacle } : undefined };
    });
  }
  if (type === "sentry") {
    return terrain
      .filter((obstacle) => Math.max(Math.abs(obstacle.row - row), Math.abs(obstacle.col - col)) <= 2)
      .map((obstacle) => ({ anchor: [obstacle.row, obstacle.col] as [number, number] }));
  }
  if (type === "engineer") {
    return [[-1, 0], [1, 0], [0, -1], [0, 1]].flatMap(([dr, dc]) => {
      const targetRow = row + dr;
      const targetCol = col + dc;
      return isLegalPlacement(targetRow, targetCol, pieces, terrain)
        ? [{ createdObstacle: { row: targetRow, col: targetCol, type: "fence" as const } }]
        : [];
    });
  }
  if (type === "selector") {
    const possible: [number, number][] = [];
    for (let targetRow = row - 2; targetRow <= row + 2; targetRow += 1) {
      for (let targetCol = col - 2; targetCol <= col + 2; targetCol += 1) {
        if (
          targetRow >= 0 && targetRow < BOARD_SIZE && targetCol >= 0 && targetCol < BOARD_SIZE &&
          (targetRow !== row || targetCol !== col) &&
          !terrain.some((cell) => cell.row === targetRow && cell.col === targetCol)
        ) {
          possible.push([targetRow, targetCol]);
        }
      }
    }
    possible.sort((first, second) => {
      const firstPiece = pieces.find((item) => item.row === first[0] && item.col === first[1]);
      const secondPiece = pieces.find((item) => item.row === second[0] && item.col === second[1]);
      const value = (candidate: Piece | undefined) => candidate
        ? candidate.player === player ? 2 : 3
        : 0;
      return value(secondPiece) - value(firstPiece) || cellKey(first[0], first[1]).localeCompare(cellKey(second[0], second[1]));
    });
    return possible.length >= 4 ? [{ targets: possible.slice(0, 4) }] : [];
  }
  return [{}];
}

function chooseRedMove(
  pieces: Piece[],
  redInventory: Record<PieceType, number>,
  blueInventory: Record<PieceType, number>,
  style: StrategyStyle,
  terrain: TerrainCell[] = [],
) {
  const candidates: {
    type: PieceType;
    row: number;
    col: number;
    direction?: Direction;
    targets?: [number, number][];
    anchor?: [number, number];
    createdObstacle?: TerrainCell;
    destroyedObstacle?: TerrainCell;
    score: number;
  }[] = [];

  for (const type of PIECE_TYPES) {
    if (redInventory[type] <= 0) continue;
    for (let row = 0; row < BOARD_SIZE; row += 1) {
      for (let col = 0; col < BOARD_SIZE; col += 1) {
        if (!isLegalPlacement(row, col, pieces, terrain)) continue;
        const variants = getPlacementVariants(type, row, col, "red", pieces, terrain);
        for (const variant of variants) {
          const candidate: Piece = {
            id: -1,
            player: "red",
            type,
            row,
            col,
            ...variant,
          };
          const imagined = [...pieces, candidate];
          const imaginedTerrain = terrainAfterPlacement(terrain, variant);
          candidates.push({
            type,
            row,
            col,
            ...variant,
            score:
              evaluateForRed(imagined, style, imaginedTerrain) +
              getMoveStyleBonus(type, pieces, imagined, style, imaginedTerrain),
          });
        }
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
      direction: candidate.direction,
      targets: candidate.targets,
      anchor: candidate.anchor,
      createdObstacle: candidate.createdObstacle,
      destroyedObstacle: candidate.destroyedObstacle,
    };
    const afterRed = [...pieces, redPiece];
    const afterRedTerrain = terrainAfterPlacement(terrain, candidate);
    let strongestBlueReply = Number.POSITIVE_INFINITY;
    let strongestBlueReplyPosition: Piece[] | null = null;
    let strongestBlueReplyTerrain: TerrainCell[] | null = null;
    let hasBlueReply = false;

    for (const type of PIECE_TYPES) {
      if (blueInventory[type] <= 0) continue;
      for (let row = 0; row < BOARD_SIZE; row += 1) {
          for (let col = 0; col < BOARD_SIZE; col += 1) {
            if (!isLegalPlacement(row, col, afterRed, afterRedTerrain)) continue;
          const variants = getPlacementVariants(type, row, col, "blue", afterRed, afterRedTerrain);
          for (const variant of variants) {
            hasBlueReply = true;
            const blueReply: Piece = {
              id: -2,
              player: "blue",
              type,
              row,
              col,
              ...variant,
            };
            const replyPosition = [...afterRed, blueReply];
            const replyTerrain = terrainAfterPlacement(afterRedTerrain, variant);
            const replyScore = evaluateForRed(replyPosition, style, replyTerrain);
            if (replyScore < strongestBlueReply) {
              strongestBlueReply = replyScore;
              strongestBlueReplyPosition = replyPosition;
              strongestBlueReplyTerrain = replyTerrain;
            }
          }
        }
      }
    }

    const lookAhead = hasBlueReply ? strongestBlueReply : candidate.score;
    const resolutionPosition = strongestBlueReplyPosition ?? afterRed;
    const resolutionTerrain = strongestBlueReplyTerrain ?? afterRedTerrain;
    const progress = resolutionPosition.length / (PIECES_PER_PLAYER * 2);
    const resolutionWeight = Math.max(0, progress - 0.45) * 1.8;
    const combinedScore =
      candidate.score * 0.32 +
      lookAhead * 0.68 +
      getResolutionScore(resolutionPosition, resolutionTerrain) * resolutionWeight;
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
  terrain: TerrainCell[] = [],
) {
  if (aiPlayer === "red") {
    return chooseRedMove(
      pieces,
      aiInventory,
      opponentInventory,
      style,
      terrain,
    );
  }

  const swapped = pieces.map((piece) => ({
    ...piece,
    player: piece.player === "red" ? "blue" : "red",
  })) as Piece[];
  return chooseRedMove(swapped, aiInventory, opponentInventory, style, terrain);
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
  const [lang, setLang] = useState<Language>("en");
  const [firstChoice, setFirstChoice] = useState<FirstChoice>("random");
  const [humanPlayer, setHumanPlayer] = useState<Player>("blue");
  const [currentPlayer, setCurrentPlayer] = useState<Player>("red");
  const [selectedType, setSelectedType] = useState<PieceType | null>(null);
  const [placementPreview, setPlacementPreview] = useState<PlacementPreview | null>(null);
  const [placementDrag, setPlacementDrag] = useState<PlacementDrag | null>(null);
  const [phase, setPhase] = useState<Phase>("placement");
  const [hoverCell, setHoverCell] = useState<[number, number] | null>(null);
  const [inspectedId, setInspectedId] = useState<number | null>(null);
  const [inspectedCell, setInspectedCell] = useState<[number, number] | null>(null);
  const [inspectionActive, setInspectionActive] = useState(false);
  const [inspectionView, setInspectionView] =
    useState<InspectionView>("incoming");
  const [showInspectionArrows, setShowInspectionArrows] = useState(false);
  const [pendingIds, setPendingIds] = useState<number[]>([]);
  const [settlementPause, setSettlementPause] = useState(false);
  const [settlementFrames, setSettlementFrames] = useState<SettlementFrame[]>([]);
  const [replayIndex, setReplayIndex] = useState<number | null>(null);
  const [replayPlaying, setReplayPlaying] = useState(false);
  const [collapsePlaybackState, setCollapsePlaybackState] =
    useState<CollapsePlaybackState>("idle");
  const [breakingPieces, setBreakingPieces] = useState<Piece[]>([]);
  const [chargeAnimation, setChargeAnimation] = useState<ChargeAnimation | null>(null);
  const [round, setRound] = useState(0);
  const [screen, setScreen] = useState<AppScreen>("home");
  const [activePuzzleIndex, setActivePuzzleIndex] = useState<number | null>(null);
  const [generatedPuzzle, setGeneratedPuzzle] = useState<PuzzleLevel | null>(null);
  const [puzzleHand, setPuzzleHand] = useState<PuzzleHandEntry[]>([]);
  const [ruleset, setRuleset] = useState<Ruleset>("classic");
  const [collapseTestMode, setCollapseTestMode] = useState(false);
  const [musketTestMode, setMusketTestMode] = useState(false);
  const [testPieceType, setTestPieceType] = useState<PieceType>("musket");
  const [selectorTargets, setSelectorTargets] = useState<[number, number][]>([]);
  const [skirmishStage, setSkirmishStage] =
    useState<SkirmishStageName>("battlefield");
  const [matchSeed, setMatchSeed] = useState("");
  const [terrain, setTerrain] = useState<TerrainCell[]>([]);
  const [seedInput, setSeedInput] = useState("");
  const [seedCopied, setSeedCopied] = useState(false);
  const [draftOffers, setDraftOffers] = useState<DraftOffer[]>([]);
  const [draftAiChoices, setDraftAiChoices] = useState<PieceType[]>([]);
  const [draftRound, setDraftRound] = useState(0);
  const [draftRedRoster, setDraftRedRoster] = useState<PieceType[]>([]);
  const [draftBlueRoster, setDraftBlueRoster] = useState<PieceType[]>([]);
  const [draftPickedType, setDraftPickedType] = useState<PieceType | null>(null);
  const [aiThinking, setAiThinking] = useState(false);
  const [colorTheme, setColorTheme] = useState<ColorTheme>("standard");
  const [aiStyle, setAiStyle] = useState<AiStyle>("random");
  const [activeAiStyle, setActiveAiStyle] =
    useState<StrategyStyle>("balanced");
  const [showResult, setShowResult] = useState(false);
  const pieceDisplay: PieceDisplay = "icon";
  const [showSettings, setShowSettings] = useState(false);
  const [showRulebook, setShowRulebook] = useState(false);
  const [hasHydrated, setHasHydrated] = useState(false);
  const placementAudioRef = useRef<AudioContext | null>(null);
  const audioUnlockAttemptedRef = useRef(false);
  const replayStepTimerRef = useRef<number | null>(null);
  const placementDragRef = useRef<PlacementDrag | null>(null);
  const suppressChooseRef = useRef(false);
  const draftAdvanceTimerRef = useRef<number | null>(null);
  const screenRef = useRef<AppScreen>("home");
  const navigationInitializedRef = useRef(false);

  const t = I18N[lang];
  const activePuzzle = generatedPuzzle ?? (activePuzzleIndex === null ? null : PUZZLE_LEVELS[activePuzzleIndex] ?? null);
  const puzzleActive = screen === "puzzle" && activePuzzle !== null;

  function advanceCollapsePlayback(event: CollapsePlaybackEvent) {
    setCollapsePlaybackState((current) => transitionCollapsePlayback(current, event));
  }
  const rulesetCopy = lang === "zh"
      ? {
        classic: "Classic",
        classicDescription: "相同军队，相同战场，纯粹比较布阵。",
        skirmish: "Skirmish",
        skirmishDescription: "面对每局不同的战场，临场构筑你的军队。",
        puzzles: "战阵谜题",
        puzzlesDescription: "放完给定棋子，在 Collapse 中消灭全部敌军。",
        battlefieldIntro: "先确认本局地形，再开始征募。",
        coreDraft: "基础征募",
        advancedDraft: "高级征募",
        eliteDraft: "精英征募",
        beginDraft: "开始 Draft",
        beginBattle: "开始布阵",
        advancedUnavailable: "高级棋子加入后，这里会开启高级 Draft。",
        description: "相同军队，相同战场，纯粹比较布阵。",
        comingSoon: "Skirmish 开发中",
        returnToClassic: "返回 Classic",
        returnHome: "返回",
        seed: "当前种子",
        copySeed: "复制种子",
        copiedSeed: "已复制",
        useSeed: "使用种子",
        seedPlaceholder: "输入种子重新开始",
        battlefield: "战场预览",
        fence: "个障碍",
        fenceLegend: "障碍 · 不可落子",
        draft: "Draft 征募",
        draftRound: "第",
        chooseDraft: "选择一个棋种",
        draftComplete: "Draft 完成",
        roster: "阵容",
      }
      : {
        classic: "Classic",
        classicDescription: "Same armies. Same battlefield. Pure formation strategy.",
        skirmish: "Skirmish",
        skirmishDescription: "Draft your army for a different battlefield every match.",
        puzzles: "Puzzles",
        puzzlesDescription: "Place every given piece, then eliminate all enemies in Collapse.",
        battlefieldIntro: "Confirm this match's terrain before drafting.",
        coreDraft: "Core Draft",
        advancedDraft: "Advanced Draft",
        eliteDraft: "Elite Draft",
        beginDraft: "Begin Draft",
        beginBattle: "Begin Placement",
        advancedUnavailable: "Advanced Draft will open when advanced pieces are added.",
        description: "Same armies. Same battlefield. Pure formation strategy.",
        comingSoon: "Skirmish is in development",
        returnToClassic: "Return to Classic",
        returnHome: "Back",
        seed: "Current seed",
        copySeed: "Copy seed",
        copiedSeed: "Copied",
        useSeed: "Use seed",
        seedPlaceholder: "Enter a seed to restart",
        battlefield: "Battlefield preview",
        fence: "Obstacles",
        fenceLegend: "Obstacle · blocked",
        draft: "Draft",
        draftRound: "Round",
        chooseDraft: "Choose one piece",
        draftComplete: "Draft complete",
        roster: "Roster",
      };
  const aiPlayer: Player = humanPlayer === "red" ? "blue" : "red";
  const viewPlayer: Player = humanPlayer;

  const replayFrame =
    replayIndex === null ? null : settlementFrames[replayIndex] ?? null;
  const replayChargeMoves = useMemo<ChargeMove[]>(() => {
    if (replayIndex === null || replayFrame?.stage !== "charge" || replayIndex === 0) return [];
    const previousPieces = settlementFrames[replayIndex - 1]?.pieces ?? [];
    const previousById = new Map(previousPieces.map((piece) => [piece.id, piece]));
    return replayFrame.affectedPieces.flatMap((piece) => {
      const previous = previousById.get(piece.id);
      if (!previous || (previous.row === piece.row && previous.col === piece.col)) return [];
      return [{ piece, fromRow: previous.row, fromCol: previous.col }];
    });
  }, [replayFrame, replayIndex, settlementFrames]);
  const displayPieces = replayFrame?.pieces ?? pieces;
  const displayPendingIds = replayFrame?.pendingIds ?? pendingIds;
  const isReplaying = replayFrame !== null;
  const boardChargeMoves = isReplaying ? replayChargeMoves : chargeAnimation?.moves ?? [];
  const stats = useMemo(() => getStats(displayPieces, terrain), [displayPieces, terrain]);
  const boardPieces = useMemo(
    () => new Map(displayPieces.map((piece) => [cellKey(piece.row, piece.col), piece])),
    [displayPieces],
  );
  const influence = useMemo(() => getInfluence(displayPieces, terrain), [displayPieces, terrain]);
  const currentDraftOffer = draftOffers[draftRound] ?? null;
  const draftComplete = draftRound >= 10;
  const humanRoster = humanPlayer === "red" ? draftRedRoster : draftBlueRoster;
  const placementReady =
    puzzleActive || ruleset === "classic" ||
    (ruleset === "skirmish" && skirmishStage === "battle" && draftComplete);
  const targetPiecesPerPlayer = musketTestMode && ruleset === "classic"
    ? BOARD_SIZE * BOARD_SIZE
    : collapseTestMode && ruleset === "classic"
      ? 4
      : PIECES_PER_PLAYER;

  const inventory = useMemo(() => {
    const counts: Record<Player, Record<PieceType, number>> = {
      red: {} as Record<PieceType, number>,
      blue: {} as Record<PieceType, number>,
    };
    for (const player of PLAYER_ORDER) {
      for (const type of PIECE_TYPES) {
        const rosterCount =
          puzzleActive
            ? puzzleHand.find((entry) => entry.player === player && entry.type === type)?.count ?? 0
            : musketTestMode && ruleset === "classic"
            ? 99
            : collapseTestMode && ruleset === "classic"
            ? type === "guard" ? 4 : 0
            : ruleset === "skirmish"
            ? (player === "red" ? draftRedRoster : draftBlueRoster).filter(
                (rosterType) => rosterType === type,
              ).length
            : PIECE_CONFIG[type].count;
        const used = puzzleActive ? 0 : pieces.filter(
          (piece) => piece.player === player && piece.type === type,
        ).length;
        counts[player][type] = rosterCount - used;
      }
    }
    return counts;
  }, [collapseTestMode, draftBlueRoster, draftRedRoster, musketTestMode, pieces, puzzleActive, puzzleHand, ruleset]);

  const highlighted = useMemo(() => {
    const cells = new Set<string>();
    const focusCell = hoverCell;
    if (phase !== "placement" || !focusCell || !selectedType) return cells;
    const [row, col] = focusCell;
    const previewPiece: Piece = {
      id: -3,
      player: currentPlayer,
      type: selectedType,
      row,
      col,
      direction: placementPreview?.type === selectedType
        ? placementPreview.direction
        : undefined,
    };
    for (const [nextRow, nextCol] of getControlledCells(previewPiece, pieces, terrain)) {
      cells.add(cellKey(nextRow, nextCol));
    }
    return cells;
  }, [currentPlayer, hoverCell, phase, pieces, placementPreview, selectedType, terrain]);

  const selectorEligibleKeys = useMemo(() => {
    const cells = new Set<string>();
    if (!placementPreview || (placementPreview.type !== "selector" && placementPreview.type !== "sentry" && placementPreview.type !== "engineer")) {
      return cells;
    }
    if (placementPreview.type === "engineer") {
      for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const row = placementPreview.row + dr;
        const col = placementPreview.col + dc;
        if (isLegalPlacement(row, col, pieces, terrain)) cells.add(cellKey(row, col));
      }
      return cells;
    }
    if (placementPreview.type === "sentry") {
      for (const obstacle of terrain) {
        if (
          Math.max(
            Math.abs(obstacle.row - placementPreview.row),
            Math.abs(obstacle.col - placementPreview.col),
          ) <= 2
        ) {
          cells.add(cellKey(obstacle.row, obstacle.col));
        }
      }
      return cells;
    }
    for (let row = placementPreview.row - 2; row <= placementPreview.row + 2; row += 1) {
      for (let col = placementPreview.col - 2; col <= placementPreview.col + 2; col += 1) {
        if (
          row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE &&
          !(row === placementPreview.row && col === placementPreview.col) &&
          !terrain.some((cell) => cell.row === row && cell.col === col)
        ) {
          cells.add(cellKey(row, col));
        }
      }
    }
    return cells;
  }, [pieces, placementPreview, terrain]);
  const selectorTargetKeys = useMemo(
    () => new Set(selectorTargets.map(([row, col]) => cellKey(row, col))),
    [selectorTargets],
  );
  const selectorTargetOrder = useMemo(
    () => new Map(selectorTargets.map(([row, col], index) => [cellKey(row, col), index + 1])),
    [selectorTargets],
  );

  useEffect(() => {
    function handlePointerMove(event: PointerEvent) {
      const drag = placementDragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;

      const distance = Math.hypot(event.clientX - drag.originX, event.clientY - drag.originY);
      if (!drag.active && distance < 8) return;
      event.preventDefault();

      const projectedX = event.clientX;
      const projectedY = event.clientY - drag.liftY;
      const element = document.elementFromPoint(projectedX, projectedY);
      const cell = element?.closest<HTMLElement>("[data-board-row][data-board-col]");
      const row = cell ? Number(cell.dataset.boardRow) : null;
      const col = cell ? Number(cell.dataset.boardCol) : null;
      const valid =
        row !== null &&
        col !== null &&
        phase === "placement" &&
        !aiThinking &&
        (puzzleActive || musketTestMode || drag.player === humanPlayer) &&
        inventory[drag.player][drag.type] > 0 &&
        isLegalPlacement(row, col, pieces, terrain) &&
        (drag.type !== "engineer" || getPlacementVariants("engineer", row, col, drag.player, pieces, terrain).length > 0);
      const nextDrag: PlacementDrag = {
        ...drag,
        x: projectedX,
        y: projectedY,
        active: true,
        row,
        col,
        valid,
      };
      placementDragRef.current = nextDrag;
      setPlacementDrag(nextDrag);
      setPlacementPreview(null);
      setCurrentPlayer(drag.player);
      setSelectedType(drag.type);
      setInspectedId(null);
      setInspectionActive(false);
      setHoverCell(valid && row !== null && col !== null ? [row, col] : null);
    }

    function finishPointerDrag(event: PointerEvent) {
      const drag = placementDragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      placementDragRef.current = null;
      setPlacementDrag(null);

      if (!drag.active) return;
      event.preventDefault();
      suppressChooseRef.current = true;
      window.setTimeout(() => {
        suppressChooseRef.current = false;
      }, 0);

      if (drag.valid && drag.row !== null && drag.col !== null) {
        setPlacementPreview({
          player: drag.player,
          type: drag.type,
          row: drag.row,
          col: drag.col,
          direction: DIRECTIONAL_PIECES.has(drag.type) ? "up" : undefined,
        });
        setSelectorTargets([]);
        setSelectedType(drag.type);
        setHoverCell([drag.row, drag.col]);
      } else {
        setPlacementPreview(null);
        setSelectedType(null);
        setHoverCell(null);
      }
    }

    window.addEventListener("pointermove", handlePointerMove, { passive: false });
    window.addEventListener("pointerup", finishPointerDrag, { passive: false });
    window.addEventListener("pointercancel", finishPointerDrag, { passive: false });
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", finishPointerDrag);
      window.removeEventListener("pointercancel", finishPointerDrag);
    };
  }, [aiThinking, humanPlayer, inventory, musketTestMode, phase, pieces, puzzleActive, terrain]);

  const inspected = displayPieces.find((piece) => piece.id === inspectedId) ?? null;
  const activeInspectedCell = inspectionActive && !inspected ? inspectedCell : null;
  const inspectedCellSources = useMemo(() => {
    if (!activeInspectedCell) return [];
    const [targetRow, targetCol] = activeInspectedCell;
    return displayPieces.filter((piece) =>
      getControlledCells(piece, displayPieces, terrain).some(
        ([row, col]) => row === targetRow && col === targetCol,
      ),
    );
  }, [activeInspectedCell, displayPieces, terrain]);
  const inspectedRelations = useMemo(
    () => (inspected ? getRelations(inspected, displayPieces, terrain) : null),
    [displayPieces, inspected, terrain],
  );
  const outgoingRelations = useMemo(
    () => (inspected ? getOutgoingRelations(inspected, displayPieces, terrain) : null),
    [displayPieces, inspected, terrain],
  );
  const activeInspectionRelations =
    inspectionView === "incoming" ? inspectedRelations : outgoingRelations;
  const inspectionFocusIds = useMemo(() => {
    if (!inspectionActive) return new Set<number>();
    if (activeInspectedCell) {
      return new Set(inspectedCellSources.map((piece) => piece.id));
    }
    if (!inspected || !activeInspectionRelations) return new Set<number>();
    return new Set([
      inspected.id,
      ...activeInspectionRelations.attackers.map((piece) => piece.id),
      ...activeInspectionRelations.supporters.map((piece) => piece.id),
    ]);
  }, [activeInspectedCell, activeInspectionRelations, inspectedCellSources, inspectionActive, inspected]);
  const inspectionObstacleTargetKeys = useMemo(() => {
    if (
      !inspectionActive ||
      inspectionView !== "outgoing" ||
      inspected?.type !== "sentry" ||
      !inspected.anchor
    ) return new Set<string>();
    return new Set([cellKey(inspected.anchor[0], inspected.anchor[1])]);
  }, [inspected, inspectionActive, inspectionView]);
  const redAlive = displayPieces.filter((piece) => piece.player === "red").length;
  const blueAlive = displayPieces.filter((piece) => piece.player === "blue").length;
  const controlled = useMemo(() => countControlledCells(displayPieces, terrain), [displayPieces, terrain]);
  const enemyPlayer: Player = viewPlayer === "red" ? "blue" : "red";
  const zoneCounts = useMemo(() => {
    const fenceKeys = new Set(terrain.map((cell) => cellKey(cell.row, cell.col)));
    const counts = { red: 0, blue: 0, balanced: 0, empty: 0 };
    for (let row = 0; row < BOARD_SIZE; row += 1) {
      for (let col = 0; col < BOARD_SIZE; col += 1) {
        const key = cellKey(row, col);
        if (fenceKeys.has(key)) continue;
        const cellInfluence = influence.get(key);
        const redInfluence = cellInfluence?.red ?? 0;
        const blueInfluence = cellInfluence?.blue ?? 0;
        if (redInfluence === 0 && blueInfluence === 0) counts.empty += 1;
        else if (redInfluence === blueInfluence) counts.balanced += 1;
        else if (redInfluence > blueInfluence) counts.red += 1;
        else counts.blue += 1;
      }
    }
    return counts;
  }, [influence, terrain]);
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
  const puzzleSuccess = puzzleActive && activePuzzle
    ? evaluatePuzzleGoal(
        displayPieces,
        terrain,
        activePuzzle.player,
        activePuzzle.enemy,
        activePuzzle.goal ?? { type: "eliminate-all-enemies" },
      ).passed
    : false;

  const winReason =
    redAlive !== blueAlive
      ? t.resultModal.reasons.morePieces
      : controlled.red !== controlled.blue
        ? t.resultModal.reasons.moreTiles
        : t.resultModal.reasons.exactDraw;

  const opponentPlayer: Player = aiPlayer;
  const collapseSoundStateRef = useRef<CollapsePlaybackState>("idle");

  const getAudioContext = useCallback(() => {
    if (typeof window === "undefined") return null;
    const AudioContextClass =
      window.AudioContext ??
      (window as typeof window & {
        webkitAudioContext?: typeof AudioContext;
      }).webkitAudioContext;
    if (!AudioContextClass) return null;
    const audioContext =
      placementAudioRef.current ?? new AudioContextClass();
    placementAudioRef.current = audioContext;
    void audioContext.resume().catch(() => undefined);
    if (audioContext.state === "suspended" && !audioUnlockAttemptedRef.current) {
      audioUnlockAttemptedRef.current = true;
      const unlock = audioContext.createOscillator();
      const unlockGain = audioContext.createGain();
      unlockGain.gain.setValueAtTime(0.00001, audioContext.currentTime);
      unlock.connect(unlockGain);
      unlockGain.connect(audioContext.destination);
      unlock.start(audioContext.currentTime);
      unlock.stop(audioContext.currentTime + 0.01);
    }
    return audioContext;
  }, []);

  const playPlacementSound = useCallback((player: Player) => {
    const audioContext = getAudioContext();
    if (!audioContext) return;

    const startTime = audioContext.currentTime;
    const pitch = (player === "red" ? 218 : 242) * (0.97 + Math.random() * 0.06);

    const noiseBuffer = audioContext.createBuffer(
      1,
      Math.floor(audioContext.sampleRate * 0.055),
      audioContext.sampleRate,
    );
    const noiseData = noiseBuffer.getChannelData(0);
    for (let index = 0; index < noiseData.length; index += 1) {
      noiseData[index] = (Math.random() * 2 - 1) * (1 - index / noiseData.length);
    }

    const noise = audioContext.createBufferSource();
    const noiseFilter = audioContext.createBiquadFilter();
    const noiseGain = audioContext.createGain();
    noise.buffer = noiseBuffer;
    noiseFilter.type = "bandpass";
    noiseFilter.frequency.setValueAtTime(1760, startTime);
    noiseFilter.Q.setValueAtTime(1.2, startTime);
    noiseGain.gain.setValueAtTime(0.0001, startTime);
    noiseGain.gain.exponentialRampToValueAtTime(0.115, startTime + 0.001);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.055);
    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(audioContext.destination);
    noise.start(startTime);
    noise.stop(startTime + 0.055);

    const resonance = audioContext.createOscillator();
    const resonanceGain = audioContext.createGain();
    resonance.type = "sine";
    resonance.frequency.setValueAtTime(pitch, startTime);
    resonance.frequency.exponentialRampToValueAtTime(pitch * 0.52, startTime + 0.17);
    resonanceGain.gain.setValueAtTime(0.0001, startTime);
    resonanceGain.gain.exponentialRampToValueAtTime(0.065, startTime + 0.004);
    resonanceGain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.18);
    resonance.connect(resonanceGain);
    resonanceGain.connect(audioContext.destination);
    resonance.start(startTime);
    resonance.stop(startTime + 0.19);

    const tap = audioContext.createOscillator();
    const tapGain = audioContext.createGain();
    tap.type = "sine";
    tap.frequency.setValueAtTime(pitch * 3.1, startTime);
    tap.frequency.exponentialRampToValueAtTime(pitch * 1.55, startTime + 0.06);
    tapGain.gain.setValueAtTime(0.0001, startTime);
    tapGain.gain.exponentialRampToValueAtTime(0.04, startTime + 0.002);
    tapGain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.065);
    tap.connect(tapGain);
    tapGain.connect(audioContext.destination);
    tap.start(startTime);
    tap.stop(startTime + 0.07);
  }, [getAudioContext]);

  const playDraftSelectionSound = useCallback((player: Player) => {
    const audioContext = getAudioContext();
    if (!audioContext) return;
    const startTime = audioContext.currentTime;
    const basePitch = player === "red" ? 330 : 370;
    for (const [index, multiplier] of [1, 1.32].entries()) {
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      const noteStart = startTime + index * 0.055;
      oscillator.type = "triangle";
      oscillator.frequency.setValueAtTime(basePitch * multiplier, noteStart);
      gain.gain.setValueAtTime(0.0001, noteStart);
      gain.gain.exponentialRampToValueAtTime(0.055, noteStart + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.0001, noteStart + 0.095);
      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.start(noteStart);
      oscillator.stop(noteStart + 0.1);
    }
  }, [getAudioContext]);

  const playCollapseSound = useCallback((
    kind: "mark" | "crack" | "impact" | "stable",
    roundNumber: number,
  ) => {
    const audioContext = getAudioContext();
    if (!audioContext) return;

    const depth = Math.min(Math.max(roundNumber - 1, 0), 5);
    const weight = 1 + depth * 0.06;
    const startTime = audioContext.currentTime;

    if (kind === "crack") {
      const duration = 0.32;
      const noiseBuffer = audioContext.createBuffer(
        1,
        Math.floor(audioContext.sampleRate * duration),
        audioContext.sampleRate,
      );
      const noiseData = noiseBuffer.getChannelData(0);
      let lowNoise = 0;
      for (let sample = 0; sample < noiseData.length; sample += 1) {
        const white = Math.random() * 2 - 1;
        lowNoise = lowNoise * 0.92 + white * 0.08;
        const position = sample / noiseData.length;
        const attack = Math.min(position / 0.018, 1);
        const decay = Math.pow(1 - position, 1.35);
        noiseData[sample] = lowNoise * attack * decay * 3.2;
      }

      const noise = audioContext.createBufferSource();
      const filter = audioContext.createBiquadFilter();
      const gain = audioContext.createGain();
      noise.buffer = noiseBuffer;
      filter.type = "bandpass";
      filter.frequency.setValueAtTime(520 - depth * 18, startTime);
      filter.frequency.exponentialRampToValueAtTime(
        330 - depth * 9,
        startTime + duration,
      );
      filter.Q.setValueAtTime(0.62, startTime);
      gain.gain.setValueAtTime(0.0001, startTime);
      gain.gain.exponentialRampToValueAtTime(0.28 * weight, startTime + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
      noise.connect(filter);
      filter.connect(gain);
      gain.connect(audioContext.destination);
      noise.start(startTime);
      noise.stop(startTime + duration);

      const grit = audioContext.createBufferSource();
      const gritFilter = audioContext.createBiquadFilter();
      const gritGain = audioContext.createGain();
      grit.buffer = noiseBuffer;
      gritFilter.type = "bandpass";
      gritFilter.frequency.setValueAtTime(980 - depth * 24, startTime);
      gritFilter.Q.setValueAtTime(0.5, startTime);
      gritGain.gain.setValueAtTime(0.0001, startTime);
      gritGain.gain.exponentialRampToValueAtTime(0.105 * weight, startTime + 0.018);
      gritGain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.23);
      grit.connect(gritFilter);
      gritFilter.connect(gritGain);
      gritGain.connect(audioContext.destination);
      grit.start(startTime);
      grit.stop(startTime + 0.24);
      return;
    }

    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = kind === "mark" ? "triangle" : "sine";
    const frequencies = {
      mark: [720 - depth * 16, 430 - depth * 10],
      impact: [240 - depth * 9, 108 - depth * 4],
      stable: [430, 650],
    } as const;
    const [from, to] = frequencies[kind];
    const duration = kind === "mark" ? 0.16 : kind === "impact" ? 0.24 : 0.3;
    const volume = kind === "mark" ? 0.09 : kind === "impact" ? 0.13 : 0.075;
    oscillator.frequency.setValueAtTime(from, startTime);
    oscillator.frequency.exponentialRampToValueAtTime(to, startTime + duration);
    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.exponentialRampToValueAtTime(volume * weight, startTime + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start(startTime);
    oscillator.stop(startTime + duration);

    if (kind === "stable") {
      const second = audioContext.createOscillator();
      const secondGain = audioContext.createGain();
      second.type = "sine";
      second.frequency.setValueAtTime(650, startTime + 0.08);
      second.frequency.exponentialRampToValueAtTime(860, startTime + 0.27);
      secondGain.gain.setValueAtTime(0.0001, startTime + 0.08);
      secondGain.gain.exponentialRampToValueAtTime(0.028, startTime + 0.09);
      secondGain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.3);
      second.connect(secondGain);
      secondGain.connect(audioContext.destination);
      second.start(startTime + 0.08);
      second.stop(startTime + 0.3);
    }
  }, [getAudioContext]);

  useEffect(() => {
    let restoredScreen: AppScreen = "home";
    try {
      const raw = window.localStorage.getItem(SAVED_MATCH_KEY);
      if (raw?.includes('"warden"')) {
        window.localStorage.removeItem(SAVED_MATCH_KEY);
        setHumanPlayer(resolveHumanPlayer("random"));
        setActiveAiStyle(pickRandomStrategy());
      } else if (raw) {
        const saved = JSON.parse(raw);
        if (saved.version === 1 && saved.musketTestMode) {
          // The Piece Lab is disposable tooling, never a resumable match.
          // Older builds persisted it as Classic and could reopen Classic in lab state.
          setLang(saved.lang ?? "en");
          setFirstChoice(saved.firstChoice ?? "random");
          setColorTheme(saved.colorTheme ?? "standard");
          setAiStyle(saved.aiStyle ?? "random");
          setHumanPlayer(resolveHumanPlayer(saved.firstChoice ?? "random"));
          setActiveAiStyle(pickRandomStrategy());
          setScreen("home");
          setRuleset("classic");
          setMusketTestMode(false);
          setCollapseTestMode(false);
        } else if (saved.version === 1) {
          setPieces(saved.pieces ?? []);
          setLang(saved.lang ?? "en");
          setFirstChoice(saved.firstChoice ?? "random");
          setHumanPlayer(saved.humanPlayer ?? "blue");
          setCurrentPlayer(saved.currentPlayer ?? "red");
          setPhase(saved.phase ?? "placement");
          setPendingIds(saved.pendingIds ?? []);
          setSettlementPause(saved.settlementPause ?? false);
          setSettlementFrames(saved.settlementFrames ?? []);
          setRound(saved.round ?? 0);
          restoredScreen = PUBLIC_RELEASE && (saved.screen === "puzzle" || saved.screen === "generator")
            ? "home"
            : saved.screen ?? "home";
          setScreen(restoredScreen);
          setRuleset(saved.ruleset ?? "classic");
          setCollapseTestMode(PUBLIC_RELEASE ? false : saved.collapseTestMode ?? false);
          setMusketTestMode(false);
          setSkirmishStage(saved.skirmishStage ?? "battlefield");
          setMatchSeed(saved.matchSeed ?? "");
          setTerrain(saved.terrain ?? []);
          const savedOffers = (saved.draftOffers ?? []) as DraftOffer[];
          const migrateDraft =
            saved.ruleset === "skirmish" &&
            saved.skirmishStage !== "battle" &&
            !hasCurrentDraftSchedule(savedOffers);
          if (migrateDraft) {
            const seed = saved.matchSeed || createMatchSeed();
            const offers = generateDraftOffers(seed);
            setMatchSeed(seed);
            setDraftOffers(offers);
            setDraftAiChoices(generateDraftAiChoices(offers, seed));
            setDraftRound(0);
            setDraftRedRoster([]);
            setDraftBlueRoster([]);
          } else {
            setDraftOffers(savedOffers);
            setDraftAiChoices(saved.draftAiChoices ?? []);
            setDraftRound(saved.draftRound ?? 0);
            setDraftRedRoster(saved.draftRedRoster ?? []);
            setDraftBlueRoster(saved.draftBlueRoster ?? []);
          }
          setColorTheme(saved.colorTheme ?? "standard");
          setAiStyle(saved.aiStyle ?? "random");
          setActiveAiStyle(saved.activeAiStyle ?? "balanced");
          setShowResult(saved.showResult ?? false);
        }
      } else {
        setHumanPlayer(resolveHumanPlayer("random"));
        setActiveAiStyle(pickRandomStrategy());
      }
    } catch {
      setHumanPlayer(resolveHumanPlayer("random"));
      setActiveAiStyle(pickRandomStrategy());
    }
    if (!PUBLIC_RELEASE && new URLSearchParams(window.location.search).get("puzzleGenerator") === "1") {
      restoredScreen = "generator";
      setScreen("generator");
    }
    if (!navigationInitializedRef.current) {
      window.history.replaceState({ battleArrayLayer: "home" }, "");
      if (restoredScreen !== "home") {
        window.history.pushState({ battleArrayLayer: "game" }, "");
      }
      navigationInitializedRef.current = true;
    }
    setHasHydrated(true);
  }, []);

  useEffect(() => {
    screenRef.current = screen;
  }, [screen]);

  useEffect(() => {
    if (Capacitor.isNativePlatform()) return;
    const handleBrowserBack = () => {
      if (showRulebook) {
        setShowRulebook(false);
        return;
      }
      if (showSettings) {
        setShowSettings(false);
        return;
      }
      if (screenRef.current !== "home") {
        if (screenRef.current === "puzzle" && (activePuzzleIndex !== null || generatedPuzzle)) {
          if (generatedPuzzle) {
            setGeneratedPuzzle(null);
            setScreen("generator");
            setShowResult(false);
            setReplayIndex(null);
            setPhase("placement");
          } else {
            setActivePuzzleIndex(null);
          }
          setSelectedType(null);
          setPlacementPreview(null);
          setInspectedId(null);
          setInspectionActive(false);
          return;
        }
        setScreen("home");
        setSelectedType(null);
        setInspectedId(null);
        setInspectionActive(false);
      }
    };
    window.addEventListener("popstate", handleBrowserBack);
    return () => window.removeEventListener("popstate", handleBrowserBack);
  }, [activePuzzleIndex, generatedPuzzle, showRulebook, showSettings]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let removeListener: (() => void) | undefined;
    let disposed = false;

    void CapacitorApp.addListener("backButton", () => {
      if (showRulebook) {
        setShowRulebook(false);
        return;
      }
      if (showSettings) {
        setShowSettings(false);
        return;
      }
      if (showResult) {
        setShowResult(false);
        return;
      }
      if (replayIndex !== null) {
        setReplayPlaying(false);
        setReplayIndex(null);
        setBreakingPieces([]);
        return;
      }
      if (screen !== "home") {
        if (screen === "puzzle" && (activePuzzleIndex !== null || generatedPuzzle)) {
          if (generatedPuzzle) {
            setGeneratedPuzzle(null);
            setScreen("generator");
            setShowResult(false);
            setReplayIndex(null);
            setPhase("placement");
          } else {
            setActivePuzzleIndex(null);
          }
          setSelectedType(null);
          setPlacementPreview(null);
          setInspectedId(null);
          setInspectionActive(false);
          return;
        }
        setScreen("home");
        setSelectedType(null);
        setInspectedId(null);
        setInspectionActive(false);
        return;
      }
      void CapacitorApp.minimizeApp();
    }).then((handle) => {
      if (disposed) {
        void handle.remove();
      } else {
        removeListener = () => void handle.remove();
      }
    });

    return () => {
      disposed = true;
      removeListener?.();
    };
  }, [activePuzzleIndex, generatedPuzzle, replayIndex, screen, showResult, showRulebook, showSettings]);

  useEffect(() => {
    if (!hasHydrated || musketTestMode || screen === "puzzle" || screen === "generator") return;
    window.localStorage.setItem(SAVED_MATCH_KEY, JSON.stringify({
      version: 1,
      pieces,
      lang,
      firstChoice,
      humanPlayer,
      currentPlayer,
      phase,
      pendingIds,
      settlementPause,
      settlementFrames,
      round,
      screen,
      ruleset,
      collapseTestMode,
      skirmishStage,
      matchSeed,
      terrain,
      draftOffers,
      draftAiChoices,
      draftRound,
      draftRedRoster,
      draftBlueRoster,
      colorTheme,
      aiStyle,
      activeAiStyle,
      showResult,
    }));
  }, [activeAiStyle, aiStyle, collapseTestMode, colorTheme, currentPlayer, draftAiChoices, draftBlueRoster, draftOffers, draftRedRoster, draftRound, firstChoice, hasHydrated, humanPlayer, lang, matchSeed, musketTestMode, pendingIds, phase, pieces, round, ruleset, screen, settlementFrames, settlementPause, showResult, skirmishStage, terrain]);

  useEffect(() => () => {
    if (draftAdvanceTimerRef.current !== null) {
      window.clearTimeout(draftAdvanceTimerRef.current);
    }
  }, []);

  useEffect(() => {
    if (
      !hasHydrated ||
      screen === "home" ||
      puzzleActive ||
      musketTestMode ||
      !placementReady ||
      phase !== "placement" ||
      currentPlayer !== aiPlayer
    ) {
      return;
    }

    const timer = window.setTimeout(() => {
      setAiThinking(true);
      const move = chooseAiMove(
        pieces,
        aiPlayer,
        inventory[aiPlayer],
        inventory[humanPlayer],
        activeAiStyle,
        terrain,
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
        direction: move.direction,
        targets: move.targets,
        anchor: move.anchor,
        createdObstacle: move.createdObstacle,
      };
      if (move.createdObstacle) {
        setTerrain((current) => [...current, move.createdObstacle!]);
      }
      if (move.type === "ram" && move.direction) {
        const obstacle = findObstacleInDirection(move.row, move.col, move.direction, terrain);
        if (obstacle) {
          placed.destroyedObstacle = { ...obstacle };
          setTerrain((current) => current.filter(
            (cell) => cell.row !== obstacle.row || cell.col !== obstacle.col,
          ));
        }
      }
      const nextPieces = [...pieces, placed];
      playPlacementSound(aiPlayer);
      setPieces(nextPieces);
      setInspectedId(null);
      setInspectionActive(false);
      setAiThinking(false);

      if (nextPieces.length === targetPiecesPerPlayer * 2) {
        setPhase("ready");
        setHoverCell(null);
      } else {
        setCurrentPlayer(humanPlayer);
        setSelectedType(null);
      }
    }, 520);

    return () => window.clearTimeout(timer);
  }, [
    currentPlayer,
    activeAiStyle,
    aiPlayer,
    humanPlayer,
    hasHydrated,
    inventory,
    musketTestMode,
    placementReady,
    puzzleActive,
    ruleset,
    screen,
    phase,
    pieces,
    playPlacementSound,
    terrain,
    targetPiecesPerPlayer,
  ]);

  useEffect(() => {
    if (!chargeAnimation) return;
    const timer = window.setTimeout(() => {
      const movedPieces = chargeAnimation.moves.map(({ piece }) => ({ ...piece }));
      setPieces(chargeAnimation.nextPieces);
      setSettlementFrames((current) => [
        ...current,
        {
          pieces: chargeAnimation.nextPieces.map((piece) => ({ ...piece })),
          pendingIds: [],
          round: chargeAnimation.round,
          stage: "charge",
          description: t.replay.charged(movedPieces.length),
          affectedPieces: movedPieces,
        },
      ]);
      setChargeAnimation(null);
    }, LANCER_CHARGE_MS);
    return () => window.clearTimeout(timer);
  }, [chargeAnimation, t]);

  useEffect(() => {
    if (phase !== "settling" || chargeAnimation) return;

    if (settlementPause) {
      const timer = window.setTimeout(() => {
        advanceCollapsePlayback("nextRound");
        setSettlementPause(false);
      }, 900);
      return () => window.clearTimeout(timer);
    }

    if (pendingIds.length > 0) {
      advanceCollapsePlayback("beginBreaking");
      setBreakingPieces(
        pieces
          .filter((piece) => pendingIds.includes(piece.id))
          .map((piece) => ({ ...piece })),
      );
      const timer = window.setTimeout(() => {
        const { removed, remaining: nextPieces } = removePendingPieces(pieces, pendingIds);
        const layer = createCollapseLayer(
          pieces,
          removed,
          nextPieces,
          round,
          Math.min(
            ...pieces.map((piece) => stats.get(piece.id)?.survival ?? 0),
          ),
          terrain,
        );
        const removedNames = removed
          .map(
            (piece) =>
              `${t.players[piece.player]} ${t.pieces[piece.type].name}`,
          )
          .join(" · ");

        setPieces(nextPieces);
        setBreakingPieces([]);
        setSettlementFrames((current) => [
          ...current,
        {
          pieces: nextPieces,
          pendingIds: [],
          round,
          stage: "removed",
          description: t.replay.removed(round, removedNames),
          affectedPieces: removed.map((piece) => ({ ...piece })),
          layer,
        },
        ]);
        advanceCollapsePlayback("recalculate");
        setInspectedId(null);
        setPendingIds([]);
        setSettlementPause(true);
      }, COLLAPSE_BREAK_MS);
      return () => window.clearTimeout(timer);
    }

    const charge = advanceLancers(pieces, terrain);
    if (charge.movedIds.length > 0) {
      const beforeById = new Map(pieces.map((piece) => [piece.id, piece]));
      const moves = charge.pieces
        .filter((piece) => charge.movedIds.includes(piece.id))
        .flatMap((piece) => {
          const before = beforeById.get(piece.id);
          if (!before) return [];
          return [{ piece: { ...piece }, fromRow: before.row, fromCol: before.col }];
        });
      advanceCollapsePlayback("beginCharge");
      setChargeAnimation({ nextPieces: charge.pieces, moves, round });
      setInspectedId(null);
      setInspectionActive(false);
      return;
    }

    const timer = window.setTimeout(() => {
      const decision = getCollapseDecision(pieces, round, terrain);

      if (decision.stage === "complete") {
        setSettlementFrames((current) => [
          ...current,
          {
            pieces: decision.pieces,
            pendingIds: [],
            round: decision.round,
            stage: "complete",
            description: t.replay.complete,
            affectedPieces: [],
          },
        ]);
        advanceCollapsePlayback("complete");
        setPhase("finished");
        setShowResult(true);
        return;
      }

      const nextPending = decision.pendingIds;
      const nextRound = decision.round;
      const { removed: layerRemoved, remaining: layerAfter } = removePendingPieces(
        pieces,
        nextPending,
      );
      const layer = createCollapseLayer(
        pieces,
        layerRemoved,
        layerAfter,
        nextRound,
        decision.survival,
        terrain,
      );
      const pendingNames = pieces
        .filter((piece) => nextPending.includes(piece.id))
        .map(
          (piece) =>
            `${t.players[piece.player]} ${t.pieces[piece.type].name}`,
        )
        .join(" · ");

      setSettlementFrames((current) => [
        ...current,
          {
          pieces: decision.pieces,
          pendingIds: nextPending,
          round: nextRound,
          stage: "marked",
          description: t.replay.marked(nextRound, pendingNames, decision.survival),
          affectedPieces: pieces
            .filter((piece) => nextPending.includes(piece.id))
            .map((piece) => ({ ...piece })),
          survival: decision.survival,
          layer,
        },
      ]);
      advanceCollapsePlayback("showUnstable");
      setRound(nextRound);
      setPendingIds(nextPending);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [chargeAnimation, pendingIds, phase, pieces, round, settlementPause, stats, t, terrain]);

  useEffect(() => {
    if (
      !replayPlaying ||
      replayIndex === null ||
      replayIndex >= settlementFrames.length - 1
    ) return;

    const frame = settlementFrames[replayIndex];
    if (!frame) return;

    if (frame.stage === "marked") {
      const breakingTimer = window.setTimeout(() => {
        setBreakingPieces(frame.affectedPieces.map((piece) => ({ ...piece })));
        advanceCollapsePlayback("beginBreaking");
      }, REPLAY_MARK_MS);
      const advanceTimer = window.setTimeout(() => {
        setBreakingPieces([]);
        setReplayIndex((current) =>
          current === null
            ? 0
            : Math.min(current + 1, settlementFrames.length - 1),
        );
      }, REPLAY_MARK_MS + COLLAPSE_BREAK_MS);
      return () => {
        window.clearTimeout(breakingTimer);
        window.clearTimeout(advanceTimer);
      };
    }

    const delay = frame.stage === "removed" ? REPLAY_RECALCULATE_MS : 600;
    const timer = window.setTimeout(() => {
      setReplayIndex((current) =>
        current === null
          ? 0
          : Math.min(current + 1, settlementFrames.length - 1),
      );
    }, delay);
    return () => window.clearTimeout(timer);
  }, [replayIndex, replayPlaying, settlementFrames]);

  useEffect(() => {
    if (!isReplaying || !replayFrame) return;
    setCollapsePlaybackState(collapseStateForFrame(replayFrame.stage));
  }, [isReplaying, replayFrame]);

  useEffect(() => {
    const previous = collapseSoundStateRef.current;
    if (previous === collapsePlaybackState) return;

    if (collapsePlaybackState === "unstable") {
      playCollapseSound("mark", replayFrame?.round ?? round);
    } else if (collapsePlaybackState === "breaking") {
      playCollapseSound("crack", replayFrame?.round ?? round);
    } else if (collapsePlaybackState === "recalculate") {
      playCollapseSound("impact", replayFrame?.round ?? round);
    } else if (collapsePlaybackState === "complete") {
      playCollapseSound("stable", replayFrame?.round ?? round);
    }

    collapseSoundStateRef.current = collapsePlaybackState;
  }, [
    collapsePlaybackState,
    playCollapseSound,
    replayFrame,
    round,
  ]);

  function chooseType(type: PieceType) {
    if (suppressChooseRef.current) return;
    if (
      !placementReady ||
      phase !== "placement" ||
      aiThinking ||
      inventory[currentPlayer][type] <= 0
    ) return;
    setPlacementPreview(null);
    setHoverCell(null);
    setSelectedType((current) => (current === type ? null : type));
    setInspectedId(null);
    setInspectedCell(null);
    setInspectionActive(false);
  }

  function choosePuzzleType(player: Player, type: PieceType) {
    if (suppressChooseRef.current || !puzzleActive || phase !== "placement") return;
    if (inventory[player][type] <= 0) return;
    setCurrentPlayer(player);
    setPlacementPreview(null);
    setHoverCell(null);
    setSelectedType((current) => currentPlayer === player && current === type ? null : type);
    setInspectedId(null);
    setInspectedCell(null);
    setInspectionActive(false);
  }

  function beginPlacementDrag(
    type: PieceType,
    event: import("react").PointerEvent<HTMLButtonElement>,
    playerOverride?: Player,
  ) {
    const placementPlayer = playerOverride ?? currentPlayer;
    if (
      phase !== "placement" ||
      aiThinking ||
      (!puzzleActive && !musketTestMode && placementPlayer !== humanPlayer) ||
      inventory[placementPlayer][type] <= 0
    ) return;

    setCurrentPlayer(placementPlayer);
    const drag: PlacementDrag = {
      pointerId: event.pointerId,
      player: placementPlayer,
      type,
      liftY: event.pointerType === "touch" ? TOUCH_DRAG_LIFT_PX : 0,
      originX: event.clientX,
      originY: event.clientY,
      x: event.clientX,
      y: event.clientY - (event.pointerType === "touch" ? TOUCH_DRAG_LIFT_PX : 0),
      active: false,
      row: null,
      col: null,
      valid: false,
    };
    placementDragRef.current = drag;
    setPlacementDrag(drag);
  }

  function commitPlacement(
    type: PieceType,
    row: number,
    col: number,
    direction?: Direction,
    targets?: [number, number][],
    anchor?: [number, number],
    createdObstacle?: TerrainCell,
  ) {
    const placingPlayer = puzzleActive ? placementPreview?.player ?? currentPlayer : currentPlayer;
    if (
      phase !== "placement" ||
      aiThinking ||
      (!puzzleActive && !musketTestMode && placingPlayer === aiPlayer) ||
      !isLegalPlacement(row, col, pieces, terrain) ||
      inventory[placingPlayer][type] <= 0
    ) return;
    if (type === "engineer" && (
      !createdObstacle ||
      Math.abs(createdObstacle.row - row) + Math.abs(createdObstacle.col - col) !== 1 ||
      !isLegalPlacement(createdObstacle.row, createdObstacle.col, pieces, terrain)
    )) return;

    const resolvedDirection = DIRECTIONAL_PIECES.has(type) ? direction ?? "up" : direction;
    const placed: Piece = {
      id: Date.now() + pieces.length,
      player: placingPlayer,
      type,
      row,
      col,
      direction: resolvedDirection,
      targets,
      anchor,
      createdObstacle,
    };
    if (createdObstacle) {
      setTerrain((current) => [...current, createdObstacle]);
    }
    if (type === "ram" && resolvedDirection) {
      const obstacle = findObstacleInDirection(row, col, resolvedDirection, terrain);
      if (obstacle) {
        placed.destroyedObstacle = { ...obstacle };
        setTerrain((current) => current.filter(
          (cell) => cell.row !== obstacle.row || cell.col !== obstacle.col,
        ));
      }
    }
    const nextPieces = [...pieces, placed];
    const nextPlayer = placingPlayer === "red" ? "blue" : "red";
    playPlacementSound(placingPlayer);
    setPieces(nextPieces);
    setInspectedId(null);
    setInspectionActive(false);
    setSelectedType(null);
    setPlacementPreview(null);
    setSelectorTargets([]);
    setHoverCell(null);

    if (puzzleActive) {
      const remainingBeforePlacement = puzzleHand.reduce((sum, entry) => sum + entry.count, 0);
      setPuzzleHand((current) => current.map((entry) =>
        entry.player === placingPlayer && entry.type === type
          ? { ...entry, count: Math.max(0, entry.count - 1) }
          : entry,
      ));
      if (remainingBeforePlacement === 1) setPhase("ready");
      return;
    }

    if (nextPieces.length === targetPiecesPerPlayer * 2) {
      setPhase("ready");
      return;
    }

    setCurrentPlayer(nextPlayer);
  }

  function activateCell(row: number, col: number) {
    if (placementPreview) {
      if (placementPreview.type === "engineer") {
        if (!selectorEligibleKeys.has(cellKey(row, col))) return;
        commitPlacement(
          placementPreview.type,
          placementPreview.row,
          placementPreview.col,
          undefined,
          undefined,
          undefined,
          { row, col, type: "fence" },
        );
        return;
      }
      if (placementPreview.type === "sentry") {
        if (!selectorEligibleKeys.has(cellKey(row, col))) return;
        commitPlacement(
          placementPreview.type,
          placementPreview.row,
          placementPreview.col,
          undefined,
          undefined,
          [row, col],
        );
        return;
      }
      if (placementPreview.type === "selector") {
        const key = cellKey(row, col);
        if (!selectorEligibleKeys.has(key)) return;
        const alreadySelected = selectorTargetKeys.has(key);
        const nextTargets = alreadySelected
          ? selectorTargets.filter(([targetRow, targetCol]) => targetRow !== row || targetCol !== col)
          : [...selectorTargets, [row, col] as [number, number]];
        if (nextTargets.length === 4) {
          commitPlacement(
            placementPreview.type,
            placementPreview.row,
            placementPreview.col,
            undefined,
            nextTargets,
          );
        } else {
          setSelectorTargets(nextTargets);
        }
        return;
      }
      commitPlacement(
        placementPreview.type,
        placementPreview.row,
        placementPreview.col,
        placementPreview.direction,
      );
      return;
    }
    const existing = boardPieces.get(cellKey(row, col));
    if (existing) {
      setSelectedType(null);
      setInspectedCell(null);
      setInspectedId(existing.id);
      setInspectionActive(true);
      return;
    }
    if (inspectionActive) {
      setInspectedId(null);
      setInspectedCell(null);
      setInspectionActive(false);
      return;
    }
    const cellInfluence = influence.get(cellKey(row, col));
    if (!selectedType && (cellInfluence?.red ?? 0) + (cellInfluence?.blue ?? 0) > 0) {
      setSelectedType(null);
      setInspectedId(null);
      setInspectedCell([row, col]);
      setInspectionActive(true);
      return;
    }
    if (window.matchMedia("(max-width: 720px)").matches) return;
    if (
      phase !== "placement" ||
      aiThinking ||
      (!puzzleActive && !musketTestMode && currentPlayer === aiPlayer) ||
      !selectedType ||
      !isLegalPlacement(row, col, pieces, terrain) ||
      inventory[currentPlayer][selectedType] <= 0
    ) {
      return;
    }

    if (selectedType === "selector" || selectedType === "sentry" || selectedType === "engineer") {
      if (selectedType === "engineer" && getPlacementVariants(selectedType, row, col, currentPlayer, pieces, terrain).length === 0) return;
      setPlacementPreview({
        player: currentPlayer,
        type: selectedType,
        row,
        col,
      });
      setSelectorTargets([]);
      setHoverCell([row, col]);
      return;
    }
    commitPlacement(selectedType, row, col);
  }

  function aimPlacement(direction: Direction) {
    setPlacementPreview((current) =>
      current && DIRECTIONAL_PIECES.has(current.type) ? { ...current, direction } : current,
    );
  }

  function movePlacement(row: number, col: number) {
    if (!placementPreview || !isLegalPlacement(row, col, pieces, terrain)) return;
    if (placementPreview.type === "engineer" && getPlacementVariants("engineer", row, col, placementPreview.player, pieces, terrain).length === 0) return;
    if (row !== placementPreview.row || col !== placementPreview.col) {
      setSelectorTargets([]);
    }
    setPlacementPreview((current) => current ? { ...current, row, col } : current);
    setHoverCell([row, col]);
  }

  function cancelPlacement() {
    setPlacementPreview(null);
    setSelectorTargets([]);
    setSelectedType(null);
    setHoverCell(null);
  }

  function undo() {
    if ((phase !== "placement" && phase !== "ready") || aiThinking) return;
    if (puzzleActive && activePuzzle) {
      if (pieces.length <= activePuzzle.pieces.length) return;
      const removed = pieces.at(-1);
      if (!removed) return;
      if (removed.destroyedObstacle) {
        setTerrain((current) => current.some((cell) => cell.row === removed.destroyedObstacle!.row && cell.col === removed.destroyedObstacle!.col)
          ? current
          : [...current, removed.destroyedObstacle!]);
      }
      if (removed.createdObstacle) {
        setTerrain((current) => current.filter((cell) =>
          cell.row !== removed.createdObstacle!.row || cell.col !== removed.createdObstacle!.col));
      }
      setPieces((current) => current.slice(0, -1));
      setPuzzleHand((current) => current.map((entry) =>
        entry.player === removed.player && entry.type === removed.type
          ? { ...entry, count: entry.count + 1 }
          : entry,
      ));
      setCurrentPlayer(removed.player);
      setSelectedType(null);
      setPlacementPreview(null);
      setSelectorTargets([]);
      placementDragRef.current = null;
      setPlacementDrag(null);
      setInspectedId(null);
      setInspectionActive(false);
      setPhase("placement");
      return;
    }
    if (pieces.length < (musketTestMode ? 1 : 2)) return;
    const steps = musketTestMode ? 1 : 2;
    const nextPieces = pieces.slice(0, -steps);
    const removed = pieces.slice(-steps);
    const restoreTerrainEffects = () => {
      const obstacles = removed.flatMap((piece) => piece.destroyedObstacle ? [piece.destroyedObstacle] : []);
      setTerrain((current) => {
        const createdByRemoved = new Set(removed.flatMap((piece) => piece.createdObstacle
          ? [cellKey(piece.createdObstacle.row, piece.createdObstacle.col)]
          : []));
        const next = current.filter((cell) => !createdByRemoved.has(cellKey(cell.row, cell.col)));
        for (const obstacle of obstacles) {
          const key = cellKey(obstacle.row, obstacle.col);
          if (!createdByRemoved.has(key) && !next.some((cell) => cell.row === obstacle.row && cell.col === obstacle.col)) {
            next.push(obstacle);
          }
        }
        return next;
      });
    };
    if (musketTestMode) {
      restoreTerrainEffects();
      setPieces(nextPieces);
      setCurrentPlayer(removed[0]?.player ?? "red");
      setSelectedType(null);
      setPlacementPreview(null);
      setSelectorTargets([]);
      placementDragRef.current = null;
      setPlacementDrag(null);
      setInspectedId(null);
      setInspectionActive(false);
      setPhase("placement");
      return;
    }
    const lastHumanMove = removed.find(
      (piece) => piece.player === humanPlayer,
    );
    if (!lastHumanMove) return;
    restoreTerrainEffects();
    setPieces(nextPieces);
    setCurrentPlayer(humanPlayer);
    setSelectedType(null);
    setPlacementPreview(null);
    setSelectorTargets([]);
    placementDragRef.current = null;
    setPlacementDrag(null);
    setInspectedId(null);
    setInspectionActive(false);
    setPhase("placement");
  }

  function resetTo() {
    if (aiStyle === "random") {
      setActiveAiStyle(pickRandomStrategy());
    }
    setPieces([]);
    setCurrentPlayer("red");
    setSelectedType(null);
    setPlacementPreview(null);
    setSelectorTargets([]);
    placementDragRef.current = null;
    setPlacementDrag(null);
    setPhase("placement");
    setHoverCell(null);
    setInspectedId(null);
    setInspectionActive(false);
    setPendingIds([]);
    setSettlementPause(false);
    setSettlementFrames([]);
    setReplayIndex(null);
    setReplayPlaying(false);
    advanceCollapsePlayback("reset");
    setBreakingPieces([]);
    setChargeAnimation(null);
    if (replayStepTimerRef.current !== null) {
      window.clearTimeout(replayStepTimerRef.current);
      replayStepTimerRef.current = null;
    }
    setRound(0);
    setAiThinking(false);
    setShowResult(false);
    setDraftPickedType(null);
    if (draftAdvanceTimerRef.current !== null) {
      window.clearTimeout(draftAdvanceTimerRef.current);
      draftAdvanceTimerRef.current = null;
    }
  }

  function resetDraft(seed: string) {
    const offers = generateDraftOffers(seed);
    setDraftOffers(offers);
    setDraftAiChoices(generateDraftAiChoices(offers, seed));
    setDraftRound(0);
    setDraftRedRoster([]);
    setDraftBlueRoster([]);
    setDraftPickedType(null);
  }

  function reset() {
    setShowSettings(false);
    if (puzzleActive && activePuzzleIndex !== null) {
      loadPuzzleLevel(activePuzzleIndex);
      return;
    }
    if (puzzleActive && generatedPuzzle) {
      loadGeneratedPuzzle(generatedPuzzle);
      return;
    }
    setHumanPlayer(resolveHumanPlayer(firstChoice));
    if (ruleset === "skirmish") {
      setSkirmishStage("battlefield");
      const nextSeed = createMatchSeed();
      setMatchSeed(nextSeed);
      setTerrain(generateSkirmishBattlefield(nextSeed).terrain);
      setSeedInput("");
      setSeedCopied(false);
      resetDraft(nextSeed);
    } else if (musketTestMode) {
      setTerrain(PIECE_LAB_TERRAIN.map((cell) => ({ ...cell })));
    }
    resetTo();
  }

  function loadPuzzleLevel(index: number) {
    const level = PUZZLE_LEVELS[index];
    if (!level) return;
    setGeneratedPuzzle(null);
    setActivePuzzleIndex(index);
    setHumanPlayer(level.player);
    setCurrentPlayer(level.hand[0]?.player ?? level.player);
    setPieces(level.pieces.map((piece) => ({ ...piece })));
    setPuzzleHand(level.hand.map((entry) => ({ ...entry })));
    setTerrain(level.terrain.map((cell) => ({ ...cell })));
    setSelectedType(null);
    setPlacementPreview(null);
    setSelectorTargets([]);
    placementDragRef.current = null;
    setPlacementDrag(null);
    setPhase(level.hand.some((entry) => entry.count > 0) ? "placement" : "ready");
    setHoverCell(null);
    setInspectedId(null);
    setInspectedCell(null);
    setInspectionActive(false);
    setPendingIds([]);
    setSettlementPause(false);
    setSettlementFrames([]);
    setReplayIndex(null);
    setReplayPlaying(false);
    advanceCollapsePlayback("reset");
    setBreakingPieces([]);
    setChargeAnimation(null);
    setRound(0);
    setAiThinking(false);
    setShowResult(false);
  }

  function loadGeneratedPuzzle(level: PuzzleLevel) {
    if (JSON.stringify(level).includes('"warden"')) {
      setGeneratedPuzzle(null);
      setActivePuzzleIndex(null);
      setScreen("generator");
      return;
    }
    setGeneratedPuzzle(level);
    setActivePuzzleIndex(null);
    setScreen("puzzle");
    setHumanPlayer(level.player);
    setCurrentPlayer(level.hand[0]?.player ?? level.player);
    setPieces(level.pieces.map((piece) => ({ ...piece })));
    setPuzzleHand(level.hand.map((entry) => ({ ...entry })));
    setTerrain(level.terrain.map((cell) => ({ ...cell })));
    setSelectedType(null);
    setPlacementPreview(null);
    setSelectorTargets([]);
    placementDragRef.current = null;
    setPlacementDrag(null);
    setPhase(level.hand.some((entry) => entry.count > 0) ? "placement" : "ready");
    setHoverCell(null);
    setInspectedId(null);
    setInspectedCell(null);
    setInspectionActive(false);
    setPendingIds([]);
    setSettlementPause(false);
    setSettlementFrames([]);
    setReplayIndex(null);
    setReplayPlaying(false);
    advanceCollapsePlayback("reset");
    setBreakingPieces([]);
    setChargeAnimation(null);
    setRound(0);
    setAiThinking(false);
    setShowResult(false);
  }

  function changeRuleset(nextRuleset: Ruleset) {
    setRuleset(nextRuleset);
    setSkirmishStage(nextRuleset === "skirmish" ? "battlefield" : "battle");
    if (nextRuleset === "skirmish") {
      const nextSeed = createMatchSeed();
      setMatchSeed(nextSeed);
      setTerrain(generateSkirmishBattlefield(nextSeed).terrain);
      resetDraft(nextSeed);
    } else {
      setTerrain([]);
      setDraftOffers([]);
      setDraftAiChoices([]);
      setDraftRound(0);
      setDraftRedRoster([]);
      setDraftBlueRoster([]);
    }
    setSeedInput("");
    setSeedCopied(false);
    resetTo();
  }

  function hasMatchProgress() {
    return (
      pieces.length > 0 ||
      phase !== "placement" ||
      (ruleset === "skirmish" && skirmishStage !== "battlefield") ||
      (ruleset === "skirmish" && draftRound > 0)
    );
  }

  function returnToHome() {
    if (puzzleActive) {
      if (generatedPuzzle) {
        setGeneratedPuzzle(null);
        setScreen("generator");
        setShowResult(false);
        setReplayIndex(null);
        setPhase("placement");
        setSelectedType(null);
        setPlacementPreview(null);
        setInspectedId(null);
        setInspectionActive(false);
        return;
      }
      setActivePuzzleIndex(null);
      setShowSettings(false);
      setShowRulebook(false);
      setSelectedType(null);
      setPlacementPreview(null);
      setInspectedId(null);
      setInspectionActive(false);
      return;
    }
    if (window.history.state?.battleArrayLayer === "game") {
      window.history.back();
      return;
    }
    setScreen("home");
    setShowSettings(false);
    setShowRulebook(false);
    setSelectedType(null);
    setInspectedId(null);
    setInspectionActive(false);
  }

  function enterRuleset(nextRuleset: Ruleset) {
    if (window.history.state?.battleArrayLayer !== "game") {
      window.history.pushState({ battleArrayLayer: "game" }, "");
    }
    if (hasMatchProgress() && nextRuleset === ruleset && !musketTestMode) {
      setScreen(nextRuleset);
      return;
    }
    setMusketTestMode(false);
    setCollapseTestMode(
      !PUBLIC_RELEASE &&
      nextRuleset === "classic" &&
      new URLSearchParams(window.location.search).get("collapseTest") === "1",
    );
    changeRuleset(nextRuleset);
    setScreen(nextRuleset);
  }

  function enterMusketTest() {
    setMusketTestMode(true);
    setCollapseTestMode(false);
    setHumanPlayer("red");
    setTestPieceType("musket");
    setSelectorTargets([]);
    changeRuleset("classic");
    setTerrain(PIECE_LAB_TERRAIN.map((cell) => ({ ...cell })));
    setScreen("classic");
  }

  function beginSkirmishDraft() {
    if (ruleset !== "skirmish") return;
    setSkirmishStage("core-draft");
  }

  function beginSkirmishBattle() {
    if (ruleset !== "skirmish" || !draftComplete) return;
    setSkirmishStage("battle");
  }

  function applySkirmishSeed() {
    const nextSeed = seedInput.trim();
    if (!nextSeed) return;
    setMatchSeed(nextSeed);
    setTerrain(generateSkirmishBattlefield(nextSeed).terrain);
    resetDraft(nextSeed);
    setSkirmishStage("battlefield");
    setSeedInput("");
    setSeedCopied(false);
    resetTo();
  }

  async function copySkirmishSeed() {
    if (!matchSeed || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(matchSeed);
      setSeedCopied(true);
    } catch {
      setSeedCopied(false);
    }
  }

  function chooseDraftPiece(type: PieceType) {
    if (ruleset !== "skirmish" || draftComplete || draftPickedType !== null) return;
    if (!currentDraftOffer?.includes(type)) return;
    const aiChoice = draftAiChoices[draftRound];
    if (!aiChoice) return;
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    setDraftPickedType(type);
    playDraftSelectionSound(humanPlayer);
    draftAdvanceTimerRef.current = window.setTimeout(() => {
      if (humanPlayer === "red") {
        setDraftRedRoster((current) => [...current, type]);
        setDraftBlueRoster((current) => [...current, aiChoice]);
      } else {
        setDraftBlueRoster((current) => [...current, type]);
        setDraftRedRoster((current) => [...current, aiChoice]);
      }
      setDraftRound((current) => current + 1);
      setDraftPickedType(null);
      draftAdvanceTimerRef.current = null;
    }, 210);
  }

  function changeFirstPlayer(nextChoice: FirstChoice) {
    setFirstChoice(nextChoice);
    setHumanPlayer(resolveHumanPlayer(nextChoice));
    if (ruleset === "skirmish" && matchSeed) resetDraft(matchSeed);
    resetTo();
  }

  function changeAiStyle(nextStyle: AiStyle) {
    setAiStyle(nextStyle);
    setActiveAiStyle(
      nextStyle === "random" ? pickRandomStrategy() : nextStyle,
    );
  }

  function startSettlement() {
    if (pieces.length === 0) return;
    getAudioContext();
    setSelectedType(null);
    setInspectedId(null);
    setInspectionActive(false);
    setPendingIds([]);
    setSettlementPause(false);
    setSettlementFrames([
      {
        pieces: pieces.map((piece) => ({ ...piece })),
        pendingIds: [],
        round: 0,
        stage: "initial",
        description: t.replay.initial,
        affectedPieces: [],
      },
    ]);
    setReplayIndex(null);
    setReplayPlaying(false);
    advanceCollapsePlayback("begin");
    setBreakingPieces([]);
    setChargeAnimation(null);
    setRound(0);
    setShowResult(false);
    setPhase("settling");
  }

  function openReplay() {
    if (settlementFrames.length === 0) return;
    getAudioContext();
    if (replayStepTimerRef.current !== null) {
      window.clearTimeout(replayStepTimerRef.current);
      replayStepTimerRef.current = null;
    }
    setShowResult(false);
    setReplayPlaying(false);
    setReplayIndex(0);
    advanceCollapsePlayback("begin");
    setBreakingPieces([]);
    setInspectedId(null);
    setInspectionActive(false);
  }

  function exitReplay() {
    if (replayStepTimerRef.current !== null) {
      window.clearTimeout(replayStepTimerRef.current);
      replayStepTimerRef.current = null;
    }
    setReplayPlaying(false);
    setReplayIndex(null);
    advanceCollapsePlayback("reset");
    setBreakingPieces([]);
    setInspectedId(null);
    setInspectionActive(false);
    setShowResult(true);
  }

  function stepReplay(direction: -1 | 1) {
    if (settlementFrames.length === 0) return;
    setReplayPlaying(false);
    if (replayStepTimerRef.current !== null) {
      window.clearTimeout(replayStepTimerRef.current);
      replayStepTimerRef.current = null;
    }
    if (direction === 1 && replayFrame?.stage === "marked") {
      setBreakingPieces(replayFrame.affectedPieces.map((piece) => ({ ...piece })));
      advanceCollapsePlayback("beginBreaking");
      replayStepTimerRef.current = window.setTimeout(() => {
        setBreakingPieces([]);
        setReplayIndex((current) =>
          current === null
            ? 0
            : Math.min(current + 1, settlementFrames.length - 1),
        );
        replayStepTimerRef.current = null;
      }, COLLAPSE_BREAK_MS);
      return;
    }
    setBreakingPieces([]);
    setReplayIndex((current) => {
      const next = current === null ? 0 : current + direction;
      return Math.max(0, Math.min(next, settlementFrames.length - 1));
    });
  }

  function jumpReplay(index: number) {
    if (settlementFrames.length === 0) return;
    setReplayPlaying(false);
    if (replayStepTimerRef.current !== null) {
      window.clearTimeout(replayStepTimerRef.current);
      replayStepTimerRef.current = null;
    }
    setBreakingPieces([]);
    setReplayIndex(Math.max(0, Math.min(index, settlementFrames.length - 1)));
  }

  function toggleReplayPlayback() {
    if (replayIndex === null || settlementFrames.length === 0) return;
    getAudioContext();
    if (replayStepTimerRef.current !== null) {
      window.clearTimeout(replayStepTimerRef.current);
      replayStepTimerRef.current = null;
      setBreakingPieces([]);
    }
    const atEnd = replayIndex >= settlementFrames.length - 1;
    if (atEnd) setReplayIndex(0);
    setReplayPlaying((current) => (atEnd ? true : !current));
  }

  const replayAtEnd =
    replayIndex !== null && replayIndex >= settlementFrames.length - 1;
  const replayIsPlaying = replayPlaying && !replayAtEnd;
  const replayTransitioning = collapsePlaybackState === "breaking";

  const titleText =
    puzzleActive
      ? phase === "placement"
        ? (lang === "zh" ? "布置给定棋子" : "Place the given pieces")
        : phase === "ready"
          ? t.header.ready
          : phase === "settling"
            ? `${t.header.settling} · ${t.header.round} ${Math.max(round, 1)} ${t.header.roundSuffix}`
            : activePuzzle!.title[lang]
      : ruleset === "skirmish" && skirmishStage !== "battle"
      ? skirmishStage === "battlefield"
        ? rulesetCopy.battlefield
        : skirmishStage === "advanced-draft"
          ? rulesetCopy.advancedDraft
          : rulesetCopy.coreDraft
      : phase === "placement"
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

  const baseSubtitleText =
    puzzleActive
      ? activePuzzle!.lesson[lang]
      : ruleset === "skirmish" && skirmishStage !== "battle"
      ? rulesetCopy.skirmishDescription
      : phase === "placement"
      ? `${t.header.subPlacing} ${pieces.length}/${targetPiecesPerPlayer * 2}`
      : phase === "ready"
        ? t.header.subReady
      : phase === "settling"
          ? collapsePlaybackState === "charge"
            ? (lang === "zh" ? "冲锋阶段：骑枪移动完成后才计算攻击、支援与生存值" : "Charge stage: attacks, supports, and survival are checked after movement")
            : t.header.subSettling
          : `${t.players.red} ${redAlive} : ${blueAlive} ${t.players.blue} · ${t.players.red} ${controlled.red} : ${controlled.blue} ${t.players.blue}`;
  const subtitleText = musketTestMode
    ? (lang === "zh"
      ? `棋子实验场 · ${t.players[currentPlayer]}选择棋种，拖到棋盘测试`
      : `Piece Lab · ${t.players[currentPlayer]} chooses a piece and drags it onto the board`)
    : collapseTestMode
      ? `${lang === "zh" ? "Collapse 测试 · 双方各 4 枚剑兵" : "Collapse Test · 4 Swordsmen each"} · ${baseSubtitleText}`
      : baseSubtitleText;

  return (
    <main
      className={`game-shell theme-${colorTheme} mode-ai ruleset-${ruleset} phase-${phase} skirmish-stage-${skirmishStage} lang-${lang} collapse-${collapsePlaybackState} ${screen === "home" ? "screen-home" : ""} ${puzzleActive ? "puzzle-active" : ""} ${isReplaying ? "is-replaying" : ""}`}
      data-collapse-state={collapsePlaybackState}
      onPointerDown={(event) => {
        if (!inspectionActive || !(event.target instanceof Element)) return;
        if (event.target.closest(".board") || event.target.closest(".inspection-switch")) return;
        setInspectedId(null);
        setInspectedCell(null);
        setInspectionActive(false);
      }}
    >
      {screen === "generator" ? (
        <PuzzleGeneratorLab
          lang={lang}
          pieceNames={Object.fromEntries(PIECE_TYPES.map((type) => [type, t.pieces[type].name])) as Record<PieceType, string>}
          onExit={() => setScreen("home")}
          onPlay={(puzzle: GeneratedPuzzle) => loadGeneratedPuzzle(puzzle)}
        />
      ) : screen === "puzzle" && !puzzleActive ? (
        <PuzzleMode
          lang={lang}
          onExit={() => setScreen("home")}
          onChooseLevel={loadPuzzleLevel}
        />
      ) : screen === "home" ? (
        <HomeScreen
          copy={{
            title: t.title,
            classic: rulesetCopy.classic,
            classicDescription: rulesetCopy.classicDescription,
            skirmish: rulesetCopy.skirmish,
            skirmishDescription: rulesetCopy.skirmishDescription,
            puzzles: rulesetCopy.puzzles,
            puzzlesDescription: rulesetCopy.puzzlesDescription,
            settings: t.actions.settings,
            rulebook: t.actions.rulebook,
          }}
          lang={lang}
          onLanguageChange={setLang}
          onChooseClassic={() => enterRuleset("classic")}
          onChooseSkirmish={() => enterRuleset("skirmish")}
          onChoosePuzzles={() => {
            if (window.history.state?.battleArrayLayer !== "game") {
              window.history.pushState({ battleArrayLayer: "game" }, "");
            }
            setScreen("puzzle");
          }}
          onChooseMusketTest={enterMusketTest}
          onChoosePuzzleGenerator={() => setScreen("generator")}
          onOpenSettings={() => {
            setShowRulebook(false);
            setShowSettings(true);
          }}
          onOpenRulebook={() => {
            setShowSettings(false);
            setShowRulebook(true);
          }}
          showDevelopmentModes={!PUBLIC_RELEASE}
        />
      ) : (
        <>
      <header className="topbar">
        <div className="brand">
          <button
            type="button"
            className="quiet-button home-button"
            onClick={returnToHome}
            aria-label={rulesetCopy.returnHome}
          >
            <svg className="toolbar-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5m6-6-6 6 6 6" /></svg>
            <span className="home-button-label">{rulesetCopy.returnHome}</span>
          </button>
          <span className="brand-mark">衡</span>
          <div>
            <h1>{puzzleActive ? `${lang === "zh" ? "谜题" : "Puzzle"} ${activePuzzle!.number}` : rulesetCopy[ruleset]}</h1>
          </div>
        </div>
        <div className="turn-copy" aria-live="polite">
          <strong>{titleText}</strong>
          <span>{subtitleText}</span>
        </div>
        <div className="header-actions">
          <button
            className="quiet-button mobile-undo-button"
            aria-label={t.actions.undo}
            disabled={(puzzleActive ? pieces.length <= (activePuzzle?.pieces.length ?? 0) : pieces.length === 0) || aiThinking || phase !== "placement"}
            onClick={undo}
          >
            <svg className="toolbar-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 7 5 11l4 4" /><path d="M6 11h7a6 6 0 0 1 6 6" /></svg>
          </button>
          <label className="language-select">
            <select
              value={lang}
              aria-label={t.settingsModal.language}
              onChange={(event) => setLang(event.target.value as Language)}
            >
              <option value="en">English</option>
              <option value="zh">简体中文</option>
            </select>
          </label>
          <button
            className="quiet-button rulebook-button"
            onClick={() => {
              setShowSettings(false);
              setShowRulebook(true);
            }}
          >
            <span className="rulebook-button-label">{t.actions.rulebook}</span>
            <span className="rulebook-button-icon" aria-hidden="true">▤</span>
          </button>
          <button
            className="quiet-button restart-button"
            aria-label={t.actions.restart}
            onClick={reset}
          >
            <span className="restart-button-label">{t.actions.restart}</span>
            <svg className="restart-button-icon toolbar-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 7v5h-5" /><path d="M19 12a7.5 7.5 0 1 0-1.6 5" /></svg>
          </button>
          <button
            className="quiet-button settings-button"
            aria-label={t.actions.settings}
            onClick={() => {
              setShowRulebook(false);
              setShowSettings(true);
            }}
          >
            <span className="settings-button-label">{t.actions.settings}</span>
            <FaGear className="settings-button-icon" aria-hidden="true" />
          </button>
        </div>
      </header>

      <section className="game-layout">
        <aside className={`player-panel red-panel ${humanPlayer === "red" ? "human-panel" : ""} ${currentPlayer === "red" ? "active" : ""}`}>
          <div className="player-heading">
            <span className="player-dot" />
            <div>
              <span>
                {lang === "zh" ? "先手" : "First"}
                {humanPlayer === "red" && ` · ${t.firstChoices.human}`}
              </span>
              <h2>
                {t.players.red} {aiPlayer === "red" && <em>AI</em>}
              </h2>
            </div>
            <strong>{redAlive}</strong>
          </div>
          {phase === "placement" && !puzzleActive && !musketTestMode && (ruleset === "classic" || humanPlayer === "red") && <PlayerHand
            player="red"
            currentPlayer={currentPlayer}
            inventory={inventory.red}
            selectedType={selectedType}
            phase={phase}
            isComputer={aiPlayer === "red"}
            pieceDisplay={pieceDisplay}
            lang={lang}
            copy={t}
            onChoose={chooseType}
            onDragStart={beginPlacementDrag}
          />}
        </aside>

        <div className="board-column">
          {!puzzleActive && ruleset === "classic" && !musketTestMode && (
            <div className={`mobile-opponent-summary ${opponentPlayer}`}>
              <strong>{t.players[opponentPlayer]}</strong>
              {PIECE_TYPES.filter((type) => inventory[opponentPlayer][type] > 0).map((type) => (
                <span key={type}>
                  <i className="summary-piece">
                    <PieceFace type={type} display={pieceDisplay} lang={lang} />
                  </i>
                  {inventory[opponentPlayer][type]}
                </span>
              ))}
            </div>
          )}
          {!puzzleActive && ruleset === "skirmish" && skirmishStage !== "battle" ? (
            <SkirmishStage
              stage={skirmishStage}
              matchSeed={matchSeed}
              terrain={terrain}
              seedInput={seedInput}
              seedCopied={seedCopied}
              draftRound={draftRound}
              currentOffer={currentDraftOffer}
              humanPlayer={humanPlayer}
              humanRoster={humanRoster}
              draftPickedType={draftPickedType}
              lang={lang}
              pieceDisplay={pieceDisplay}
              players={t.players}
              pieces={t.pieces}
              copy={{
                skirmish: rulesetCopy.skirmish,
                battlefield: rulesetCopy.battlefield,
                battlefieldIntro: rulesetCopy.battlefieldIntro,
                seed: rulesetCopy.seed,
                copySeed: rulesetCopy.copySeed,
                copiedSeed: rulesetCopy.copiedSeed,
                useSeed: rulesetCopy.useSeed,
                seedPlaceholder: rulesetCopy.seedPlaceholder,
                fence: rulesetCopy.fence,
                fenceLegend: rulesetCopy.fenceLegend,
                draft: rulesetCopy.draft,
                coreDraft: rulesetCopy.coreDraft,
                advancedDraft: rulesetCopy.advancedDraft,
                eliteDraft: rulesetCopy.eliteDraft,
                draftRound: rulesetCopy.draftRound,
                chooseDraft: rulesetCopy.chooseDraft,
                draftComplete: rulesetCopy.draftComplete,
                roster: rulesetCopy.roster,
                beginDraft: rulesetCopy.beginDraft,
                beginBattle: rulesetCopy.beginBattle,
                advancedUnavailable: rulesetCopy.advancedUnavailable,
              }}
              onSeedInputChange={setSeedInput}
              onApplySeed={applySkirmishSeed}
              onCopySeed={copySkirmishSeed}
              onBeginDraft={beginSkirmishDraft}
              onChooseDraft={chooseDraftPiece}
              onBeginBattle={beginSkirmishBattle}
            />
          ) : (
          <BattleBoard
            boardPieces={boardPieces}
            stats={stats}
            influence={influence}
            terrain={terrain}
            highlighted={highlighted}
            displayPendingIds={displayPendingIds}
            breakingPieces={breakingPieces}
            chargingMoves={boardChargeMoves}
            isBreaking={collapsePlaybackState === "breaking"}
            inspectedId={inspectedId}
            inspectedCell={activeInspectedCell}
            inspectedCellSources={inspectedCellSources}
            inspectionActive={inspectionActive}
            inspectionFocusIds={inspectionFocusIds}
            activeInspectionRelations={activeInspectionRelations}
            inspectionObstacleTargetKeys={inspectionObstacleTargetKeys}
            inspectionView={inspectionView}
            showInspectionArrows={showInspectionArrows}
            placementPreview={placementPreview}
            previewOrigin={phase === "placement" && selectedType ? hoverCell : null}
            previewPlayer={currentPlayer}
            selectorEligibleKeys={selectorEligibleKeys}
            selectorTargetKeys={selectorTargetKeys}
            selectorTargetOrder={selectorTargetOrder}
            viewPlayer={viewPlayer}
            phase={phase}
            isReplaying={isReplaying}
            pieceDisplay={pieceDisplay}
            lang={lang}
            copy={t}
            onHoverCell={setHoverCell}
            onActivateCell={activateCell}
            onAimPlacement={aimPlacement}
            onMovePlacement={movePlacement}
            onCancelPlacement={cancelPlacement}
          />
          )}

          {puzzleActive && phase === "placement" && !isReplaying && (
            <section className="puzzle-integrated-hand" aria-label={lang === "zh" ? "待放棋子" : "Pieces to place"}>
              <div className="player-hand">
                <div className="inventory">
                  {puzzleHand.filter((entry) => entry.count > 0).map((entry) => (
                    <PieceTray
                      key={`${entry.player}-${entry.type}`}
                      player={entry.player}
                      type={entry.type}
                      count={entry.count}
                      selected={currentPlayer === entry.player && selectedType === entry.type}
                      enabled
                      pieceDisplay={pieceDisplay}
                      lang={lang}
                      pieceData={t.pieces[entry.type]}
                      ownerLabel={t.players[entry.player]}
                      onChoose={() => choosePuzzleType(entry.player, entry.type)}
                      onDragStart={(event) => beginPlacementDrag(entry.type, event, entry.player)}
                    />
                  ))}
                </div>
              </div>
            </section>
          )}

          {musketTestMode && phase === "placement" && !isReplaying && (
            <section className="piece-lab-controls" aria-label={lang === "zh" ? "棋子实验场" : "Piece Lab"}>
              <div className="piece-lab-actions">
                <PieceTray
                  player={currentPlayer}
                  type={testPieceType}
                  count={1}
                  selected
                  enabled
                  pieceDisplay={pieceDisplay}
                  lang={lang}
                  pieceData={t.pieces[testPieceType]}
                  ownerLabel={t.players[currentPlayer]}
                  onChoose={() => chooseType(testPieceType)}
                  onDragStart={(event) => beginPlacementDrag(testPieceType, event)}
                />
                <button
                  type="button"
                  className="primary-button piece-lab-resolve"
                  disabled={pieces.length === 0}
                  onClick={startSettlement}
                >
                  {lang === "zh" ? "立即清算" : "Resolve"}
                </button>
              </div>
              <div className="piece-lab-tier-pickers">
                {PIECE_LAB_TIERS.map((tier) => {
                  const tierLabel = lang === "zh"
                    ? tier.key === "core" ? "基础" : tier.key === "advanced" ? "高级" : "精英"
                    : tier.key === "core" ? "Core" : tier.key === "advanced" ? "Advanced" : "Elite";
                  return (
                    <label className="piece-lab-picker" key={tier.key}>
                      <span>{tierLabel}</span>
                      <select
                        value={tier.types.includes(testPieceType) ? testPieceType : ""}
                        aria-label={tierLabel}
                        onChange={(event) => {
                          if (!event.target.value) return;
                          const nextType = event.target.value as PieceType;
                          setTestPieceType(nextType);
                          cancelPlacement();
                          setSelectedType(nextType);
                        }}
                      >
                        <option value="" disabled>{tierLabel}</option>
                        {tier.types.map((type) => (
                          <option value={type} key={type}>{t.pieces[type].name}</option>
                        ))}
                      </select>
                    </label>
                  );
                })}
              </div>
              {placementPreview?.type === "selector" && (
                <span className="piece-lab-selection-count">
                  {lang === "zh" ? `已选 ${selectorTargets.length}/4` : `${selectorTargets.length}/4 selected`}
                </span>
              )}
              {placementPreview?.type === "sentry" && (
                <span className="piece-lab-selection-count">
                  {lang === "zh" ? "选择黄框障碍" : "Choose a highlighted Obstacle"}
                </span>
              )}
            </section>
          )}

          {placementReady && <div className={`board-status ${isReplaying ? "replay-inspection-status" : ""}`}>
              <div className="inspection-switch" role="group" aria-label={t.inspect.titlePiece}>
                <button
                  className={inspectionView === "incoming" ? "selected" : ""}
                  onClick={() => setInspectionView("incoming")}
                >
                  {t.inspect.incoming}
                </button>
                <button
                  className={inspectionView === "outgoing" ? "selected" : ""}
                  onClick={() => setInspectionView("outgoing")}
                >
                  {t.inspect.outgoing}
                </button>
                {inspectionActive && (inspected || activeInspectedCell) && <button
                  className="inspection-arrow-toggle"
                  aria-pressed={!showInspectionArrows}
                  onClick={() => setShowInspectionArrows((visible) => !visible)}
                >
                  <span aria-hidden="true">{showInspectionArrows ? "↗" : "○"}</span>
                  {showInspectionArrows ? t.inspect.hideArrows : t.inspect.showArrows}
                </button>}
              </div>
            {!isReplaying && <div className="range-legend">
              <span>
                <i className="legend-square danger">
                  {viewPlayer === "red" ? "+" : "!"}
                </i>
                {viewPlayer === "red" ? t.legends.redControl : t.legends.blueControl}
                <strong>{zoneCounts[viewPlayer]}</strong>
              </span>
              <span>
                <i className="legend-square support">
                  {viewPlayer === "blue" ? "+" : "!"}
                </i>
                {viewPlayer === "blue" ? t.legends.redControl : t.legends.blueControl}
                <strong>{zoneCounts[enemyPlayer]}</strong>
              </span>
              <span><i className="legend-square balanced">=</i>{t.legends.balanced}<strong>{zoneCounts.balanced}</strong></span>
              <span><i className="legend-square empty">·</i>{t.legends.empty}<strong>{zoneCounts.empty}</strong></span>
            </div>}
          </div>}

          {placementReady && !isReplaying && <div className="board-actions">
            <button
              className="secondary-button board-undo-button"
              disabled={(puzzleActive ? pieces.length <= (activePuzzle?.pieces.length ?? 0) : pieces.length === 0) || aiThinking || phase === "settling" || phase === "finished"}
              onClick={undo}
            >
              {t.actions.undo}
            </button>
            {phase === "ready" && (
              <button className="primary-button" onClick={startSettlement}>
                {t.actions.startSettlement}
              </button>
            )}
            {!isReplaying && phase === "finished" && (
              <button
                className="primary-button"
                onClick={() => setShowResult(true)}
              >
                {t.actions.viewResult}
              </button>
            )}
          </div>}

          {placementReady && isReplaying && (
            <section className="replay-panel" aria-live="polite">
              <div className="replay-heading">
                <strong>{t.replay.title}</strong>
                <span className={`replay-stage-label stage-${replayFrame?.stage ?? "initial"}`}>
                  {replayFrame?.stage === "charge"
                    ? (lang === "zh" ? "冲锋阶段" : "Charge")
                    : replayFrame?.stage === "marked"
                      ? (lang === "zh" ? "判定阶段" : "Check")
                      : replayFrame?.stage === "removed"
                        ? (lang === "zh" ? "崩塌阶段" : "Collapse")
                        : replayFrame?.stage === "complete"
                          ? (lang === "zh" ? "清算完成" : "Complete")
                          : (lang === "zh" ? "初始阵型" : "Formation")}
                  <small>{t.replay.step((replayIndex ?? 0) + 1, settlementFrames.length)}</small>
                </span>
                <button className="replay-close" aria-label={t.actions.exitReplay} onClick={exitReplay}>×</button>
              </div>
              <div className="replay-actions">
                <div className="replay-step-actions">
                  <button
                    className="secondary-button replay-previous"
                    aria-label={t.actions.previousStep}
                    title={t.actions.previousStep}
                    disabled={replayIndex === 0 || replayTransitioning}
                    onClick={() => stepReplay(-1)}
                  >
                    <span aria-hidden="true">◀</span>
                  </button>
                  <button
                    className="secondary-button replay-next"
                    aria-label={t.actions.nextStep}
                    title={t.actions.nextStep}
                    disabled={replayAtEnd || replayTransitioning}
                    onClick={() => stepReplay(1)}
                  >
                    <span aria-hidden="true">▶</span>
                  </button>
                </div>
                <div className="replay-jump-actions">
                  <button
                    className="secondary-button replay-first"
                    aria-label={t.actions.firstStep}
                    title={t.actions.firstStep}
                    disabled={replayIndex === 0 || replayTransitioning}
                    onClick={() => jumpReplay(0)}
                  >
                    <span aria-hidden="true">|◀</span>
                  </button>
                  <button
                    className="secondary-button replay-last"
                    aria-label={t.actions.lastStep}
                    title={t.actions.lastStep}
                    disabled={replayAtEnd || replayTransitioning}
                    onClick={() => jumpReplay(settlementFrames.length - 1)}
                  >
                    <span aria-hidden="true">▶|</span>
                  </button>
                </div>
                <button
                  className="primary-button replay-play"
                  aria-label={replayIsPlaying ? t.actions.pauseReplay : t.actions.playReplay}
                  title={replayIsPlaying ? t.actions.pauseReplay : t.actions.playReplay}
                  disabled={replayTransitioning}
                  onClick={toggleReplayPlayback}
                >
                  <span aria-hidden="true">{replayIsPlaying ? "Ⅱ" : "▶"}</span>
                  <span>{replayIsPlaying ? t.actions.pauseReplay : t.actions.playReplay}</span>
                </button>
              </div>
            </section>
          )}
        </div>

        <aside className={`player-panel blue-panel ${humanPlayer === "blue" ? "human-panel" : ""} ${currentPlayer === "blue" ? "active" : ""}`}>
          <div className="player-heading">
            <span className="player-dot" />
            <div>
              <span>
                {lang === "zh" ? "后手" : "Second"}
                {humanPlayer === "blue" && ` · ${t.firstChoices.human}`}
              </span>
              <h2>
                {t.players.blue} {aiPlayer === "blue" && <em>AI</em>}
              </h2>
            </div>
            <strong>{blueAlive}</strong>
          </div>
          {phase === "placement" && !puzzleActive && !musketTestMode && (ruleset === "classic" || humanPlayer === "blue") && <PlayerHand
            player="blue"
            currentPlayer={currentPlayer}
            inventory={inventory.blue}
            selectedType={selectedType}
            phase={phase}
            isComputer={aiPlayer === "blue"}
            pieceDisplay={pieceDisplay}
            lang={lang}
            copy={t}
            onChoose={chooseType}
            onDragStart={beginPlacementDrag}
          />}
        </aside>
      </section>

      {placementDrag?.active && (
        <div
          className={`mobile-drag-ghost ${placementDrag.valid ? "valid" : "invalid"}`}
          style={{ left: placementDrag.x, top: placementDrag.y }}
          aria-hidden="true"
        >
          <span className={`mini-piece ${placementDrag.player}`}>
            <PieceFace type={placementDrag.type} display={pieceDisplay} lang={lang} />
          </span>
        </div>
      )}

      <section className="info-strip">
        <div className="info-card inspect-card">
          <p className="eyebrow">{inspected ? t.inspect.titlePiece : activeInspectedCell ? t.inspect.titleCell : t.inspect.titleRule}</p>
          {inspected ? (
            <>
              <div className="inspect-title">
                <span className={`mini-piece ${inspected.player}`}>
                  <PieceFace type={inspected.type} display={pieceDisplay} lang={lang} direction={inspected.direction} />
                </span>
                <div>
                  <h3>
                    {t.players[inspected.player]} · {t.pieces[inspected.type].name}
                  </h3>
                  <p>{t.pieces[inspected.type].desc}</p>
                </div>
              </div>
              {inspectionView === "incoming" ? (
                <div className="stat-row">
                  <span>{t.inspect.attacked} <strong>{stats.get(inspected.id)?.attacks ?? 0}</strong></span>
                  <span>{t.inspect.supported} <strong>{stats.get(inspected.id)?.supports ?? 0}</strong></span>
                  <span>{t.inspect.survival} <strong className={`stat-survival ${((stats.get(inspected.id)?.survival ?? 0) < 0) ? "dying" : ((stats.get(inspected.id)?.survival ?? 0) > 0) ? "living" : "neutral"}`}>{stats.get(inspected.id)?.survival ?? 0}</strong></span>
                </div>
              ) : (
                <div className="stat-row">
                  <span>{t.inspect.attacking} <strong>{activeInspectionRelations?.attackers.length ?? 0}</strong></span>
                  <span>{t.inspect.supporting} <strong>{activeInspectionRelations?.supporters.length ?? 0}</strong></span>
                </div>
              )}
            </>
          ) : activeInspectedCell ? (
            <div className="stat-row tile-influence-stats">
              <span>{t.inspect.redSources} <strong>{inspectedCellSources.filter((piece) => piece.player === "red").length}</strong></span>
              <span>{t.inspect.blueSources} <strong>{inspectedCellSources.filter((piece) => piece.player === "blue").length}</strong></span>
              <span>{t.inspect.netInfluence} <strong>{Math.abs(inspectedCellSources.filter((piece) => piece.player === "red").length - inspectedCellSources.filter((piece) => piece.player === "blue").length)}</strong></span>
            </div>
          ) : (
            <p className="rule-copy">
              {t.inspect.ruleDesc}
            </p>
          )}
        </div>

      </section>
        </>
      )}

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
              <select
                className="settings-select"
                value={lang}
                aria-label={t.settingsModal.language}
                onChange={(event) => setLang(event.target.value as Language)}
              >
                <option value="en">English</option>
                <option value="zh">简体中文</option>
              </select>
            </div>

            <div className="setting-row">
              <span>{t.settingsModal.firstPlayer}</span>
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
            </div>

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
          {puzzleActive ? (
          <section
            className={`result-card ${puzzleSuccess ? "blue" : "red"}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="result-title"
          >
            <p className="result-kicker">{lang === "zh" ? `谜题 ${activePuzzle!.number}` : `Puzzle ${activePuzzle!.number}`}</p>
            <div className="result-emblem">{puzzleSuccess ? (lang === "zh" ? "解" : "SOLVED") : "×"}</div>
            <h2 id="result-title">{puzzleSuccess ? (lang === "zh" ? "谜题完成" : "Puzzle Complete") : (lang === "zh" ? "还没有解开" : "Not Solved Yet")}</h2>
            <p className="result-reason">{puzzleSuccess ? (lang === "zh" ? "敌方棋子已全部消灭。" : "Every enemy piece was eliminated.") : (lang === "zh" ? "仍有敌方棋子存活。" : "At least one enemy piece survived.")}</p>
            <div className="result-actions">
              {settlementFrames.length > 0 && <button className="secondary-button result-replay-button" onClick={openReplay}>{t.actions.replay}</button>}
              <button className="secondary-button" onClick={reset}>{lang === "zh" ? "再试一次" : "Try Again"}</button>
              {puzzleSuccess && activePuzzleIndex !== null && activePuzzleIndex < PUZZLE_LEVELS.length - 1
                ? <button className="primary-button" onClick={() => loadPuzzleLevel(activePuzzleIndex + 1)}>{lang === "zh" ? "下一关" : "Next"}</button>
                : <button className="primary-button" onClick={() => {
                    if (generatedPuzzle) {
                      setGeneratedPuzzle(null);
                      setScreen("generator");
                      setShowResult(false);
                      setReplayIndex(null);
                      setPhase("placement");
                    } else {
                      setActivePuzzleIndex(null);
                    }
                  }}>{generatedPuzzle ? (lang === "zh" ? "生成关卡" : "Generator") : (lang === "zh" ? "关卡" : "Levels")}</button>}
            </div>
          </section>
          ) : (
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
                  {humanPlayer === "red" ? t.firstChoices.human : "AI"}
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
                  {humanPlayer === "blue" ? t.firstChoices.human : "AI"}
                </small>
              </div>
            </div>

            <div className="result-actions">
              {settlementFrames.length > 0 && (
                <button className="secondary-button result-replay-button" onClick={openReplay}>
                  {t.actions.replay}
                </button>
              )}
              <button className="primary-button result-rematch-button" onClick={reset}>
                {t.actions.rematch}
              </button>
            </div>
          </section>
          )}
        </div>
      )}
    </main>
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
  const pieceRules: PieceType[] = [
    "guard", "scout", "archer", "cannon", "knight", "fortress",
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
          {pieceRules.map((type) => (
            <article key={type}>
              <div className="rulebook-piece-icon">
                <RangeIcon type={type} />
              </div>
              <div>
                <strong>
                  {t.pieces[type].name}
                  <small>×{PIECE_CONFIG[type].count}</small>
                </strong>
                  <p>{t.pieces[type].desc}</p>
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
