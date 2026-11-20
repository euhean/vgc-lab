/**
 * Monte Carlo win rate: plays `games` battles between two teams with the heuristic AI on both
 * sides and counts the results.
 *
 * Reads {"p1": paste, "p2": paste, "games": n, "seed"?: "a,b,c,d"} as JSON on stdin and writes
 * {"games", "wins", "losses", "ties"} (from p1's side) as JSON on stdout.
 */
import { PRNG } from '@pkmn/sim';
import { playAiBattle, seedFrom } from './battle.mjs';

export async function simulate({ p1, p2, games, seed = PRNG.generateSeed() }) {
  if (!Number.isInteger(games) || games < 1) throw new Error('games must be a positive integer');
  const prng = new PRNG(seed);
  const result = { games, wins: 0, losses: 0, ties: 0 };
  for (let i = 0; i < games; i++) {
    const winner = await playAiBattle(p1, p2, seedFrom(prng));
    if (winner === 'p1') result.wins++;
    else if (winner === 'p2') result.losses++;
    else result.ties++;
  }
  return result;
}

if (import.meta.main) {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const result = await simulate(JSON.parse(Buffer.concat(chunks).toString()));
  process.stdout.write(`${JSON.stringify(result)}\n`);
}
