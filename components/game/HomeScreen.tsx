import type { Language } from "./PieceVisuals";

type HomeScreenCopy = {
  title: string;
  classic: string;
  classicDescription: string;
  skirmish: string;
  skirmishDescription: string;
  puzzles: string;
  puzzlesDescription: string;
  settings: string;
  rulebook: string;
};

export function HomeScreen({
  copy,
  lang,
  onLanguageChange,
  onChooseClassic,
  onChooseSkirmish,
  onChoosePuzzles,
  onChooseMusketTest,
  onChoosePuzzleGenerator,
  onOpenSettings,
  onOpenRulebook,
  showDevelopmentModes = true,
}: {
  copy: HomeScreenCopy;
  lang: Language;
  onLanguageChange: (lang: Language) => void;
  onChooseClassic: () => void;
  onChooseSkirmish: () => void;
  onChoosePuzzles: () => void;
  onChooseMusketTest: () => void;
  onChoosePuzzleGenerator: () => void;
  onOpenSettings: () => void;
  onOpenRulebook: () => void;
  showDevelopmentModes?: boolean;
}) {
  return (
    <section className="home-screen" aria-labelledby="home-title">
      <div className="home-heading">
        <span className="brand-mark">衡</span>
        <h1 id="home-title">{copy.title}</h1>
      </div>

      <div className="home-mode-list">
        <button type="button" className="home-mode-card classic" onClick={onChooseClassic}>
          <span className="home-mode-number">01</span>
          <span className="home-mode-copy">
            <strong>{copy.classic}</strong>
            <span>{copy.classicDescription}</span>
          </span>
          <span className="home-mode-arrow" aria-hidden="true">↗</span>
        </button>
        <button type="button" className="home-mode-card skirmish" onClick={onChooseSkirmish}>
          <span className="home-mode-number">02</span>
          <span className="home-mode-copy">
            <strong>{copy.skirmish}</strong>
            <span>{copy.skirmishDescription}</span>
          </span>
          <span className="home-mode-arrow" aria-hidden="true">↗</span>
        </button>
        {showDevelopmentModes && <button type="button" className="home-mode-card puzzles" onClick={onChoosePuzzles}>
          <span className="home-mode-number">03</span>
          <span className="home-mode-copy">
            <strong>{copy.puzzles}</strong>
            <span>{copy.puzzlesDescription}</span>
          </span>
          <span className="home-mode-arrow" aria-hidden="true">↗</span>
        </button>}
      </div>

      <div className="home-secondary-actions">
        <label className="language-select">
          <select
            value={lang}
            aria-label={lang === "zh" ? "界面语言" : "Interface language"}
            onChange={(event) => onLanguageChange(event.target.value as Language)}
          >
            <option value="en">English</option>
            <option value="zh">简体中文</option>
          </select>
        </label>
        <button type="button" className="quiet-button" onClick={onOpenRulebook}>
          {copy.rulebook}
        </button>
        <button type="button" className="quiet-button" onClick={onOpenSettings}>
          {copy.settings}
        </button>
      </div>
      {showDevelopmentModes && <button type="button" className="quiet-button home-test-button" onClick={onChooseMusketTest}>
        {lang === "zh" ? "棋子实验场" : "Piece Lab"}
      </button>}
      {showDevelopmentModes && <button type="button" className="quiet-button home-test-button generator-entry-button" onClick={onChoosePuzzleGenerator}>
        {lang === "zh" ? "谜题生成器" : "Puzzle Generator"}
      </button>}
    </section>
  );
}
