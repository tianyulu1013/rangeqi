"use client";

import type { Language } from "../game/PieceVisuals";
import { PUZZLE_LEVELS } from "../../lib/game/puzzles";

export function PuzzleMode({
  lang,
  onExit,
  onChooseLevel,
}: {
  lang: Language;
  onExit: () => void;
  onChooseLevel: (index: number) => void;
}) {
  return (
    <section className="puzzle-shell">
      <header className="puzzle-header">
        <button className="quiet-button home-button" onClick={onExit} aria-label={lang === "zh" ? "返回" : "Back"}>
          <svg className="toolbar-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5m6-6-6 6 6 6" /></svg>
          <span className="home-button-label">{lang === "zh" ? "返回" : "Back"}</span>
        </button>
        <div><span>{lang === "zh" ? "单人关卡" : "SOLO CHALLENGES"}</span><h1>{lang === "zh" ? "战阵谜题" : "Puzzles"}</h1></div>
      </header>
      <section className="puzzle-level-list">
        {PUZZLE_LEVELS.map((level, index) => (
          <button className="puzzle-level-card" onClick={() => onChooseLevel(index)} key={level.id}>
            <span className="puzzle-level-number">{String(level.number).padStart(2, "0")}</span>
            <span><strong>{level.title[lang]}</strong><small>{level.lesson[lang]}</small></span>
            <b aria-hidden="true">›</b>
          </button>
        ))}
      </section>
    </section>
  );
}
