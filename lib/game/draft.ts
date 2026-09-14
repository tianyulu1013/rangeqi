import { createSeededRandom, deriveSeed } from "./random.ts";
import type { PieceType } from "./types.ts";

export type DraftOffer = [PieceType, PieceType, PieceType];
export type DraftTier = "core" | "advanced" | "elite";

export type DraftState = {
  round: number;
  offers: DraftOffer[];
  redRoster: PieceType[];
  blueRoster: PieceType[];
  redChoice: PieceType | null;
  blueChoice: PieceType | null;
};

export const DRAFT_TIER_SCHEDULE: readonly DraftTier[] = [
  "core", "core", "advanced", "core", "core",
  "advanced", "elite", "core", "core", "advanced",
];

export const DRAFT_POOLS: Record<DraftTier, readonly PieceType[]> = {
  core: ["guard", "scout", "archer", "knight", "shield", "halberd"],
  advanced: ["cannon", "musket", "crossbow", "lancer", "sentry", "ram", "engineer"],
  elite: ["fortress", "selector", "charger"],
};

export function getDraftTier(round: number): DraftTier {
  return DRAFT_TIER_SCHEDULE[round] ?? DRAFT_TIER_SCHEDULE.at(-1)!;
}

function offerKey(offer: DraftOffer) {
  return [...offer].sort().join("|");
}

function isValidOffer(offer: DraftOffer, previous: DraftOffer | undefined) {
  return (
    new Set(offer).size === 3 &&
    offerKey(offer) !== (previous ? offerKey(previous) : "")
  );
}

export function generateDraftOffers(seed: string, rounds = DRAFT_TIER_SCHEDULE.length): DraftOffer[] {
  const random = createSeededRandom(deriveSeed(seed, "draft"));
  const offers: DraftOffer[] = [];
  let engineerOffered = false;

  for (let round = 0; round < rounds; round += 1) {
    const tierPool = DRAFT_POOLS[getDraftTier(round)];
    const pool = engineerOffered
      ? tierPool.filter((type) => type !== "engineer")
      : tierPool;
    let offer: DraftOffer | null = null;
    for (let attempt = 0; attempt < 100 && !offer; attempt += 1) {
      const candidate = random.shuffle(pool).slice(0, 3) as DraftOffer;
      if (isValidOffer(candidate, offers.at(-1))) offer = candidate;
    }

    if (!offer) {
      offer = pool.slice(0, 3) as DraftOffer;
    }
    offers.push(offer);
    if (offer.includes("engineer")) engineerOffered = true;
  }

  return offers;
}

export function generateDraftAiChoices(
  offers: readonly DraftOffer[],
  seed: string,
): PieceType[] {
  const random = createSeededRandom(deriveSeed(seed, "draft-ai"));
  const roster: PieceType[] = [];

  for (const offer of offers) {
    const scores = offer.map((type) => {
      const count = roster.filter((item) => item === type).length;
      return { type, score: -count * 0.7 };
    });
    const bestScore = Math.max(...scores.map((item) => item.score));
    const best = scores
      .filter((item) => item.score === bestScore)
      .map((item) => item.type);
    const choice = random.pick(best);
    roster.push(choice);
  }

  return roster;
}
