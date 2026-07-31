"use client";

import { useEffect, useMemo, useState } from "react";

const BOARD_SIZE = 7;
const PLAYER_NAMES = { red: "赤方", blue: "青方" } as const;
const PLAYER_ORDER = ["blue", "red"] as const;

type Player = (typeof PLAYER_ORDER)[number];
type PieceType = "scout" | "guard" | "archer" | "knight" | "fortress";
type Phase = "placement" | "ready" | "settling" | "finished";
type GameMode = "ai" | "local";

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
    count: 2,
    description: "上下左右正好两格",
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

function getStats(pieces: Piece[]) {
  const result = new Map<number, PieceStats>();

  for (const target of pieces) {
    let attacks = 0;
    let supports = 0;

    for (const source of pieces) {
      if (source.id === target.id) continue;
      const reachesTarget = PIECES[source.type].offsets.some(
        ([dr, dc]) =>
          source.row + dr === target.row && source.col + dc === target.col,
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

function evaluateForRed(pieces: Piece[]) {
  const stats = getStats(pieces);
  let score = 0;

  for (const piece of pieces) {
    const pieceStats = stats.get(piece.id);
    if (!pieceStats) continue;
    const pressure =
      pieceStats.danger > 0 ? pieceStats.danger * 3.4 : pieceStats.danger;
    const formation = pieceStats.supports * 0.55 + pieceStats.attacks * 0.7;
    score +=
      piece.player === "red"
        ? -pressure + formation
        : pressure - formation;
  }

  const center = (BOARD_SIZE - 1) / 2;
  for (const piece of pieces) {
    const centrality =
      BOARD_SIZE -
      (Math.abs(piece.row - center) + Math.abs(piece.col - center));
    score += (piece.player === "red" ? 1 : -1) * centrality * 0.035;
  }

  return score;
}

function chooseAiMove(
  pieces: Piece[],
  redInventory: Record<PieceType, number>,
  blueInventory: Record<PieceType, number>,
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
          score: evaluateForRed(imagined),
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
            evaluateForRed([...afterRed, blueReply]),
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

export default function Home() {
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [currentPlayer, setCurrentPlayer] = useState<Player>("blue");
  const [selectedType, setSelectedType] = useState<PieceType>("scout");
  const [phase, setPhase] = useState<Phase>("placement");
  const [hoverCell, setHoverCell] = useState<[number, number] | null>(null);
  const [inspectedId, setInspectedId] = useState<number | null>(null);
  const [pendingIds, setPendingIds] = useState<number[]>([]);
  const [round, setRound] = useState(0);
  const [history, setHistory] = useState<string[]>([]);
  const [mode, setMode] = useState<GameMode>("ai");
  const [aiThinking, setAiThinking] = useState(false);

  const stats = useMemo(() => getStats(pieces), [pieces]);
  const boardPieces = useMemo(
    () => new Map(pieces.map((piece) => [cellKey(piece.row, piece.col), piece])),
    [pieces],
  );
  const influence = useMemo(() => {
    const cells = new Map<string, { red: number; blue: number }>();
    for (let row = 0; row < BOARD_SIZE; row += 1) {
      for (let col = 0; col < BOARD_SIZE; col += 1) {
        cells.set(cellKey(row, col), { red: 0, blue: 0 });
      }
    }
    for (const piece of pieces) {
      for (const [dr, dc] of PIECES[piece.type].offsets) {
        const row = piece.row + dr;
        const col = piece.col + dc;
        if (!withinBoard(row, col)) continue;
        const value = cells.get(cellKey(row, col));
        if (value) value[piece.player] += 1;
      }
    }
    return cells;
  }, [pieces]);

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
    if (phase !== "placement" || !hoverCell) return cells;
    const [row, col] = hoverCell;
    for (const [dr, dc] of PIECES[selectedType].offsets) {
      const nextRow = row + dr;
      const nextCol = col + dc;
      if (withinBoard(nextRow, nextCol)) {
        cells.add(cellKey(nextRow, nextCol));
      }
    }
    return cells;
  }, [hoverCell, phase, selectedType]);

  const inspected = pieces.find((piece) => piece.id === inspectedId) ?? null;
  const redAlive = pieces.filter((piece) => piece.player === "red").length;
  const blueAlive = pieces.filter((piece) => piece.player === "blue").length;

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
      const move = chooseAiMove(pieces, inventory.red, inventory.blue);
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
  }

  function placePiece(row: number, col: number) {
    const existing = boardPieces.get(cellKey(row, col));
    if (existing) {
      setInspectedId(existing.id);
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

  function reset() {
    setPieces([]);
    setCurrentPlayer("blue");
    setSelectedType("scout");
    setPhase("placement");
    setHoverCell(null);
    setInspectedId(null);
    setPendingIds([]);
    setRound(0);
    setHistory([]);
    setAiThinking(false);
  }

  function changeMode(nextMode: GameMode) {
    setMode(nextMode);
    reset();
  }

  function startSettlement() {
    setInspectedId(null);
    setHistory(["开始清算：每轮同时移除危险值最高的棋子"]);
    setRound(0);
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
          : redAlive === blueAlive
            ? "本局平衡"
            : `${redAlive > blueAlive ? "赤方" : "青方"}获胜`;

  const subtitle =
    phase === "placement"
      ? `选择一枚棋子，再放入空格 · 已放 ${pieces.length}/${PIECES_PER_PLAYER * 2}`
      : phase === "ready"
        ? "可以检查棋子的攻防状态，然后开始连锁清算"
        : phase === "settling"
          ? "高亮棋子即将同时离场"
          : `赤方剩余 ${redAlive} 枚 · 青方剩余 ${blueAlive} 枚`;

  return (
    <main className="game-shell">
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
          <div className="mode-switch" aria-label="对战模式">
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
              <span>后手</span>
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
            onChoose={chooseType}
          />
        </aside>

        <div className="board-column">
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
                const isPending = piece ? pendingIds.includes(piece.id) : false;
                const isInspected = piece?.id === inspectedId;
                return (
                  <button
                    className={[
                      "cell",
                      highlighted.has(cellKey(row, col)) ? "in-range" : "",
                      zoneClass,
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
                    onClick={() => placePiece(row, col)}
                  >
                    {piece && (
                      <span
                        className={`piece ${piece.player} ${isPending ? "pending" : ""}`}
                      >
                        <span className="piece-mark">{PIECES[piece.type].mark}</span>
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
            {phase === "placement" && (
              <div className="range-legend">
                <span><i className="legend-square danger" />敌方威胁</span>
                <span><i className="legend-square support" />己方支援</span>
                <span><i className="legend-square balanced" />势均力敌</span>
              </div>
            )}
          </div>
        </div>

        <aside className={`player-panel blue-panel ${currentPlayer === "blue" && phase === "placement" ? "active" : ""}`}>
          <div className="player-heading">
            <span className="player-dot" />
            <div>
              <span>先手 · 你</span>
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
                  {PIECES[inspected.type].mark}
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
    </main>
  );
}

function Inventory({
  player,
  currentPlayer,
  inventory,
  selectedType,
  phase,
  isComputer,
  onChoose,
}: {
  player: Player;
  currentPlayer: Player;
  inventory: Record<PieceType, number>;
  selectedType: PieceType;
  phase: Phase;
  isComputer: boolean;
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
            <span className={`mini-piece ${player}`}>{definition.mark}</span>
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
