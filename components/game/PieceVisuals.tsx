import {
  GiBroadsword,
  GiCannon,
  GiCavalry,
  GiCrossbow,
  GiHalberd,
  GiHorseHead,
  GiGuardedTower,
  GiMusket,
  GiShield,
  GiStoneCrafting,
  GiTwoHandedSword,
} from "react-icons/gi";
import type { IconType } from "react-icons";
import { cellKey } from "../../lib/game/board";
import { PIECE_CONFIG } from "../../lib/game/pieces";
import type { Direction, PieceType } from "../../lib/game/types";

export type Language = "zh" | "en";
export type PieceDisplay = "icon";

function rotateOffset(dr: number, dc: number, direction: Direction) {
  if (direction === "right") return [dc, -dr] as const;
  if (direction === "down") return [-dr, -dc] as const;
  if (direction === "left") return [-dc, dr] as const;
  return [dr, dc] as const;
}

const PIECE_ICONS: Record<
  Exclude<PieceType, "scout" | "archer" | "fortress" | "ram" | "selector">,
  IconType
> = {
  guard: GiBroadsword,
  cannon: GiCannon,
  knight: GiHorseHead,
  shield: GiShield,
  crossbow: GiCrossbow,
  lancer: GiTwoHandedSword,
  musket: GiMusket,
  charger: GiCavalry,
  halberd: GiHalberd,
  sentry: GiGuardedTower,
  mason: GiStoneCrafting,
};

export function RangeIcon({
  type,
  direction = "up",
}: {
  type: PieceType;
  direction?: Direction;
}) {
  if (type === "selector") {
    return (
      <span className="range-icon selector-ability-icon" aria-hidden="true">
        <i className="selector-reticle" />
        <i className="selector-pip selector-pip-one" />
        <i className="selector-pip selector-pip-two" />
        <i className="selector-pip selector-pip-three" />
        <i className="selector-pip selector-pip-four" />
        <b>4</b>
      </span>
    );
  }

  if (type === "crossbow") {
    return (
      <span className="range-icon crossbow-ability-icon" aria-hidden="true">
        <i className="crossbow-ray crossbow-ray-horizontal" />
        <i className="crossbow-ray crossbow-ray-vertical" />
        <i className="crossbow-stop crossbow-stop-up" />
        <i className="crossbow-stop crossbow-stop-right" />
        <i className="crossbow-stop crossbow-stop-down" />
        <i className="crossbow-stop crossbow-stop-left" />
        <i className="crossbow-origin" />
      </span>
    );
  }

  if (type === "cannon") {
    return (
      <span className="range-icon cannon-ability-icon" aria-hidden="true">
        <i className="cannon-origin" />
        <i className="cannon-screen cannon-screen-up" />
        <i className="cannon-screen cannon-screen-right" />
        <i className="cannon-screen cannon-screen-down" />
        <i className="cannon-screen cannon-screen-left" />
        <i className="cannon-ray cannon-ray-up" />
        <i className="cannon-ray cannon-ray-right" />
        <i className="cannon-ray cannon-ray-down" />
        <i className="cannon-ray cannon-ray-left" />
        <i className="cannon-target cannon-target-up" />
        <i className="cannon-target cannon-target-right" />
        <i className="cannon-target cannon-target-down" />
        <i className="cannon-target cannon-target-left" />
      </span>
    );
  }

  if (type === "musket") {
    return (
      <span className={`range-icon musket-ability-icon direction-${direction}`} aria-hidden="true">
        <i className="musket-origin" />
        <i className="musket-ray" />
        <i className="musket-ray-head" />
      </span>
    );
  }

  const directional = type === "shield" || type === "halberd" || type === "ram" || type === "charger";
  const gridSize = type === "ram" ? 7 : 5;
  const gridCenter = Math.floor(gridSize / 2);
  const targets = new Set(
    PIECE_CONFIG[type].offsets.map(([row, col]) => {
      const [nextRow, nextCol] = directional ? rotateOffset(row, col, direction) : [row, col];
      return cellKey(nextRow + gridCenter, nextCol + gridCenter);
    }),
  );
  if (type === "sentry") {
    for (const key of [cellKey(1, 2), cellKey(2, 1), cellKey(2, 3), cellKey(3, 2)]) {
      targets.add(key);
    }
  }
  if (type === "mason") {
    for (const key of [cellKey(1, 2), cellKey(2, 1), cellKey(2, 3)]) {
      targets.add(key);
    }
  }

  const screens = type === "sentry" || type === "mason" ? new Set(["2-2"]) : new Set<string>();
  return (
    <span className={`range-icon ${gridSize === 7 ? "range-icon-7" : ""}`} aria-hidden="true">
      {Array.from({ length: gridSize * gridSize }, (_, index) => {
        const row = Math.floor(index / gridSize);
        const col = index % gridSize;
        const isOrigin = type === "mason"
          ? row === 3 && col === 2
          : type !== "sentry" && row === gridCenter && col === gridCenter;
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

function PieceIcon({ type, direction }: { type: PieceType; direction?: Direction }) {
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

  if (type === "selector") {
    return (
      <svg className="piece-icon icon-selector" viewBox="0 0 64 64" aria-hidden="true">
        <g transform="rotate(-18 32 32)">
          <path d="M20 6c17 13 17 39 0 52" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
          <path d="m20 6-9 26 9 26" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" />
          {[20, 28, 36, 44].map((y) => (
            <g key={y}>
              <path d={`M13 ${y}h39`} fill="none" stroke="currentColor" strokeWidth="2.7" strokeLinecap="round" />
              <path fill="currentColor" d={`m60 ${y}-10-6v12l10-6Z`} />
            </g>
          ))}
        </g>
      </svg>
    );
  }

  if (type === "ram") {
    const rotation = direction === "right" ? 90 : direction === "down" ? 180 : direction === "left" ? -90 : 0;
    return (
      <svg className="piece-icon icon-ram" viewBox="0 0 64 64" aria-hidden="true">
        <g transform={`rotate(${rotation} 32 32)`}>
          <rect x="15" y="15" width="34" height="40" rx="5" fill="none" stroke="currentColor" strokeWidth="5" />
          <rect x="7" y="19" width="9" height="12" rx="3" fill="currentColor" />
          <rect x="48" y="19" width="9" height="12" rx="3" fill="currentColor" />
          <rect x="7" y="40" width="9" height="12" rx="3" fill="currentColor" />
          <rect x="48" y="40" width="9" height="12" rx="3" fill="currentColor" />
          <path d="M32 55V9" fill="none" stroke="currentColor" strokeWidth="7" strokeLinecap="round" />
          <rect x="23" y="5" width="18" height="10" rx="4" fill="currentColor" />
          <path d="m19 46 26-25M45 46 19 21" fill="none" stroke="currentColor" strokeWidth="2.5" />
        </g>
      </svg>
    );
  }

  if (type === "charger") {
    return <span className="piece-icon icon-charger-composite">
      <GiCavalry className="charger-rider" aria-hidden="true" />
      <svg className="charger-lance" viewBox="0 0 64 64" aria-hidden="true">
        <path fill="currentColor" d="m26 28 6 7L62 6 26 28Z" />
        <circle cx="28" cy="32" r="6" fill="none" stroke="currentColor" strokeWidth="3.5" />
      </svg>
    </span>;
  }

  const Icon = PIECE_ICONS[type];
  return <Icon className={`piece-icon icon-${type}`} aria-hidden="true" />;
}

export function PieceFace({
  type,
  display,
  lang,
  direction,
}: {
  type: PieceType;
  display: PieceDisplay;
  lang: Language;
  direction?: Direction;
}) {
  const face = <PieceIcon type={type} direction={direction} />;

  if (type === "lancer") {
    return <span className="longsword-face">{face}</span>;
  }

  if (type !== "musket" && type !== "shield" && type !== "halberd" && type !== "ram" && type !== "charger") return face;
  return <span className="piece-facing">
    {face}
    {direction && <i className={`piece-facing-arrow direction-${direction}`} aria-hidden="true" />}
  </span>;
}
