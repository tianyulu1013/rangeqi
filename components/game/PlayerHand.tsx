import { PIECE_TYPES } from "../../lib/game/pieces";
import type { PieceDisplay, Language } from "./PieceVisuals";
import { PieceFace, RangeIcon } from "./PieceVisuals";
import type { PieceType, Player } from "../../lib/game/types";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useState } from "react";

type BattlePhase = "placement" | "ready" | "settling" | "finished";

type PlayerHandCopy = {
  players: Record<Player, string>;
  pieces: Record<PieceType, { name: string; desc: string }>;
};

export function PieceTray({
  player,
  type,
  count,
  selected,
  enabled,
  pieceDisplay,
  lang,
  pieceData,
  ownerLabel,
  onChoose,
  onDragStart,
}: {
  player: Player;
  type: PieceType;
  count: number;
  selected: boolean;
  enabled: boolean;
  pieceDisplay: PieceDisplay;
  lang: Language;
  pieceData: { name: string; desc: string };
  ownerLabel: string;
  onChoose?: () => void;
  onDragStart?: (event: ReactPointerEvent<HTMLButtonElement>) => void;
}) {
  const [helpOpen, setHelpOpen] = useState(false);

  return (
    <div className="inventory-piece-shell">
      {helpOpen && (
        <PieceHelpDialog
          player={player}
          type={type}
          count={count}
          pieceDisplay={pieceDisplay}
          lang={lang}
          pieceData={pieceData}
          onClose={() => setHelpOpen(false)}
        />
      )}
      <button
        disabled={!enabled}
        className={`inventory-piece ${enabled && selected ? "selected" : ""}`}
        onClick={onChoose}
        onPointerDown={(event) => {
          if (enabled) onDragStart?.(event);
        }}
        aria-label={`${ownerLabel} ${pieceData.name} ×${count}`}
      >
        <span className="inventory-piece-face" aria-hidden="true">
          <span className={`mini-piece ${player}`}>
            <PieceFace type={type} display={pieceDisplay} lang={lang} />
          </span>
        </span>
        <span className="piece-copy">
          <strong>{pieceData.name}</strong>
          <small>{pieceData.desc}</small>
        </span>
        <span className="inventory-piece-range">
          <RangeIcon type={type} />
        </span>
        <span className="piece-count">×{count}</span>
      </button>
      <button
        type="button"
        className="inventory-piece-info"
        aria-label={`${pieceData.name} info`}
        onClick={() => setHelpOpen(true)}
      >
        i
      </button>
    </div>
  );
}

export function PieceHelpDialog({
  player,
  type,
  count,
  pieceDisplay,
  lang,
  pieceData,
  onClose,
}: {
  player: Player;
  type: PieceType;
  count: number;
  pieceDisplay: PieceDisplay;
  lang: Language;
  pieceData: { name: string; desc: string };
  onClose: () => void;
}) {
  return (
    <div className="piece-help-overlay" role="presentation" onClick={onClose}>
      <section
        className="piece-help-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={pieceData.name}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="piece-help-visuals" aria-hidden="true">
          <span className={`mini-piece ${player}`}>
            <PieceFace type={type} display={pieceDisplay} lang={lang} />
          </span>
          <RangeIcon type={type} />
        </div>
        <div className="piece-help-copy">
          <strong>{pieceData.name}</strong>
          <span>{pieceData.desc}</span>
          <small>×{count}</small>
        </div>
      </section>
    </div>
  );
}

export function PlayerHand({
  player,
  currentPlayer,
  inventory,
  selectedType,
  phase,
  isComputer,
  pieceDisplay,
  lang,
  copy,
  onChoose,
  onDragStart,
}: {
  player: Player;
  currentPlayer: Player;
  inventory: Record<PieceType, number>;
  selectedType: PieceType | null;
  phase: BattlePhase;
  isComputer: boolean;
  pieceDisplay: PieceDisplay;
  lang: Language;
  copy: PlayerHandCopy;
  onChoose: (type: PieceType) => void;
  onDragStart?: (type: PieceType, event: ReactPointerEvent<HTMLButtonElement>) => void;
}) {
  return (
    <div className="player-hand">
      <div className="inventory">
        {PIECE_TYPES.filter((type) => inventory[type] > 0).map((type) => {
          const pieceData = copy.pieces[type];
          const enabled =
            phase === "placement" &&
            player === currentPlayer &&
            !isComputer &&
            inventory[type] > 0;
          return (
            <PieceTray
              key={type}
              player={player}
              type={type}
              count={inventory[type]}
              selected={selectedType === type}
              enabled={enabled}
              pieceDisplay={pieceDisplay}
              lang={lang}
              pieceData={pieceData}
              ownerLabel={copy.players[player]}
              onChoose={() => onChoose(type)}
              onDragStart={(event) => onDragStart?.(type, event)}
            />
          );
        })}
      </div>
    </div>
  );
}
