"use client";

import { useEffect, useRef, useState } from "react";
import { PieceFace } from "../game/PieceVisuals";
import type { Language } from "../game/PieceVisuals";
import { BOARD_SIZE, cellKey, findObstacleInDirection } from "../../lib/game/board";
import { FORMATION_THEMES, generatePuzzleCandidates, solveCustomFormation, validateCustomSolution } from "../../lib/game/puzzleGenerator";
import type { CustomSolutionValidation, FormationThemeId, GeneratedPlacement, GeneratedPuzzle } from "../../lib/game/puzzleGenerator";
import { PIECE_TYPES } from "../../lib/game/pieces";
import type { Direction, Piece, PieceType, TerrainCell } from "../../lib/game/types";

const DEFAULT_SEED = "COLLAPSE-GALLERY-V1";
const DEFAULT_COUNT = 3;
const BATCH_ATTEMPTS = 10;
const DEFAULT_CUSTOM_ATTEMPT_LIMIT = 24;
const SAVED_GALLERY_KEY = "battle-array:puzzle-gallery:v9";
const EDITOR_PIECE_TYPES = PIECE_TYPES;
const EDITOR_DIRECTIONS: readonly Direction[] = ["up", "right", "down", "left"];
const EDITOR_DIRECTIONAL = new Set<PieceType>(["musket", "shield", "halberd", "ram", "charger"]);
type EditorTool = PieceType | "obstacle" | "erase";
const MIXED_THEME_IDS: readonly FormationThemeId[] = [
  "freeform", "stockade", "freeform", "pass", "twin-towers",
  "freeform", "escort", "ranged-line", "freeform", "pocket",
];

type SavedGallery = {
  seed: string;
  count: number;
  minHandSize: number;
  maxHandSize: number;
  minRounds: number;
  theme: FormationThemeId | "mixed";
  puzzles: GeneratedPuzzle[];
};

function GeneratorBoard({ puzzle, showSolution = false }: { puzzle: GeneratedPuzzle; showSolution?: boolean }) {
  const solutionPieces: Piece[] = showSolution
    ? puzzle.generation.knownSolution.map((placement, index) => ({ ...placement, id: 900000 + index }))
    : [];
  const pieces: Piece[] = [...puzzle.pieces, ...solutionPieces];
  const byCell = new Map(pieces.map((piece) => [cellKey(piece.row, piece.col), piece]));
  const terrain = new Set(puzzle.terrain.map((cell) => cellKey(cell.row, cell.col)));
  const destroyedTerrain = new Set<string>();
  if (showSolution) {
    for (const placement of puzzle.generation.knownSolution) {
      if (placement.createdObstacle) {
        const key = cellKey(placement.createdObstacle.row, placement.createdObstacle.col);
        terrain.add(key);
        destroyedTerrain.delete(key);
      }
      const activeTerrain = [...terrain].map((key) => {
        const [row, col] = key.split("-").map(Number);
        return { row, col, type: "fence" as const };
      });
      const destroyed = placement.destroyedObstacle ??
        (placement.type === "ram" && placement.direction
          ? findObstacleInDirection(placement.row, placement.col, placement.direction, activeTerrain) ?? undefined
          : undefined);
      if (destroyed) {
        const key = cellKey(destroyed.row, destroyed.col);
        terrain.delete(key);
        destroyedTerrain.add(key);
      }
    }
  }

  return (
    <div className="generator-board" aria-label="初始局面">
      {Array.from({ length: BOARD_SIZE * BOARD_SIZE }, (_, index) => {
        const row = Math.floor(index / BOARD_SIZE);
        const col = index % BOARD_SIZE;
        const key = cellKey(row, col);
        const piece = byCell.get(key);
        return (
          <span className={`generator-cell ${(row + col) % 2 === 1 ? "dark" : ""} ${terrain.has(key) ? "obstacle" : ""} ${destroyedTerrain.has(key) ? "editor-destroyed-obstacle" : ""}`} key={key}>
            {terrain.has(key) && <b aria-label="Obstacle">▦</b>}
            {destroyedTerrain.has(key) && <b aria-label="Destroyed obstacle">✕</b>}
            {piece && <i className={`mini-piece ${piece.player}`}>
              <PieceFace type={piece.type} display="icon" lang="zh" direction={piece.direction} />
            </i>}
          </span>
        );
      })}
    </div>
  );
}

function FormationEditorBoard({ pieces, answerPieces, terrain, pendingId, onCell }: {
  pieces: Piece[];
  answerPieces: Piece[];
  terrain: TerrainCell[];
  pendingId: number | null;
  onCell: (row: number, col: number) => void;
}) {
  const allPieces = [...pieces, ...answerPieces];
  const answerIds = new Set(answerPieces.map((piece) => piece.id));
  const byCell = new Map(allPieces.map((piece) => [cellKey(piece.row, piece.col), piece]));
  const destroyedObstacles = new Set<string>();
  const obstacles = new Set(terrain.map((cell) => cellKey(cell.row, cell.col)));
  for (const piece of answerPieces) {
    if (piece.createdObstacle) {
      const key = cellKey(piece.createdObstacle.row, piece.createdObstacle.col);
      obstacles.add(key);
      destroyedObstacles.delete(key);
    }
    if (piece.type === "ram" && piece.direction) {
      const activeTerrain = [...obstacles].map((key) => {
        const [row, col] = key.split("-").map(Number);
        return { row, col, type: "fence" as const };
      });
      const obstacle = findObstacleInDirection(piece.row, piece.col, piece.direction, activeTerrain);
      if (obstacle) {
        const key = cellKey(obstacle.row, obstacle.col);
        obstacles.delete(key);
        destroyedObstacles.add(key);
      }
    }
  }
  const pending = allPieces.find((piece) => piece.id === pendingId);
  const selectedTargets = new Map((pending?.targets ?? []).map((target, index) => [cellKey(target[0], target[1]), index + 1]));
  return (
    <div className="generator-board formation-editor-board" aria-label="Enemy formation editor">
      {Array.from({ length: BOARD_SIZE * BOARD_SIZE }, (_, index) => {
        const row = Math.floor(index / BOARD_SIZE);
        const col = index % BOARD_SIZE;
        const key = cellKey(row, col);
        const piece = byCell.get(key);
        return (
          <button type="button" className={`generator-cell ${(row + col) % 2 === 1 ? "dark" : ""} ${obstacles.has(key) ? "obstacle" : ""} ${destroyedObstacles.has(key) ? "editor-destroyed-obstacle" : ""} ${selectedTargets.has(key) ? "editor-target-selected" : ""} ${pending?.anchor && cellKey(...pending.anchor) === key ? "editor-anchor-selected" : ""} ${pending?.type === "engineer" && Math.abs(row - pending.row) + Math.abs(col - pending.col) === 1 && !piece && !obstacles.has(key) ? "editor-target-selected" : ""}`} key={key} onClick={() => onCell(row, col)}>
            {obstacles.has(key) && <b aria-label="Obstacle">▦</b>}
            {destroyedObstacles.has(key) && <b aria-label="Destroyed obstacle">✕</b>}
            {piece && <i className={`mini-piece ${piece.player} ${answerIds.has(piece.id) ? "manual-answer-piece" : ""}`}><PieceFace type={piece.type} display="icon" lang="zh" direction={piece.direction} /></i>}
            {selectedTargets.has(key) && <em className="formation-editor-target">{selectedTargets.get(key)}</em>}
          </button>
        );
      })}
    </div>
  );
}

export function PuzzleGeneratorLab({
  lang,
  pieceNames,
  onExit,
  onPlay,
}: {
  lang: Language;
  pieceNames: Record<PieceType, string>;
  onExit: () => void;
  onPlay: (puzzle: GeneratedPuzzle) => void;
}) {
  const [seed, setSeed] = useState(DEFAULT_SEED);
  const [minHandSize, setMinHandSize] = useState(4);
  const [maxHandSize, setMaxHandSize] = useState(7);
  const [minRounds, setMinRounds] = useState(3);
  const [theme, setTheme] = useState<FormationThemeId | "mixed">("mixed");
  const [customMode, setCustomMode] = useState(false);
  const [editorTool, setEditorTool] = useState<EditorTool>("guard");
  const [editorPlayer, setEditorPlayer] = useState<"red" | "blue">("red");
  const [editorPieces, setEditorPieces] = useState<Piece[]>([]);
  const [editorTerrain, setEditorTerrain] = useState<TerrainCell[]>([]);
  const [editorPendingId, setEditorPendingId] = useState<number | null>(null);
  const [manualAnswerMode, setManualAnswerMode] = useState(false);
  const [editorAnswerPieces, setEditorAnswerPieces] = useState<Piece[]>([]);
  const [manualValidation, setManualValidation] = useState<CustomSolutionValidation | null>(null);
  const [puzzles, setPuzzles] = useState<GeneratedPuzzle[]>([]);
  const [generating, setGenerating] = useState(false);
  const [customAttemptLimit, setCustomAttemptLimit] = useState(DEFAULT_CUSTOM_ATTEMPT_LIMIT);
  const [customAttemptsDone, setCustomAttemptsDone] = useState(0);
  const [searchMessage, setSearchMessage] = useState("");
  const [answerPuzzle, setAnswerPuzzle] = useState<GeneratedPuzzle | null>(null);
  const initialGenerationStarted = useRef(false);
  const generationRun = useRef(0);

  function saveGallery(settings: Omit<SavedGallery, "puzzles">, nextPuzzles: GeneratedPuzzle[]) {
    window.localStorage.setItem(SAVED_GALLERY_KEY, JSON.stringify({ ...settings, puzzles: nextPuzzles } satisfies SavedGallery));
  }

  function runGeneration(settings: {
    seed: string;
    count: number;
    minHandSize: number;
    maxHandSize: number;
    minRounds: number;
    theme: FormationThemeId | "mixed";
  }) {
    generationRun.current += 1;
    const runId = generationRun.current;
    const collected: GeneratedPuzzle[] = [];
    let batch = 0;
    setPuzzles([]);
    setGenerating(true);
    setSearchMessage("");

    const nextBatch = () => {
      if (generationRun.current !== runId) return;
      const remaining = settings.count - collected.length;
      if (remaining <= 0 || batch >= Math.max(12, settings.count * 2)) {
        if (collected.length > 0) saveGallery(settings, collected.map((puzzle, index) => ({ ...puzzle, number: index + 1 })));
        setGenerating(false);
        return;
      }
      const requestedTheme = settings.theme === "mixed"
        ? MIXED_THEME_IDS[batch % MIXED_THEME_IDS.length]
        : settings.theme;
      const next = generatePuzzleCandidates({
        seed: `${settings.seed}:batch-${batch}`,
        count: Math.min(settings.theme === "mixed" ? 1 : 4, remaining),
        attempts: BATCH_ATTEMPTS,
        minHandSize: settings.minHandSize,
        maxHandSize: settings.maxHandSize,
        minCollapseRounds: settings.minRounds,
        sampleAttempts: 120,
        theme: requestedTheme,
      });
      collected.push(...next);
      setPuzzles(collected.map((puzzle, index) => ({ ...puzzle, number: index + 1 })));
      batch += 1;
      window.setTimeout(nextBatch, 40);
    };
    window.setTimeout(nextBatch, 80);
  }

  useEffect(() => {
    if (initialGenerationStarted.current) return;
    initialGenerationStarted.current = true;
    try {
      const saved = JSON.parse(window.localStorage.getItem(SAVED_GALLERY_KEY) ?? "null") as SavedGallery | null;
      if (saved?.puzzles?.length) {
        const validPuzzles = saved.puzzles.filter((puzzle) => !JSON.stringify(puzzle).includes('"warden"'));
        if (validPuzzles.length !== saved.puzzles.length) {
          if (validPuzzles.length > 0) {
            saveGallery(saved, validPuzzles);
          } else {
            window.localStorage.removeItem(SAVED_GALLERY_KEY);
          }
        }
        setSeed(saved.seed);
        setMinHandSize(saved.minHandSize);
        setMaxHandSize(saved.maxHandSize);
        setMinRounds(saved.minRounds);
        setTheme(saved.theme ?? "mixed");
        setPuzzles(validPuzzles);
        setGenerating(false);
        return;
      }
    } catch {
      window.localStorage.removeItem(SAVED_GALLERY_KEY);
    }
    return () => { generationRun.current += 1; };
  }, []);

  function generate() {
    runGeneration({ seed: seed.trim() || DEFAULT_SEED, count: DEFAULT_COUNT, minHandSize, maxHandSize, minRounds, theme });
  }

  function editFormationCell(row: number, col: number) {
    const key = cellKey(row, col);
    const existing = editorPieces.find((piece) => piece.row === row && piece.col === col);
    const existingAnswer = editorAnswerPieces.find((piece) => piece.row === row && piece.col === col);
    const pending = [...editorPieces, ...editorAnswerPieces].find((piece) => piece.id === editorPendingId);
    const pendingIsAnswer = Boolean(pending && editorAnswerPieces.some((piece) => piece.id === pending.id));
    const updatePending = (change: (piece: Piece) => Piece) => {
      if (!pending) return;
      if (editorAnswerPieces.some((piece) => piece.id === pending.id)) {
        setEditorAnswerPieces((current) => current.map((piece) => piece.id === pending.id ? change(piece) : piece));
      } else {
        setEditorPieces((current) => current.map((piece) => piece.id === pending.id ? change(piece) : piece));
      }
    };
    if (pending?.type === "engineer") {
      const occupied = Boolean(existing || existingAnswer);
      const occupiedByBuiltObstacle = editorAnswerPieces.some((piece) =>
        piece.createdObstacle?.row === row && piece.createdObstacle.col === col);
      if (Math.abs(row - pending.row) + Math.abs(col - pending.col) !== 1 || occupied || occupiedByBuiltObstacle || editorTerrain.some((cell) => cell.row === row && cell.col === col)) return;
      const createdObstacle: TerrainCell = { row, col, type: "fence" };
      updatePending((piece) => ({ ...piece, createdObstacle }));
      if (!pendingIsAnswer) setEditorTerrain((current) => [...current, createdObstacle]);
      setEditorPendingId(null);
      return;
    }
    if (pending?.type === "sentry") {
      const obstacle = editorTerrain.find((cell) => cell.row === row && cell.col === col);
      if (obstacle && Math.max(Math.abs(row - pending.row), Math.abs(col - pending.col)) <= 2) {
        updatePending((piece) => ({ ...piece, anchor: [row, col] }));
        setEditorPendingId(null);
      }
      return;
    }
    if (pending?.type === "selector") {
      if ((row === pending.row && col === pending.col) || editorTerrain.some((cell) => cell.row === row && cell.col === col) ||
          Math.max(Math.abs(row - pending.row), Math.abs(col - pending.col)) > 2) return;
      const currentTargets = pending.targets ?? [];
      const alreadySelected = currentTargets.some(([targetRow, targetCol]) => targetRow === row && targetCol === col);
      const nextTargets = alreadySelected
        ? currentTargets.filter(([targetRow, targetCol]) => targetRow !== row || targetCol !== col)
        : [...currentTargets, [row, col] as [number, number]];
      updatePending((piece) => ({ ...piece, targets: nextTargets }));
      if (nextTargets.length === 4) setEditorPendingId(null);
      return;
    }
    if (manualAnswerMode) {
      setManualValidation(null);
      if (editorTool === "erase") {
        setEditorAnswerPieces((current) => current.filter((piece) => piece.row !== row || piece.col !== col));
        return;
      }
      const builtByAnswer = editorAnswerPieces.some((piece) =>
        piece.createdObstacle?.row === row && piece.createdObstacle.col === col);
      if (editorTool === "obstacle" || existing || builtByAnswer || editorTerrain.some((cell) => cell.row === row && cell.col === col)) return;
      if (existingAnswer?.type === editorTool && EDITOR_DIRECTIONAL.has(editorTool)) {
        const nextDirection = EDITOR_DIRECTIONS[(EDITOR_DIRECTIONS.indexOf(existingAnswer.direction ?? "up") + 1) % EDITOR_DIRECTIONS.length];
        setEditorAnswerPieces((current) => current.map((piece) => piece.id === existingAnswer.id ? { ...piece, direction: nextDirection } : piece));
        return;
      }
      const answerPiece: Piece = {
        id: 100000 + row * BOARD_SIZE + col,
        player: "blue",
        type: editorTool,
        row,
        col,
        direction: EDITOR_DIRECTIONAL.has(editorTool) ? "up" : undefined,
        targets: editorTool === "selector" ? [] : undefined,
      };
      setEditorAnswerPieces((current) => [...current.filter((piece) => piece.row !== row || piece.col !== col), answerPiece]);
      setEditorPendingId(editorTool === "selector" || editorTool === "sentry" || editorTool === "engineer" ? answerPiece.id : null);
      return;
    }
    setManualValidation(null);
    setEditorAnswerPieces((current) => current.filter((piece) => piece.row !== row || piece.col !== col));
    if (editorTool === "erase") {
      if (existing?.createdObstacle) {
        setEditorTerrain((current) => current.filter((cell) =>
          cell.row !== existing.createdObstacle!.row || cell.col !== existing.createdObstacle!.col));
      }
      setEditorPieces((current) => current.filter((piece) => piece.row !== row || piece.col !== col));
      setEditorTerrain((current) => current.filter((cell) => cell.row !== row || cell.col !== col));
      setEditorPieces((current) => current.map((piece) =>
        piece.createdObstacle?.row === row && piece.createdObstacle.col === col
          ? { ...piece, createdObstacle: undefined }
          : piece));
      if (existing?.id === editorPendingId) setEditorPendingId(null);
      return;
    }
    if (editorTool === "obstacle") {
      setEditorPieces((current) => current.filter((piece) => piece.row !== row || piece.col !== col));
      setEditorPieces((current) => current.map((piece) =>
        piece.createdObstacle?.row === row && piece.createdObstacle.col === col
          ? { ...piece, createdObstacle: undefined }
          : piece));
      setEditorTerrain((current) => current.some((cell) => cellKey(cell.row, cell.col) === key)
        ? current.filter((cell) => cellKey(cell.row, cell.col) !== key)
        : [...current, { row, col, type: "fence" }]);
      return;
    }
    if (existing?.createdObstacle) {
      setEditorTerrain((current) => current.filter((cell) =>
        cell.row !== existing.createdObstacle!.row || cell.col !== existing.createdObstacle!.col));
    }
    setEditorTerrain((current) => current.filter((cell) => cell.row !== row || cell.col !== col));
    if (existing?.type === editorTool && existing.player === editorPlayer && EDITOR_DIRECTIONAL.has(editorTool)) {
      const nextDirection = EDITOR_DIRECTIONS[(EDITOR_DIRECTIONS.indexOf(existing.direction ?? "up") + 1) % EDITOR_DIRECTIONS.length];
      setEditorPieces((current) => current.map((piece) => piece.id === existing.id ? { ...piece, direction: nextDirection } : piece));
      return;
    }
    const piece: Piece = {
      id: row * BOARD_SIZE + col + 1,
      player: editorPlayer,
      type: editorTool,
      row,
      col,
      direction: EDITOR_DIRECTIONAL.has(editorTool) ? "up" : undefined,
      targets: editorTool === "selector" ? [] : undefined,
    };
    setEditorPieces((current) => [...current.filter((candidate) => candidate.row !== row || candidate.col !== col), piece]);
    setEditorPendingId(editorTool === "selector" || editorTool === "sentry" || editorTool === "engineer" ? piece.id : null);
  }

  function solveEditorFormation() {
    if (!editorPieces.some((piece) => piece.player === "red") || generating) return;
    generationRun.current += 1;
    const runId = generationRun.current;
    const collected: GeneratedPuzzle[] = [];
    let batch = 0;
    setGenerating(true);
    setPuzzles([]);
    setCustomAttemptsDone(0);
    setSearchMessage("");
    const nextBatch = () => {
      if (generationRun.current !== runId) return;
      const hasSelectorFreeSolution = collected.some((puzzle) =>
        puzzle.generation.knownSolution.every((placement) => placement.type !== "selector"));
      const prioritizeSelectorFree = !hasSelectorFreeSolution &&
        (batch < Math.ceil(customAttemptLimit / 2) || batch % 2 === 0);
      const found = solveCustomFormation({
        seed: `${seed.trim() || DEFAULT_SEED}:editor-${batch}`,
        pieces: editorPieces,
        terrain: editorTerrain,
        count: 1,
        attempts: 1,
        minHandSize,
        maxHandSize,
        minCollapseRounds: minRounds,
        excludedTypes: prioritizeSelectorFree ? ["selector"] : [],
      });
      for (const puzzle of found) {
        const key = JSON.stringify(puzzle.generation.knownSolution);
        const usesSelector = puzzle.generation.knownSolution.some((placement) => placement.type === "selector");
        const selectorSolutions = collected.filter((candidate) =>
          candidate.generation.knownSolution.some((placement) => placement.type === "selector")).length;
        if (usesSelector && selectorSolutions >= DEFAULT_COUNT - 1) continue;
        if (!collected.some((candidate) => JSON.stringify(candidate.generation.knownSolution) === key)) collected.push(puzzle);
      }
      const numbered = collected.slice(0, DEFAULT_COUNT).map((puzzle, index) => ({
        ...puzzle,
        number: index + 1,
        generation: { ...puzzle.generation, themeTitle: { en: `Candidate ${index + 1}`, zh: `候选解 ${index + 1}` } },
      }));
      setPuzzles(numbered);
      batch += 1;
      setCustomAttemptsDone(batch);
      const selectorFreeFound = numbered.some((puzzle) =>
        puzzle.generation.knownSolution.every((placement) => placement.type !== "selector"));
      if ((numbered.length >= DEFAULT_COUNT && selectorFreeFound) || batch >= customAttemptLimit) {
        if (numbered.length > 0) saveGallery({ seed, count: DEFAULT_COUNT, minHandSize, maxHandSize, minRounds, theme }, numbered);
        if (numbered.length < DEFAULT_COUNT) {
          setSearchMessage(lang === "zh"
            ? `已达到 ${customAttemptLimit} 次上限，找到 ${numbered.length} 个解。`
            : `Stopped at the ${customAttemptLimit}-attempt limit with ${numbered.length} solution${numbered.length === 1 ? "" : "s"}.`);
        }
        setGenerating(false);
        return;
      }
      window.setTimeout(nextBatch, 40);
    };
    window.setTimeout(nextBatch, 60);
  }

  function stopGeneration() {
    generationRun.current += 1;
    setGenerating(false);
    setSearchMessage(lang === "zh" ? "搜索已手动停止。" : "Search stopped manually.");
  }

  function validateManualAnswer() {
    const validation = validateCustomSolution({
      seed: seed.trim() || DEFAULT_SEED,
      pieces: editorPieces,
      terrain: editorTerrain,
      placements: editorAnswerPieces.map(({ player, type, row, col, direction, targets, anchor, createdObstacle }) =>
        ({ player, type, row, col, direction, targets, anchor, createdObstacle } satisfies GeneratedPlacement)),
    });
    setManualValidation(validation);
  }

  function saveManualPuzzle() {
    if (!manualValidation?.puzzle) return;
    const savedPuzzle = { ...manualValidation.puzzle, number: 1 };
    setPuzzles([savedPuzzle]);
    saveGallery({ seed, count: 1, minHandSize, maxHandSize, minRounds, theme }, [savedPuzzle]);
    setSearchMessage(lang === "zh" ? "关卡已保存，可以在下方导出或挑战。" : "Puzzle saved. You can export or play it below.");
  }

  function exportPuzzle(puzzle: GeneratedPuzzle) {
    const payload = JSON.stringify({
      format: "battle-array-puzzle",
      version: 1,
      exportedAt: new Date().toISOString(),
      settings: { seed, minHandSize, maxHandSize, minRounds, theme },
      puzzle,
    }, null, 2);
    const url = URL.createObjectURL(new Blob([payload], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `battle-array-puzzle-${puzzle.number}-${puzzle.generation.seed.replace(/[^a-z0-9_-]+/gi, "-")}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const customFormationReady = editorPieces.some((piece) => piece.player === "red") &&
    editorPieces.every((piece) => piece.type !== "sentry" || Boolean(piece.anchor)) &&
    editorPieces.every((piece) => piece.type !== "selector" || piece.targets?.length === 4) &&
    editorPieces.every((piece) => piece.type !== "engineer" || Boolean(piece.createdObstacle));
  const manualAnswerReady = customFormationReady && editorAnswerPieces.length > 0 &&
    editorAnswerPieces.every((piece) => piece.type !== "sentry" || Boolean(piece.anchor)) &&
    editorAnswerPieces.every((piece) => piece.type !== "selector" || piece.targets?.length === 4) &&
    editorAnswerPieces.every((piece) => piece.type !== "engineer" || Boolean(piece.createdObstacle));

  return (
    <section className="generator-lab">
      <header className="generator-header">
        <button className="quiet-button" onClick={onExit}>← {lang === "zh" ? "返回" : "Back"}</button>
        <div>
          <span>{lang === "zh" ? "网页检验工具" : "WEB INSPECTION TOOL"}</span>
          <h1>{lang === "zh" ? "谜题生成器" : "Puzzle Generator"}</h1>
        </div>
        <strong>{lang === "zh" ? `${puzzles.length}/${DEFAULT_COUNT} 个候选` : `${puzzles.length}/${DEFAULT_COUNT} candidates`}</strong>
      </header>

      <div className="generator-mode-switch" role="tablist" aria-label={lang === "zh" ? "生成方式" : "Generation mode"}>
        <button className={!customMode ? "active" : ""} onClick={() => { setCustomMode(false); setManualAnswerMode(false); setEditorPendingId(null); setPuzzles([]); }}>{lang === "zh" ? "自动敌阵" : "Generated formation"}</button>
        <button className={customMode && !manualAnswerMode ? "active" : ""} onClick={() => { setCustomMode(true); setManualAnswerMode(false); setEditorPendingId(null); setPuzzles([]); }}>{lang === "zh" ? "我来摆敌阵" : "Build enemy formation"}</button>
        <button className={customMode && manualAnswerMode ? "active" : ""} onClick={() => { setCustomMode(true); setManualAnswerMode(true); if (editorTool === "obstacle") setEditorTool("guard"); setEditorPendingId(null); setPuzzles([]); }}>{lang === "zh" ? "我来设计答案" : "Design an answer"}</button>
      </div>

      <div className="generator-controls">
        <label>{lang === "zh" ? "种子" : "Seed"}<input value={seed} onChange={(event) => setSeed(event.target.value)} /></label>
        {!customMode && <label>{lang === "zh" ? "敌阵主题" : "Formation theme"}<select value={theme} onChange={(event) => setTheme(event.target.value as FormationThemeId | "mixed")}>
          {FORMATION_THEMES.map((option) => <option key={option.id} value={option.id}>{option.title[lang]}</option>)}
        </select></label>}
        <label>{lang === "zh" ? "最少手牌" : "Min hand"}<input type="number" min="3" max="8" value={minHandSize} onChange={(event) => setMinHandSize(Math.max(3, Math.min(8, Number(event.target.value))))} /></label>
        <label>{lang === "zh" ? "最多手牌" : "Max hand"}<input type="number" min="3" max="8" value={maxHandSize} onChange={(event) => setMaxHandSize(Math.max(minHandSize, Math.min(8, Number(event.target.value))))} /></label>
        <label>{lang === "zh" ? "最低崩塌层数" : "Min layers"}<input type="number" min="1" max="5" value={minRounds} onChange={(event) => setMinRounds(Math.max(1, Math.min(5, Number(event.target.value))))} /></label>
        {customMode && !manualAnswerMode && <label>{lang === "zh" ? "尝试上限" : "Attempt limit"}<input type="number" min="1" max="200" disabled={generating} value={customAttemptLimit} onChange={(event) => setCustomAttemptLimit(Math.max(1, Math.min(200, Number(event.target.value) || 1)))} /></label>}
        <button
          className={generating ? "quiet-button generator-stop-button" : "primary-button"}
          disabled={!generating && (manualAnswerMode ? !manualAnswerReady : customMode && !customFormationReady)}
          onClick={generating ? stopGeneration : manualAnswerMode ? validateManualAnswer : customMode ? solveEditorFormation : generate}
        >{generating ? (lang === "zh" ? "停止搜索" : "Stop search") : manualAnswerMode ? (lang === "zh" ? "验证答案" : "Validate answer") : customMode ? (lang === "zh" ? "寻找 3 个解" : "Find 3 solutions") : puzzles.length > 0 ? (lang === "zh" ? "重新生成 3 关" : "Regenerate 3") : (lang === "zh" ? "生成 3 关" : "Generate 3")}</button>
      </div>

      {customMode && !manualAnswerMode && (generating || searchMessage) && <div className="generator-search-status" role="status">
        {generating
          ? (lang === "zh" ? `正在尝试 ${customAttemptsDone}/${customAttemptLimit}` : `Attempting ${customAttemptsDone}/${customAttemptLimit}`)
          : searchMessage}
      </div>}

      {customMode && (
        <section className="formation-editor">
          <div className="formation-editor-tools">
            {!manualAnswerMode && <div className="formation-editor-side" role="group" aria-label={lang === "zh" ? "阵营" : "Side"}>
              <button type="button" className={editorPlayer === "red" ? "selected red" : ""} aria-pressed={editorPlayer === "red"} onClick={() => { setEditorPlayer("red"); setEditorPendingId(null); }}>
                <i className="player-dot" />{lang === "zh" ? "敌方" : "Enemy"}
              </button>
              <button type="button" className={editorPlayer === "blue" ? "selected blue" : ""} aria-pressed={editorPlayer === "blue"} onClick={() => { setEditorPlayer("blue"); setEditorPendingId(null); }}>
                <i className="player-dot" />{lang === "zh" ? "己方" : "Ally"}
              </button>
            </div>}
            {manualAnswerMode && <strong className="manual-answer-side">{lang === "zh" ? "答案棋子（蓝）" : "Answer pieces (blue)"}</strong>}
            <div className="formation-editor-palette" role="toolbar" aria-label={lang === "zh" ? "棋子画笔" : "Piece brushes"}>
              {EDITOR_PIECE_TYPES.map((type) => (
                <button
                  type="button"
                  key={type}
                  className={editorTool === type ? "selected" : ""}
                  aria-pressed={editorTool === type}
                  onClick={() => { setEditorTool(type); setEditorPendingId(null); }}
                >
                  <i className={`mini-piece ${editorPlayer}`}><PieceFace type={type} display="icon" lang={lang} /></i>
                  <span>{pieceNames[type]}</span>
                </button>
              ))}
              {!manualAnswerMode && <button type="button" className={`formation-editor-utility obstacle ${editorTool === "obstacle" ? "selected" : ""}`} aria-pressed={editorTool === "obstacle"} onClick={() => { setEditorTool("obstacle"); setEditorPendingId(null); }}>
                <i aria-hidden="true">▦</i><span>{lang === "zh" ? "障碍" : "Obstacle"}</span>
              </button>}
              <button type="button" className={`formation-editor-utility erase ${editorTool === "erase" ? "selected" : ""}`} aria-pressed={editorTool === "erase"} onClick={() => { setEditorTool("erase"); setEditorPendingId(null); }}>
                <i aria-hidden="true">⌫</i><span>{lang === "zh" ? "橡皮" : "Eraser"}</span>
              </button>
            </div>
            <p>{editorPendingId !== null
              ? ([...editorPieces, ...editorAnswerPieces].find((piece) => piece.id === editorPendingId)?.type === "sentry"
                  ? (lang === "zh" ? "现在点击哨兵要守护的障碍。" : "Now choose the obstacle guarded by the Sentry.")
                  : [...editorPieces, ...editorAnswerPieces].find((piece) => piece.id === editorPendingId)?.type === "engineer"
                    ? (lang === "zh" ? "现在点击 Engineer 上下左右相邻的空格来建造障碍。" : "Now choose an orthogonally adjacent empty tile for the Engineer's Obstacle.")
                    : (lang === "zh" ? "现在依次选择神射手的四个目标格。" : "Now choose the Sharpshooter's four target cells."))
              : (lang === "zh" ? "点击格子放置；方向棋再次点击同一格会顺时针旋转。" : "Click to place. Click a directional piece again to rotate it clockwise.")}</p>
            <button className="quiet-button" onClick={() => {
              if (manualAnswerMode) setEditorAnswerPieces([]);
              else { setEditorPieces([]); setEditorTerrain([]); setEditorAnswerPieces([]); }
              setManualValidation(null);
              setEditorPendingId(null);
              setPuzzles([]);
            }}>{manualAnswerMode ? (lang === "zh" ? "清空答案" : "Clear answer") : (lang === "zh" ? "清空棋盘" : "Clear board")}</button>
          </div>
          <FormationEditorBoard pieces={editorPieces} answerPieces={manualAnswerMode ? editorAnswerPieces : []} terrain={editorTerrain} pendingId={editorPendingId} onCell={editFormationCell} />
          <strong>{lang === "zh"
            ? `敌棋 ${editorPieces.filter((piece) => piece.player === "red").length} · 预置己方 ${editorPieces.filter((piece) => piece.player === "blue").length} · ${manualAnswerMode ? `答案 ${editorAnswerPieces.length} · ` : ""}障碍 ${editorTerrain.length}`
            : `${editorPieces.filter((piece) => piece.player === "red").length} enemies · ${editorPieces.filter((piece) => piece.player === "blue").length} fixed allies · ${manualAnswerMode ? `${editorAnswerPieces.length} answer pieces · ` : ""}${editorTerrain.length} obstacles`}</strong>
          {manualAnswerMode && manualValidation && <div className={`manual-answer-validation ${manualValidation.passed ? "passed" : "failed"}`} role="status">
            <strong>{manualValidation.passed ? (lang === "zh" ? "答案通过" : "Answer passes") : (lang === "zh" ? "答案未通过" : "Answer fails")}</strong>
            <span>{lang === "zh"
              ? `${manualValidation.collapseRounds} 层崩塌 · 敌方剩余 ${manualValidation.enemySurvivors} · 己方存活 ${manualValidation.friendlySurvivors} · 多余棋子 ${manualValidation.redundantPieces}`
              : `${manualValidation.collapseRounds} collapse layers · ${manualValidation.enemySurvivors} enemies left · ${manualValidation.friendlySurvivors} allies survive · ${manualValidation.redundantPieces} redundant pieces`}</span>
            {manualValidation.passed && <button className="primary-button" onClick={saveManualPuzzle}>{lang === "zh" ? "保存关卡" : "Save puzzle"}</button>}
          </div>}
          {manualAnswerMode && searchMessage && <div className="generator-search-status" role="status">{searchMessage}</div>}
        </section>
      )}

      <div className="generator-gallery">
        {puzzles.map((puzzle) => (
          <article className="generator-card" key={puzzle.id}>
            <GeneratorBoard puzzle={puzzle} />
            <span className="generator-card-copy">
              <strong>#{puzzle.number} · {puzzle.generation.themeTitle[lang]}</strong>
              <span>{puzzle.hand.map((entry) => `${pieceNames[entry.type]}×${entry.count}`).join(" · ")}</span>
              <small>{lang === "zh"
                ? `敌阵 ${puzzle.generation.enemyFormationSize} · 手牌 ${puzzle.generation.handSize} · ${puzzle.generation.collapseRounds} 层${puzzle.generation.downgradedPieces ? ` · 降级 ${puzzle.generation.downgradedPieces}` : ""}`
                : `Enemy ${puzzle.generation.enemyFormationSize} · hand ${puzzle.generation.handSize} · ${puzzle.generation.collapseRounds} layers${puzzle.generation.downgradedPieces ? ` · ${puzzle.generation.downgradedPieces} downgraded` : ""}`}</small>
            </span>
            <span className="generator-card-actions">
              <button className="quiet-button" onClick={() => setAnswerPuzzle(puzzle)}>{lang === "zh" ? "标准答案" : "Answer"}</button>
              <button className="quiet-button" onClick={() => exportPuzzle(puzzle)}>{lang === "zh" ? "导出" : "Export"}</button>
              <button className="primary-button" onClick={() => onPlay(puzzle)}>{lang === "zh" ? "挑战 →" : "Play →"}</button>
            </span>
          </article>
        ))}
      </div>

      {answerPuzzle && (
        <div className="generator-detail-overlay" role="presentation" onClick={() => setAnswerPuzzle(null)}>
          <section className="generator-detail" role="dialog" aria-modal="true" aria-label={lang === "zh" ? "标准答案" : "Standard answer"} onClick={(event) => event.stopPropagation()}>
            <header>
              <div>
                <span>#{answerPuzzle.number}</span>
                <h2>{lang === "zh" ? "标准答案" : "Standard answer"}</h2>
              </div>
              <button className="quiet-button" onClick={() => setAnswerPuzzle(null)}>×</button>
            </header>
            <GeneratorBoard puzzle={answerPuzzle} showSolution />
            <p className="generator-solution-copy">{lang === "zh" ? "蓝色棋子是生成器采用的完整落子方案。" : "Blue pieces show the generator's complete placement."}</p>
            <button className="primary-button" onClick={() => onPlay(answerPuzzle)}>{lang === "zh" ? "亲自挑战" : "Play puzzle"}</button>
          </section>
        </div>
      )}
    </section>
  );
}
