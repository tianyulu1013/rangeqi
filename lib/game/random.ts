const SEED_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export type MatchSeed = string;

export type SeededRandom = {
  next: () => number;
  integer: (min: number, max: number) => number;
  pick: <T>(items: readonly T[]) => T;
  shuffle: <T>(items: readonly T[]) => T[];
};

function hashSeed(seed: string) {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function createSeededRandom(seed: MatchSeed): SeededRandom {
  let state = hashSeed(seed);

  function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  }

  function integer(min: number, max: number) {
    if (max < min) throw new Error("Seeded random range is invalid");
    return Math.floor(next() * (max - min + 1)) + min;
  }

  function pick<T>(items: readonly T[]) {
    if (items.length === 0) throw new Error("Cannot pick from an empty list");
    return items[integer(0, items.length - 1)];
  }

  function shuffle<T>(items: readonly T[]) {
    const result = [...items];
    for (let index = result.length - 1; index > 0; index -= 1) {
      const swapIndex = integer(0, index);
      [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
    }
    return result;
  }

  return { next, integer, pick, shuffle };
}

export function deriveSeed(rootSeed: MatchSeed, scope: string): MatchSeed {
  return `${rootSeed}:${scope}`;
}

export function createMatchSeed(): MatchSeed {
  const values = new Uint32Array(2);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(values);
  } else {
    values[0] = Date.now() >>> 0;
    values[1] = Math.floor(Math.random() * 0xffffffff) >>> 0;
  }

  let seed = "";
  let state = values[0] ^ values[1];
  for (let index = 0; index < 8; index += 1) {
    state = Math.imul(state ^ (state >>> 13), 0x5bd1e995) >>> 0;
    seed += SEED_ALPHABET[state % SEED_ALPHABET.length];
  }
  return seed;
}
