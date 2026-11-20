/** Shared battle setup for live battles (live.mjs) and win-rate simulations (simulate.mjs). */
import { BattleStreams, PRNG, Teams } from '@pkmn/sim';
import { HeuristicAI } from './ai.mjs';

/** The last Scarlet/Violet VGC format the simulator has, matching the app's sets. */
export const FORMAT = 'gen9vgc2024regg';
/** Battles that drag on past this turn are called a tie. */
export const MAX_TURNS = 100;

/** A Showdown paste in Showdown's packed team format. */
export function packTeam(paste) {
  const sets = Teams.import(paste);
  if (!sets || sets.length === 0) throw new Error('The team is empty or not a valid Showdown paste');
  return Teams.pack(sets);
}

/** A new battle with its player streams, started with both teams. */
export function startBattle({ p1, p2, seed = PRNG.generateSeed(), names = ['p1', 'p2'] }) {
  const stream = new BattleStreams.BattleStream();
  const streams = BattleStreams.getPlayerStreams(stream);
  void streams.omniscient.write(
    `>start ${JSON.stringify({ formatid: FORMAT, seed })}\n` +
    `>player p1 ${JSON.stringify({ name: names[0], team: packTeam(p1) })}\n` +
    `>player p2 ${JSON.stringify({ name: names[1], team: packTeam(p2) })}`,
  );
  return { stream, streams };
}

/**
 * Reads the full battle log until the battle ends, forcing a tie after MAX_TURNS.
 * Returns the winning side ('p1' or 'p2'), or null for a tie.
 */
export async function watch(stream, omniscient) {
  for await (const chunk of omniscient) {
    const turn = chunk.match(/\n\|turn\|(\d+)/);
    if (turn && Number(turn[1]) > MAX_TURNS) void omniscient.write('>forcetie');
  }
  const { battle } = stream;
  if (!battle.ended) throw new Error('The battle stream closed before the battle ended');
  return battle.sides.find((s) => s.name === battle.winner)?.id ?? null;
}

/** A new seed drawn from a PRNG, so a run with a fixed seed is reproducible. */
export const seedFrom = (prng) => [0, 0, 0, 0].map(() => prng.random(2 ** 16)).join(',');

/** Plays one battle with the heuristic AI on both sides. */
export async function playAiBattle(p1, p2, seed) {
  const prng = new PRNG(seed);
  const { stream, streams } = startBattle({ p1, p2, seed: seedFrom(prng) });
  for (const id of ['p1', 'p2']) void new HeuristicAI(streams[id], stream, id, seedFrom(prng)).start();
  return watch(stream, streams.omniscient);
}
