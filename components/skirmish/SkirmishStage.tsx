import { BOARD_SIZE, cellKey } from "../../lib/game/board";
import { getDraftTier } from "../../lib/game/draft";
import type { Language, PieceDisplay } from "../game/PieceVisuals";
import { PieceFace, RangeIcon } from "../game/PieceVisuals";
import { PieceHelpDialog } from "../game/PlayerHand";
import type { PieceType, Player, TerrainCell } from "../../lib/game/types";
import { useState } from "react";

export type SkirmishStageName =
  | "battlefield"
  | "core-draft"
  | "advanced-draft"
  | "battle";

type SkirmishStageCopy = {
  skirmish: string;
  battlefield: string;
  battlefieldIntro: string;
  seed: string;
  copySeed: string;
  copiedSeed: string;
  useSeed: string;
  seedPlaceholder: string;
  fence: string;
  fenceLegend: string;
  draft: string;
  coreDraft: string;
  advancedDraft: string;
  eliteDraft: string;
  draftRound: string;
  chooseDraft: string;
  draftComplete: string;
  roster: string;
  beginDraft: string;
  beginBattle: string;
  advancedUnavailable: string;
};

type PieceCopy = Record<PieceType, { name: string; desc: string }>;

function BattlefieldPreview({
  terrain,
  label,
  compact = false,
}: {
  terrain: TerrainCell[];
  label: string;
  compact?: boolean;
}) {
  const terrainKeys = new Set(terrain.map((cell) => cellKey(cell.row, cell.col)));

  return (
    <div className={`skirmish-map-preview ${compact ? "compact" : ""}`} role="grid" aria-label={label}>
      {Array.from({ length: BOARD_SIZE * BOARD_SIZE }, (_, index) => {
        const row = Math.floor(index / BOARD_SIZE);
        const col = index % BOARD_SIZE;
        const isFenceCell = terrainKeys.has(cellKey(row, col));
        return (
          <div
            className={`skirmish-map-cell ${isFenceCell ? "fence" : ""}`}
            key={cellKey(row, col)}
            role="gridcell"
            aria-label={isFenceCell ? "Fence" : `${row + 1},${col + 1}`}
          >
            {isFenceCell && <span aria-hidden="true">▦</span>}
          </div>
        );
      })}
    </div>
  );
}

function RosterSummary({
  player,
  roster,
  players,
  pieces,
  pieceDisplay,
  lang,
  rosterLabel,
  compact = false,
}: {
  player: Player;
  roster: PieceType[];
  players: Record<Player, string>;
  pieces: PieceCopy;
  pieceDisplay: PieceDisplay;
  lang: Language;
  rosterLabel: string;
  compact?: boolean;
}) {
  const counts = Array.from(new Set(roster)).map((type) => ({
    type,
    count: roster.filter((item) => item === type).length,
  }));

  return (
    <div className={`draft-roster ${player} ${compact ? "draft-roster-progress" : ""}`}>
      <strong>{players[player]} · {rosterLabel} <em>{roster.length}/10</em></strong>
      <span className="draft-roster-pieces">
        {counts.map(({ type, count }) => (
          <i key={type} title={`${pieces[type].name} ×${count}`}>
            <span className={`mini-piece ${player}`}>
              <PieceFace type={type} display={pieceDisplay} lang={lang} />
            </span>
            <b>×{count}</b>
          </i>
        ))}
      </span>
    </div>
  );
}

export function SkirmishStage({
  stage,
  matchSeed,
  terrain,
  seedInput,
  seedCopied,
  draftRound,
  currentOffer,
  humanPlayer,
  humanRoster,
  draftPickedType,
  lang,
  pieceDisplay,
  players,
  pieces,
  copy,
  onSeedInputChange,
  onApplySeed,
  onCopySeed,
  onBeginDraft,
  onChooseDraft,
  onBeginBattle,
}: {
  stage: SkirmishStageName;
  matchSeed: string;
  terrain: TerrainCell[];
  seedInput: string;
  seedCopied: boolean;
  draftRound: number;
  currentOffer: readonly PieceType[] | null;
  humanPlayer: Player;
  humanRoster: PieceType[];
  draftPickedType: PieceType | null;
  lang: Language;
  pieceDisplay: PieceDisplay;
  players: Record<Player, string>;
  pieces: PieceCopy;
  copy: SkirmishStageCopy;
  onSeedInputChange: (value: string) => void;
  onApplySeed: () => void;
  onCopySeed: () => void;
  onBeginDraft: () => void;
  onChooseDraft: (type: PieceType) => void;
  onBeginBattle: () => void;
}) {
  const [helpType, setHelpType] = useState<PieceType | null>(null);

  if (stage === "battle") return null;

  if (stage === "battlefield") {
    return (
      <section className="skirmish-stage-panel battlefield-stage" aria-live="polite">
        <p className="eyebrow">{copy.skirmish}</p>
        <h2>{copy.battlefield}</h2>
        <p className="skirmish-stage-intro">{copy.battlefieldIntro}</p>

        <div className="seed-panel">
          <div className="seed-heading">
            <span>{copy.seed}</span>
            <code>{matchSeed || "—"}</code>
          </div>
          <button type="button" className="secondary-button" onClick={onCopySeed} disabled={!matchSeed}>
            {seedCopied ? copy.copiedSeed : copy.copySeed}
          </button>
          <div className="seed-input-row">
            <input
              value={seedInput}
              placeholder={copy.seedPlaceholder}
              aria-label={copy.seedPlaceholder}
              onChange={(event) => onSeedInputChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") onApplySeed();
              }}
            />
            <button type="button" className="secondary-button" onClick={onApplySeed} disabled={!seedInput.trim()}>
              {copy.useSeed}
            </button>
          </div>
        </div>

        <div className="skirmish-map-heading">
          <span>{copy.battlefield}</span>
          <small>{terrain.length} {copy.fence}</small>
        </div>
        <div className="skirmish-map-layout">
          <BattlefieldPreview terrain={terrain} label={copy.battlefield} />
          <div className="skirmish-map-legend" aria-label={copy.fenceLegend}>
            <span className="skirmish-legend-item">
              <i className="skirmish-legend-swatch" aria-hidden="true">▦</i>
              <span>{copy.fenceLegend}</span>
            </span>
          </div>
        </div>
        <button type="button" className="primary-button skirmish-stage-action" onClick={onBeginDraft}>
          {copy.beginDraft}
        </button>
      </section>
    );
  }

  const draftComplete = draftRound >= 10;
  const draftTier = getDraftTier(Math.min(draftRound, 9));
  const tierLabel = draftTier === "core"
    ? copy.coreDraft
    : draftTier === "advanced"
      ? copy.advancedDraft
      : copy.eliteDraft;

  return (
    <>
    <section className={`skirmish-stage-panel draft-stage ${draftTier}-draft-stage ${draftComplete ? "draft-complete-stage" : ""}`} aria-live="polite">
      <div className="skirmish-stage-heading">
        <div>
          <p className="eyebrow">{tierLabel}</p>
          <h2>{copy.draft}</h2>
        </div>
        <strong>{draftTier.toUpperCase()} {Math.min(draftRound + 1, 10)}/10</strong>
      </div>
      {!draftComplete && <p className="skirmish-stage-intro">{copy.chooseDraft}</p>}

      <div className="skirmish-map-layout compact">
        <BattlefieldPreview terrain={terrain} label={copy.battlefield} compact />
        <div className="skirmish-map-legend" aria-label={copy.fenceLegend}>
          <span className="skirmish-legend-item">
            <i className="skirmish-legend-swatch" aria-hidden="true">▦</i>
            <span>{copy.fenceLegend}</span>
          </span>
        </div>
      </div>

      {!draftComplete && (
        <RosterSummary
          player={humanPlayer}
          roster={humanRoster}
          players={players}
          pieces={pieces}
          pieceDisplay={pieceDisplay}
          lang={lang}
          rosterLabel={copy.roster}
          compact
        />
      )}

      {!draftComplete && currentOffer && (
        <div className="draft-offers">
          {currentOffer.map((type) => {
            const ownedCount = humanRoster.filter((item) => item === type).length;
            return (
              <div
                className={`draft-card-shell ${draftPickedType === type ? "draft-picked" : ""}`}
                key={`${draftRound}-${type}`}
              >
                <button
                  type="button"
                  className="draft-card"
                  onClick={() => onChooseDraft(type)}
                  disabled={draftPickedType !== null}
                >
                  <span className={`mini-piece ${humanPlayer}`}>
                    <PieceFace type={type} display={pieceDisplay} lang={lang} />
                  </span>
                  <span className="draft-card-copy">
                    <strong>{pieces[type].name}</strong>
                    <em>{copy.roster}: {ownedCount}</em>
                  </span>
                </button>
                <button
                  type="button"
                  className="draft-card-info"
                  aria-label={`${pieces[type].name} info`}
                  onClick={() => setHelpType(type)}
                >
                  <RangeIcon type={type} />
                  <span className="draft-info-badge" aria-hidden="true">i</span>
                </button>
              </div>
            );
          })}
        </div>
      )}

      {draftComplete && (
        <div className="draft-complete">
          <p>{copy.draftComplete}</p>
          <div className="draft-rosters">
            <RosterSummary
              player={humanPlayer}
              roster={humanRoster}
              players={players}
              pieces={pieces}
              pieceDisplay={pieceDisplay}
              lang={lang}
              rosterLabel={copy.roster}
            />
          </div>
          <button type="button" className="primary-button skirmish-stage-action" onClick={onBeginBattle}>
            {copy.beginBattle}
          </button>
        </div>
      )}
    </section>
    {helpType && (
      <PieceHelpDialog
        player={humanPlayer}
        type={helpType}
        count={humanRoster.filter((item) => item === helpType).length}
        pieceDisplay={pieceDisplay}
        lang={lang}
        pieceData={pieces[helpType]}
        onClose={() => setHelpType(null)}
      />
    )}
    </>
  );
}
