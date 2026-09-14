import { generatePuzzleCandidates } from "../lib/game/puzzleGenerator.ts";

function argument(name: string, fallback: string) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) ?? fallback;
}

const seed = argument("seed", "COLLAPSE-PUZZLES-V1");
const count = Number(argument("count", "5"));
const attempts = Number(argument("attempts", "25000"));
const minHandSize = Number(argument("min-hand", "4"));
const maxHandSize = Number(argument("max-hand", "7"));
const minCollapseRounds = Number(argument("min-rounds", "3"));
const summaryOnly = process.argv.includes("--summary");

const puzzles = generatePuzzleCandidates({ seed, count, attempts, minHandSize, maxHandSize, minCollapseRounds });
const output = summaryOnly
  ? {
      seed,
      generated: puzzles.length,
      scores: puzzles.map((puzzle) => puzzle.generation.score),
      handSizes: puzzles.map((puzzle) => puzzle.generation.handSize),
      enemyFormationSizes: puzzles.map((puzzle) => puzzle.generation.enemyFormationSize),
      sampledWinRates: puzzles.map((puzzle) => puzzle.generation.estimatedWinRate),
      collapseRounds: puzzles.map((puzzle) => puzzle.generation.collapseRounds),
    }
  : { seed, generated: puzzles.length, puzzles };
process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
