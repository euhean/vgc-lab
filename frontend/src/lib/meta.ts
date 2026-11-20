/**
 * Meta threat finder: ranks the most used Pokémon of a format by how much trouble they give a team.
 *
 * Each threat is built with its most common set from Smogon's usage statistics, then every
 * threat is matched against every member of the team with the damage calc:
 *   - how hard it hits each member (its strongest move, as a share of their HP),
 *   - how hard each member hits it back,
 *   - which members it outspeeds.
 * threat score = usage × (average damage it deals − average damage it takes) / 100,
 * so a common Pokémon that hits the team hard and walls it ranks first.
 */
import type { components } from '../api/schema';
import { calcDamage, effectiveSpeed, percentRange, type Conditions } from './battle';
import { gen, getSpecies } from './dex';
import { STATS, type PokemonSet, type StatsTable } from './team';

export type UsagePokemon = components['schemas']['UsagePokemonOut'];
export type UsageReport = components['schemas']['UsageReportOut'];

/** "gen9vgc2024regg" → "VGC 2024 Reg G". Other formats keep their id. */
export function formatName(format: string): string {
  const m = format.match(/^gen9vgc(\d{4})reg([a-z])(bo3)?$/);
  return m ? `VGC ${m[1]} Reg ${m[2].toUpperCase()}${m[3] ? ' Bo3' : ''}` : format;
}

function lookup<T>(kind: string, id: string, get: (id: string) => T | undefined): T {
  const found = get(id);
  if (found === undefined) throw new Error(`Unknown ${kind} in usage data: ${id}`);
  return found;
}

/** "Careful:252/4/0/0/252/0" → nature and EVs. */
export function parseSpread(spread: string): { nature: string; evs: StatsTable } {
  const [nature, points] = spread.split(':');
  const values = points.split('/').map(Number);
  if (values.length !== 6 || values.some(Number.isNaN)) throw new Error(`Invalid spread: ${spread}`);
  return { nature, evs: Object.fromEntries(STATS.map((s, i) => [s, values[i]])) as StatsTable };
}

/** The most common set: top ability, item, Tera type and spread, and the four most common moves. */
export function commonSet(p: UsagePokemon): PokemonSet {
  const species = getSpecies(p.species);
  const first = (key: string) => p.sets[key]?.[0]?.id;
  const item = first('items');
  const tera = first('tera_types');
  const { nature, evs } = parseSpread(lookup('spread', p.species, () => first('spreads')));
  return {
    name: '',
    species: species.name,
    // "nothing" is how the statistics record a Pokémon without an item.
    item: item && item !== 'nothing' ? lookup('item', item, (id) => gen.items.get(id)).name : '',
    ability: lookup('ability', first('abilities') ?? '', (id) => gen.abilities.get(id)).name,
    moves: (p.sets.moves ?? []).slice(0, 4).map(({ id }) => lookup('move', id, (m) => gen.moves.get(m)).name),
    nature,
    gender: '',
    evs,
    ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
    level: 50,
    shiny: false,
    teraType: tera ? lookup('Tera type', tera, (t) => gen.types.get(t)).name : species.types[0],
  };
}

export interface BestHit {
  move: string;
  /** Highest damage roll as a share of the defender's HP, capped at 100. */
  percent: number;
}

/** The attacker's strongest damaging move against the defender, by highest roll. */
export function bestHit(attacker: PokemonSet, defender: PokemonSet, c: Conditions, attackerIsMine: boolean): BestHit | null {
  let best: BestHit | null = null;
  for (const move of attacker.moves) {
    if (gen.moves.get(move)?.category === 'Status') continue;
    const percent = Math.min(100, percentRange(calcDamage(attacker, defender, move, c, attackerIsMine))[1]);
    if (!best || percent > best.percent) best = { move, percent };
  }
  return best;
}

export interface Matchup {
  mine: PokemonSet;
  theirs: BestHit | null;
  yours: BestHit | null;
  /** The threat moves first (slower first under Trick Room). */
  faster: boolean;
}

export interface Threat {
  set: PokemonSet;
  rank: number;
  usage: number;
  /** Average over the team of the threat's best hit, in % of HP. */
  hitsYou: number;
  /** Average over the team of the best hit into the threat, in % of HP. */
  youHit: number;
  /** Team members it can OHKO with its highest roll. */
  ohkos: number;
  outspeeds: number;
  score: number;
  matchups: Matchup[];
}

const average = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

export function rankThreats(team: PokemonSet[], meta: UsagePokemon[], c: Conditions): Threat[] {
  if (team.length === 0) return [];
  const mySpeeds = team.map((set) => effectiveSpeed(set, c, true));
  return meta
    .map((p) => {
      const set = commonSet(p);
      const speed = effectiveSpeed(set, c, false);
      const matchups = team.map((mine, i) => ({
        mine,
        theirs: bestHit(set, mine, c, false),
        yours: bestHit(mine, set, c, true),
        faster: c.trickRoom ? speed < mySpeeds[i] : speed > mySpeeds[i],
      }));
      const hitsYou = average(matchups.map((m) => m.theirs?.percent ?? 0));
      const youHit = average(matchups.map((m) => m.yours?.percent ?? 0));
      return {
        set,
        rank: p.rank,
        usage: p.usage,
        hitsYou,
        youHit,
        ohkos: matchups.filter((m) => m.theirs?.percent === 100).length,
        outspeeds: matchups.filter((m) => m.faster).length,
        score: (p.usage * (hitsYou - youHit)) / 100,
        matchups,
      };
    })
    .sort((a, b) => b.score - a.score);
}
