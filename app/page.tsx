"use client";

import { useEffect, useMemo, useState } from "react";

const BOARD_SIZE = 7;
const PLAYER_NAMES = { red: "赤方", blue: "青方" } as const;
const PLAYER_ORDER = ["blue", "red"] as const;

type Player = (typeof PLAYER_ORDER)[number];
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
type FirstChoice = Player | "random";
type PieceDisplay = "mark" | "range";

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
  danger: number;
};

const PIECES: Record<
  PieceType,
  {
    name: string;
    mark: string;
    count: number;
    description: string;
    offsets: readonly (readonly [number, number])[];
  }
> = {
  scout: {
    name: "斥候",
    mark: "斥",
    count: 3,
    description: "四个斜角相邻格",
    offsets: [
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1],
    ],
  },
  guard: {
    name: "卫士",
    mark: "卫",
    count: 3,
    description: "上下左右相邻格",
    offsets: [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ],
  },
  archer: {
    name: "射手",
    mark: "射",
    count: 1,
    description: "上下左右正好两格",
    offsets: [
      [-2, 0],
      [2, 0],
      [0, -2],
      [0, 2],
    ],
  },
  cannon: {
    name: "炮台",
    mark: "炮",
    count: 1,
    description: "隔一枚棋子控制其后直线",
    offsets: [
      [-2, 0],
      [2, 0],
      [0, -2],
      [0, 2],
    ],
  },
  knight: {
    name: "骑士",
    mark: "骑",
    count: 1,
    description: "马步八个落点",
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
    name: "堡垒",
    mark: "堡",
    count: 1,
    description: "周围八个相邻格",
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

const PIECE_TYPES = Object.keys(PIECES) as PieceType[];
const PIECES_PER_PLAYER = PIECE_TYPES.reduce(
  (sum, type) => sum + PIECES[type].count,
  0,
);

function withinBoard(row: number, col: number) {
  return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;
}

function cellKey(row: number, col: number) {
  return `${row}-${col}`;
}

function getControlledCells(piece: Piece, pieces: Piece[]) {
  if (piece.type !== "cannon") {
    return PIECES[piece.type].offsets
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
      danger: attacks - supports,
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
    const exposed = Math.max(0, pieceStats.danger);
    if (piece.player === "red") {
      score -= exposed * weights.safety;
      score += pieceStats.supports * weights.support;
      score += Math.max(0, -pieceStats.danger) * 0.32;
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

function chooseAiMove(
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
          score: evaluateForRed(imagined, style),
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
          strongestBlueReply = Math.min(
            strongestBlueReply,
            evaluateForRed([...afterRed, blueReply], style),
          );
        }
      }
    }

    const lookAhead = hasBlueReply ? strongestBlueReply : candidate.score;
    const combinedScore = candidate.score * 0.32 + lookAhead * 0.68;
    if (combinedScore > bestScore) {
      bestScore = combinedScore;
      best = candidate;
    }
  }

  return best;
}

const STRATEGY_STYLES: StrategyStyle[] = [
  "balanced",
  "aggressive",
  "defensive",
  "territorial",
];

const STRATEGY_LABELS: Record<StrategyStyle, string> = {
  balanced: "均衡",
  aggressive: "猛攻",
  defensive: "结阵",
  territorial: "控场",
};

function pickRandomStrategy(): StrategyStyle {
  return STRATEGY_STYLES[
    Math.floor(Math.random() * STRATEGY_STYLES.length)
  ];
}

function resolveFirstPlayer(choice: FirstChoice): Player {
  if (choice !== "random") return choice;
  return Math.random() < 0.5 ? "blue" : "red";
}

export default function Home() {
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [firstChoice, setFirstChoice] = useState<FirstChoice>("blue");
  const [firstPlayer, setFirstPlayer] = useState<Player>("blue");
  const [currentPlayer, setCurrentPlayer] = useState<Player>("blue");
  const [selectedType, setSelectedType] = useState<PieceType>("scout");
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
  const [aiStyle, setAiStyle] = useState<AiStyle>("balanced");
  const [activeAiStyle, setActiveAiStyle] =
    useState<StrategyStyle>("balanced");
  const [showResult, setShowResult] = useState(false);
  const [pieceDisplay, setPieceDisplay] = useState<PieceDisplay>("mark");
  const [showSettings, setShowSettings] = useState(false);

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
        counts[player][type] = PIECES[type].count - used;
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
      ? "存活棋子更多"
      : controlled.red !== controlled.blue
        ? "棋子数相同，以控制格数决胜"
        : "棋子数与控制格数完全相同";
  const opponentPlayer: Player =
    mode === "ai"
      ? "red"
      : currentPlayer === "blue"
        ? "red"
        : "blue";

  useEffect(() => {
    if (
      mode !== "ai" ||
      phase !== "placement" ||
      currentPlayer !== "red"
    ) {
      setAiThinking(false);
      return;
    }

    setAiThinking(true);
    const timer = window.setTimeout(() => {
      const move = chooseAiMove(
        pieces,
        inventory.red,
        inventory.blue,
        activeAiStyle,
      );
      if (!move) {
        setAiThinking(false);
        return;
      }

      const placed: Piece = {
        id: Date.now() + pieces.length,
        player: "red",
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
        setCurrentPlayer("blue");
        if (inventory.blue[selectedType] <= 0) {
          const available = PIECE_TYPES.find(
            (type) => inventory.blue[type] > 0,
          );
          if (available) setSelectedType(available);
        }
      }
    }, 520);

    return () => window.clearTimeout(timer);
  }, [
    currentPlayer,
    activeAiStyle,
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
        setHistory((current) => [
          `第 ${round} 轮：危险值最高的 ${removed
            .map((piece) => `${PLAYER_NAMES[piece.player]}${PIECES[piece.type].name}`)
            .join("、")} 被移除`,
          ...current,
        ]);
        setInspectedId(null);
        setPendingIds([]);
      }, 850);
      return () => window.clearTimeout(timer);
    }

    const liveStats = getStats(pieces);
    const maxDanger = Math.max(
      0,
      ...pieces.map((piece) => liveStats.get(piece.id)?.danger ?? 0),
    );

    if (maxDanger <= 0) {
      setPhase("finished");
      setShowResult(true);
      setHistory((current) => ["清算结束：场上已没有危险值大于 0 的棋子", ...current]);
      return;
    }

    const nextPending = pieces
      .filter((piece) => liveStats.get(piece.id)?.danger === maxDanger)
      .map((piece) => piece.id);
    setRound((current) => current + 1);
    setPendingIds(nextPending);
  }, [pendingIds, phase, pieces, round]);

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
      (mode === "ai" && currentPlayer === "red") ||
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
    const steps = mode === "ai" && pieces.length >= 2 ? 2 : 1;
    const nextPieces = pieces.slice(0, -steps);
    const last = pieces[nextPieces.length];
    if (!last) return;
    setPieces(nextPieces);
    setCurrentPlayer(mode === "ai" ? "blue" : last.player);
    if (mode === "local" || last.player === "blue") setSelectedType(last.type);
    setInspectedId(null);
    setPhase("placement");
  }

  function resetTo(startingPlayer: Player) {
    if (aiStyle === "random") {
      setActiveAiStyle(pickRandomStrategy());
    }
    setPieces([]);
    setCurrentPlayer(startingPlayer);
    setSelectedType("scout");
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
    const nextFirst = resolveFirstPlayer(firstChoice);
    setFirstPlayer(nextFirst);
    resetTo(nextFirst);
  }

  function changeMode(nextMode: GameMode) {
    setMode(nextMode);
    const nextFirst = resolveFirstPlayer(firstChoice);
    setFirstPlayer(nextFirst);
    resetTo(nextFirst);
  }

  function changeFirstPlayer(nextChoice: FirstChoice) {
    const nextPlayer = resolveFirstPlayer(nextChoice);
    setFirstChoice(nextChoice);
    setFirstPlayer(nextPlayer);
    resetTo(nextPlayer);
  }

  function changeAiStyle(nextStyle: AiStyle) {
    setAiStyle(nextStyle);
    setActiveAiStyle(
      nextStyle === "random" ? pickRandomStrategy() : nextStyle,
    );
  }

  function startSettlement() {
    setInspectedId(null);
    setHistory(["开始清算：每轮同时移除危险值最高的棋子"]);
    setRound(0);
    setShowResult(false);
    setPhase("settling");
  }

  const title =
    phase === "placement"
      ? aiThinking
        ? "赤方 AI 正在推演"
        : `${PLAYER_NAMES[currentPlayer]}布阵`
      : phase === "ready"
        ? "布阵完成"
        : phase === "settling"
          ? `正在清算 · 第 ${Math.max(round, 1)} 轮`
          : winner
            ? `${PLAYER_NAMES[winner]}获胜`
            : "本局平局";

  const subtitle =
    phase === "placement"
      ? `选择一枚棋子，再放入空格 · 已放 ${pieces.length}/${PIECES_PER_PLAYER * 2}`
      : phase === "ready"
        ? "可以检查棋子的攻防状态，然后开始连锁清算"
        : phase === "settling"
          ? "高亮棋子即将同时离场"
          : `棋子 赤 ${redAlive} : ${blueAlive} 青 · 控制 赤 ${controlled.red} : ${controlled.blue} 青`;

  return (
    <main className={`game-shell theme-${colorTheme} mode-${mode}`}>
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">衡</span>
          <div>
            <p>静态布阵棋</p>
            <h1>阵衡</h1>
          </div>
        </div>
        <div className="turn-copy" aria-live="polite">
          <strong>{title}</strong>
          <span>{subtitle}</span>
        </div>
        <div className="header-actions">
          <button
            className="quiet-button settings-button"
            onClick={() => setShowSettings(true)}
          >
            设置
          </button>
          <button className="quiet-button" onClick={reset}>
            重新开始
          </button>
        </div>
      </header>

      <section className="game-layout">
        <aside className={`player-panel red-panel ${currentPlayer === "red" && phase === "placement" ? "active" : ""}`}>
          <div className="player-heading">
            <span className="player-dot" />
            <div>
              <span>{firstPlayer === "red" ? "先手" : "后手"}</span>
              <h2>赤方 {mode === "ai" && <em>AI</em>}</h2>
            </div>
            <strong>{redAlive}</strong>
          </div>
          <Inventory
            player="red"
            currentPlayer={currentPlayer}
            inventory={inventory.red}
            selectedType={selectedType}
            phase={phase}
            isComputer={mode === "ai"}
            pieceDisplay={pieceDisplay}
            onChoose={chooseType}
          />
        </aside>

        <div className="board-column">
          <div className={`mobile-opponent-summary ${opponentPlayer}`}>
            <strong>{PLAYER_NAMES[opponentPlayer]}剩余</strong>
            {PIECE_TYPES.map((type) => (
              <span key={type}>
                <i>{PIECES[type].mark}</i>
                {inventory[opponentPlayer][type]}
              </span>
            ))}
          </div>
          <div className={`board-frame ${phase === "settling" ? "is-settling" : ""}`}>
            <div className="board" role="grid" aria-label="七乘七阵衡棋盘">
              {Array.from({ length: BOARD_SIZE * BOARD_SIZE }, (_, index) => {
                const row = Math.floor(index / BOARD_SIZE);
                const col = index % BOARD_SIZE;
                const piece = boardPieces.get(cellKey(row, col));
                const pieceStats = piece ? stats.get(piece.id) : null;
                const cellInfluence = influence.get(cellKey(row, col));
                const zoneClass =
                  !cellInfluence ||
                  (cellInfluence.red === 0 && cellInfluence.blue === 0)
                    ? ""
                    : cellInfluence.red === cellInfluence.blue
                      ? "zone-balanced"
                      : cellInfluence.red > cellInfluence.blue
                        ? "zone-danger"
                        : "zone-support";
                const zoneSymbol =
                  zoneClass === "zone-danger"
                    ? "!"
                    : zoneClass === "zone-support"
                      ? "+"
                      : zoneClass === "zone-balanced"
                        ? "="
                        : "";
                const isPending = piece ? pendingIds.includes(piece.id) : false;
                const isInspected = piece?.id === inspectedId;
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
                        ? `${PLAYER_NAMES[piece.player]}${PIECES[piece.type].name}，攻击 ${pieceStats?.attacks ?? 0}，支援 ${pieceStats?.supports ?? 0}`
                        : `第 ${row + 1} 行第 ${col + 1} 列，空格`
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
                        {pieceDisplay === "mark" ? (
                          <span className="piece-mark">
                            {PIECES[piece.type].mark}
                          </span>
                        ) : (
                          <RangeIcon type={piece.type} />
                        )}
                        {pieceStats && (
                          <span
                            className={`danger-badge ${pieceStats.danger > 0 ? "unsafe" : "safe"}`}
                            title={`危险值 ${pieceStats.danger}`}
                          >
                            {pieceStats.danger > 0 ? `+${pieceStats.danger}` : pieceStats.danger}
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
              撤回一步
            </button>
            {phase === "ready" && (
              <button className="primary-button" onClick={startSettlement}>
                开始清算
              </button>
            )}
            {phase === "finished" && (
              <button
                className="primary-button"
                onClick={() => setShowResult(true)}
              >
                查看胜负
              </button>
            )}
            <div className="range-legend">
              <span><i className="legend-square danger">!</i>敌方威胁</span>
              <span><i className="legend-square support">+</i>己方支援</span>
              <span><i className="legend-square balanced">=</i>势均力敌</span>
            </div>
          </div>
          <p className="tap-hint">
            轻点空格预览范围，再点同一格确认放置
          </p>
        </div>

        <aside className={`player-panel blue-panel ${currentPlayer === "blue" && phase === "placement" ? "active" : ""}`}>
          <div className="player-heading">
            <span className="player-dot" />
            <div>
              <span>
                {firstPlayer === "blue" ? "先手" : "后手"}
                {mode === "ai" && " · 你"}
              </span>
              <h2>青方</h2>
            </div>
            <strong>{blueAlive}</strong>
          </div>
          <Inventory
            player="blue"
            currentPlayer={currentPlayer}
            inventory={inventory.blue}
            selectedType={selectedType}
            phase={phase}
            isComputer={false}
            pieceDisplay={pieceDisplay}
            onChoose={chooseType}
          />
        </aside>
      </section>

      <section className="info-strip">
        <div className="info-card inspect-card">
          <p className="eyebrow">{inspected ? "棋子状态" : "结算规则"}</p>
          {inspected ? (
            <>
              <div className="inspect-title">
                <span className={`mini-piece ${inspected.player}`}>
                  {pieceDisplay === "mark" ? (
                    PIECES[inspected.type].mark
                  ) : (
                    <RangeIcon type={inspected.type} />
                  )}
                </span>
                <div>
                  <h3>
                    {PLAYER_NAMES[inspected.player]} · {PIECES[inspected.type].name}
                  </h3>
                  <p>{PIECES[inspected.type].description}</p>
                </div>
              </div>
              <div className="stat-row">
                <span>被攻击 <strong>{stats.get(inspected.id)?.attacks ?? 0}</strong></span>
                <span>受支援 <strong>{stats.get(inspected.id)?.supports ?? 0}</strong></span>
                <span>危险值 <strong>{stats.get(inspected.id)?.danger ?? 0}</strong></span>
              </div>
            </>
          ) : (
            <p className="rule-copy">
              危险值 = 被攻击 − 受支援。每轮移除全场危险值最高且大于 0
              的棋子，然后重新计算，直到阵形稳定。
            </p>
          )}
        </div>

        <div className="info-card log-card" aria-live="polite">
          <p className="eyebrow">战局记录</p>
          {history.length ? (
            <ol>
              {history.slice(0, 3).map((entry, index) => (
                <li key={`${entry}-${index}`}>{entry}</li>
              ))}
            </ol>
          ) : (
            <p className="rule-copy">
              双方各有 10 枚棋子。点击场上棋子，可以查看它当前受到的攻击与支援。
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
                <p>对局偏好</p>
                <h2 id="settings-title">设置</h2>
              </div>
              <button
                className="settings-close"
                onClick={() => setShowSettings(false)}
                aria-label="关闭设置"
              >
                ×
              </button>
            </div>

            <div className="setting-row">
              <span>对战模式</span>
              <div className="mode-switch">
                <button
                  className={mode === "ai" ? "selected" : ""}
                  onClick={() => changeMode("ai")}
                >
                  对战 AI
                </button>
                <button
                  className={mode === "local" ? "selected" : ""}
                  onClick={() => changeMode("local")}
                >
                  双人
                </button>
              </div>
            </div>

            <div className="setting-row">
              <span>先手</span>
              <div className="mode-switch first-switch">
                <button
                  className={firstChoice === "blue" ? "selected" : ""}
                  onClick={() => changeFirstPlayer("blue")}
                >
                  {mode === "ai" ? "我" : "青方"}
                </button>
                <button
                  className={firstChoice === "red" ? "selected" : ""}
                  onClick={() => changeFirstPlayer("red")}
                >
                  {mode === "ai" ? "AI" : "赤方"}
                </button>
                <button
                  className={firstChoice === "random" ? "selected" : ""}
                  onClick={() => changeFirstPlayer("random")}
                >
                  随机
                </button>
              </div>
            </div>

            {mode === "ai" && (
              <div className="setting-row">
                <span>
                  AI 风格
                  {aiStyle === "random" &&
                    `（本局${STRATEGY_LABELS[activeAiStyle]}）`}
                </span>
                <select
                  className="settings-select"
                  value={aiStyle}
                  onChange={(event) =>
                    changeAiStyle(event.target.value as AiStyle)
                  }
                >
                  <option value="balanced">均衡</option>
                  <option value="aggressive">猛攻</option>
                  <option value="defensive">结阵</option>
                  <option value="territorial">控场</option>
                  <option value="random">随机</option>
                </select>
              </div>
            )}

            <div className="setting-row">
              <span>势力配色</span>
              <div className="setting-options">
                {([
                  ["standard", "标准"],
                  ["vivid", "鲜亮"],
                  ["accessible", "辨色辅助"],
                ] as const).map(([theme, label]) => (
                  <button
                    key={theme}
                    className={colorTheme === theme ? "selected" : ""}
                    onClick={() => setColorTheme(theme)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="setting-row">
              <span>棋子显示</span>
              <div className="setting-options">
                <button
                  className={pieceDisplay === "mark" ? "selected" : ""}
                  onClick={() => setPieceDisplay("mark")}
                >
                  文字
                </button>
                <button
                  className={pieceDisplay === "range" ? "selected" : ""}
                  onClick={() => setPieceDisplay("range")}
                >
                  范围图
                </button>
              </div>
            </div>

            <button
              className="primary-button settings-done"
              onClick={() => setShowSettings(false)}
            >
              完成
            </button>
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
            <p className="result-kicker">最终结算</p>
            <div className="result-emblem">{winner ? "胜" : "和"}</div>
            <h2 id="result-title">
              {winner ? `${PLAYER_NAMES[winner]}获胜` : "本局平局"}
            </h2>
            <p className="result-reason">{winReason}</p>

            <div className="result-scoreboard">
              <div>
                <span className="score-dot red" />
                <strong>赤方</strong>
                <small>AI</small>
              </div>
              <div className="score-category">
                <span>存活棋子</span>
                <strong>
                  {redAlive}<i>:</i>{blueAlive}
                </strong>
              </div>
              <div className="score-category">
                <span>控制格数</span>
                <strong>
                  {controlled.red}<i>:</i>{controlled.blue}
                </strong>
              </div>
              <div>
                <span className="score-dot blue" />
                <strong>青方</strong>
                <small>你</small>
              </div>
            </div>

            <div className="result-actions">
              <button
                className="secondary-button"
                onClick={() => setShowResult(false)}
              >
                查看棋盘
              </button>
              <button className="primary-button" onClick={reset}>
                再来一局
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
    PIECES[type].offsets.map(([row, col]) => cellKey(row + 2, col + 2)),
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

function Inventory({
  player,
  currentPlayer,
  inventory,
  selectedType,
  phase,
  isComputer,
  pieceDisplay,
  onChoose,
}: {
  player: Player;
  currentPlayer: Player;
  inventory: Record<PieceType, number>;
  selectedType: PieceType;
  phase: Phase;
  isComputer: boolean;
  pieceDisplay: PieceDisplay;
  onChoose: (type: PieceType) => void;
}) {
  return (
    <div className="inventory">
      {PIECE_TYPES.map((type) => {
        const definition = PIECES[type];
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
            aria-label={`${PLAYER_NAMES[player]}选择${definition.name}，剩余 ${inventory[type]} 枚`}
          >
            <span className={`mini-piece ${player}`}>
              {pieceDisplay === "mark" ? (
                definition.mark
              ) : (
                <RangeIcon type={type} />
              )}
            </span>
            <span className="piece-copy">
              <strong>{definition.name}</strong>
              <small>{definition.description}</small>
            </span>
            <span className="piece-count">×{inventory[type]}</span>
          </button>
        );
      })}
    </div>
  );
}
