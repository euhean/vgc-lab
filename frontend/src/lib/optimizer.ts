/**
 * EV spread optimizer.
 *
 * Finds the smallest EV spread that meets a list of benchmarks, the way competitive players
 * build spreads by hand: outspeed or underspeed a target, survive a specific attack, or
 * secure a KO. Items, abilities, stat stages and field conditions all go through the damage
 * calc, so Assault Vest, Choice items, Booster Energy, Intimidate, screens or Tailwind count.
 *
 * Search:
 *   - Speed and offence each depend on a single stat, so the cheapest EV value is found directly.
 *   - Defensive benchmarks share HP. For every HP value, the cheapest Def and SpD that pass are
 *     found by binary search (survival only improves with more bulk), and the split with the
 *     fewest total EVs wins.
 * At level 50 one stat point costs 8 EVs (4 for the first), so only EV values that raise the
 * stat are tried: 0, 4, 12, 20 ... 252 with a 31 IV.
 */
import { calcStat, type Result } from '@smogon/calc';
import type { Generation as CalcGeneration } from '@smogon/calc/dist/data/interface';
import { calcDamage, effectiveSpeed, type Boosts, type Conditions } from './battle';
import { gen, getSpecies, NATURES } from './dex';
import { MAX_STAT_EVS, MAX_TOTAL_EVS, STATS, totalEvs, type PokemonSet, type StatID, type StatsTable } from './team';

export interface SpeedGoal {
  kind: 'outspeed' | 'underspeed';
  target: PokemonSet;
  /** Stat stages, e.g. -1 after Icy Wind or +1 after Dragon Dance. */
  myStage: number;
  targetStage: number;
  myTailwind: boolean;
  targetTailwind: boolean;
}

export interface SurviveGoal {
  kind: 'survive';
  attacker: PokemonSet;
  move: string;
  /** Survive this many hits of the move in a row. */
  hits: 1 | 2;
  /** Stage of the attacker's attacking stat from other effects, e.g. +2 after Swords Dance. */
  attackerStage: number;
  /** The attacker was hit by Intimidate; its ability decides what that does (see intimidateEffect). */
  intimidated: boolean;
  /** Share of damage rolls that must be survived: 1 = every roll, 15/16 = all but the highest. */
  minChance: number;
}

export interface KoGoal {
  kind: 'ko';
  defender: PokemonSet;
  move: string;
  /** KO within this many hits. */
  hits: 1 | 2;
  minChance: number;
}

export type Goal = SpeedGoal | SurviveGoal | KoGoal;

export interface GoalCheck {
  goal: Goal;
  ok: boolean;
  /** Human-readable numbers behind the result, e.g. "Speed 172 vs 163". */
  detail: string;
}

export interface Solution {
  /** The set with the optimized EVs, and the Speed IV and nature when they had to change. */
  set: PokemonSet;
  /** EVs spent on benchmarks, before leftovers were distributed. */
  evsForGoals: number;
  checks: GoalCheck[];
  ok: boolean;
  /** Why no spread could be found, when ok is false. */
  problem?: string;
}

const calcGen = gen as unknown as CalcGeneration;

// ---------------------------------------------------------------------------------------------
// Damage roll distributions

/** Probability of each total damage value. */
type Distribution = Map<number, number>;

function convolve(a: Distribution, b: Distribution): Distribution {
  const out: Distribution = new Map();
  for (const [x, px] of a) {
    for (const [y, py] of b) out.set(x + y, (out.get(x + y) ?? 0) + px * py);
  }
  return out;
}

function uniform(rolls: number[]): Distribution {
  const out: Distribution = new Map();
  for (const r of rolls) out.set(r, (out.get(r) ?? 0) + 1 / rolls.length);
  return out;
}

/**
 * Distribution of the total damage of one use of a move. Every hit of a multi-hit move
 * (e.g. Surging Strikes) rolls independently, so per-hit rolls are convolved.
 */
export function damageDistribution(damage: Result['damage']): Distribution {
  if (typeof damage === 'number') return new Map([[damage, 1]]);
  if (Array.isArray(damage[0])) return (damage as number[][]).map(uniform).reduce(convolve);
  return uniform(damage as number[]);
}

/** Abilities that ignore Sturdy. */
const MOLD_BREAKERS = new Set(['Mold Breaker', 'Teravolt', 'Turboblaze']);

/** What the defender carries that changes whether hits KO, beyond the damage itself. */
export interface Survival {
  /** Focus Sash, or Sturdy not ignored by the attacker: a single hit from full HP leaves 1 HP. */
  endures: boolean;
  /** Sitrus Berry heals 1/4 of max HP once HP falls to half or less. */
  sitrus: boolean;
}

export function survivalTraits(defender: PokemonSet, attacker: PokemonSet): Survival {
  const sturdy = defender.ability === 'Sturdy' && !MOLD_BREAKERS.has(attacker.ability);
  return { endures: defender.item === 'Focus Sash' || sturdy, sitrus: defender.item === 'Sitrus Berry' };
}

/**
 * Probability that `hits` uses of a move KO a defender with `hp` max HP, starting at full HP.
 * Accounts for Focus Sash / Sturdy on the first hit and for a Sitrus Berry between hits.
 * Multi-hit moves count as one use; a Sitrus Berry activating between their hits is ignored.
 */
export function koChance(dist: Distribution, hits: 1 | 2, hp: number, traits: Survival, multiHit: boolean): number {
  const endures = traits.endures && !multiHit;
  let p = 0;
  for (const [first, p1] of dist) {
    if (first >= hp && !endures) {
      p += p1;
      continue;
    }
    if (hits === 1) continue;
    let left = Math.max(1, hp - first);
    if (traits.sitrus && left <= hp / 2) left += Math.floor(hp / 4);
    for (const [second, p2] of dist) if (second >= left) p += p1 * p2;
  }
  return p;
}

// ---------------------------------------------------------------------------------------------
// Stats

/** The EV values that each raise the stat by at least one point, from 0 up to 252. */
export function usefulEvs(set: PokemonSet, stat: StatID): number[] {
  const base = getSpecies(set.species).baseStats[stat];
  const out: number[] = [];
  let last = -1;
  for (let ev = 0; ev <= MAX_STAT_EVS; ev += 4) {
    const value = calcStat(calcGen, stat, base, set.ivs[stat], ev, set.level, set.nature);
    if (value !== last) out.push(ev);
    last = value;
  }
  return out;
}

/** First index in `values` for which `ok` holds, assuming ok is false then true. -1 if none. */
function firstPassing(values: number[], ok: (v: number) => boolean): number {
  let lo = 0;
  let hi = values.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (ok(values[mid])) {
      found = mid;
      hi = mid - 1;
    } else lo = mid + 1;
  }
  return found;
}

function withEvs(set: PokemonSet, evs: Partial<StatsTable>, ivs: Partial<StatsTable> = {}): PokemonSet {
  return { ...set, evs: { ...set.evs, ...evs }, ivs: { ...set.ivs, ...ivs } };
}

// ---------------------------------------------------------------------------------------------
// Goals

/** The attacking stat a move uses, e.g. Def for Body Press. */
export function offensiveStat(move: string): 'atk' | 'spa' | 'def' {
  const data = gen.moves.get(move);
  if (!data) throw new Error(`Unknown move: ${move}`);
  return (data.overrideOffensiveStat as 'atk' | 'def' | undefined) ?? (data.category === 'Physical' ? 'atk' : 'spa');
}

/** The defending stat a move hits, e.g. Def for Psyshock. */
export function defensiveStat(move: string): 'def' | 'spd' {
  const data = gen.moves.get(move);
  if (!data) throw new Error(`Unknown move: ${move}`);
  return (data.overrideDefensiveStat as 'def' | 'spd' | undefined) ?? (data.category === 'Physical' ? 'def' : 'spd');
}

function speedOf(goal: SpeedGoal, set: PokemonSet, c: Conditions): [mine: number, theirs: number] {
  const conditions = {
    ...c,
    mine: { ...c.mine, tailwind: goal.myTailwind },
    theirs: { ...c.theirs, tailwind: goal.targetTailwind },
  };
  return [
    effectiveSpeed(set, conditions, true, { spe: goal.myStage }),
    effectiveSpeed(goal.target, conditions, false, { spe: goal.targetStage }),
  ];
}

/** Abilities that stop Intimidate from lowering Attack (Gen 9). */
const IGNORES_INTIMIDATE = new Set([
  'Clear Body', 'White Smoke', 'Full Metal Body', 'Hyper Cutter', 'Inner Focus', 'Oblivious', 'Own Tempo', 'Scrappy',
  'Mirror Armor',
]);

/**
 * Stat stages Intimidate leaves on a Pokémon, depending on its ability: Defiant and Guard Dog
 * end at +1 Atk, Competitive raises SpA by 2, and several abilities block the drop entirely.
 */
export function intimidateEffect(target: PokemonSet): { boosts: Boosts; note: string } {
  switch (target.ability) {
    case 'Defiant':
      return { boosts: { atk: 1 }, note: 'Defiant: Intimidate leaves it at +1 Atk' };
    case 'Guard Dog':
      return { boosts: { atk: 1 }, note: 'Guard Dog: Intimidate raises its Atk' };
    case 'Competitive':
      return { boosts: { atk: -1, spa: 2 }, note: 'Competitive: Intimidate raises its SpA by 2' };
    default:
      if (IGNORES_INTIMIDATE.has(target.ability)) return { boosts: {}, note: `${target.ability}: Intimidate has no effect` };
      return { boosts: { atk: -1 }, note: '' };
  }
}

const clampStage = (n: number) => Math.max(-6, Math.min(6, n));

function attackerBoosts(goal: SurviveGoal): Boosts {
  const boosts: Boosts = goal.intimidated ? { ...intimidateEffect(goal.attacker).boosts } : {};
  const stat = offensiveStat(goal.move);
  boosts[stat] = clampStage((boosts[stat] ?? 0) + goal.attackerStage);
  return boosts;
}

function isMultiHit(result: Result): boolean {
  return Array.isArray(result.damage) && Array.isArray(result.damage[0]);
}

function surviveChance(goal: SurviveGoal, set: PokemonSet, c: Conditions): { chance: number; result: Result } {
  const result = calcDamage(goal.attacker, set, goal.move, c, false, { attacker: attackerBoosts(goal) });
  const ko = koChance(
    damageDistribution(result.damage), goal.hits, result.defender.maxHP(),
    survivalTraits(set, goal.attacker), isMultiHit(result),
  );
  return { chance: 1 - ko, result };
}

function koChanceOf(goal: KoGoal, set: PokemonSet, c: Conditions): { chance: number; result: Result } {
  const result = calcDamage(set, goal.defender, goal.move, c, true);
  const chance = koChance(
    damageDistribution(result.damage), goal.hits, result.defender.maxHP(),
    survivalTraits(goal.defender, set), isMultiHit(result),
  );
  return { chance, result };
}

function passes(goal: Goal, set: PokemonSet, c: Conditions): boolean {
  switch (goal.kind) {
    case 'outspeed': {
      const [mine, theirs] = speedOf(goal, set, c);
      return mine > theirs;
    }
    case 'underspeed': {
      const [mine, theirs] = speedOf(goal, set, c);
      return mine < theirs;
    }
    case 'survive':
      return surviveChance(goal, set, c).chance >= goal.minChance;
    case 'ko':
      return koChanceOf(goal, set, c).chance >= goal.minChance;
  }
}

const pct = (x: number) => `${Math.round(x * 1000) / 10}%`;

function rangeText(result: Result): string {
  const [min, max] = result.range();
  const hp = result.defender.maxHP();
  return `${min}–${max} damage (${pct(min / hp)}–${pct(max / hp)} of ${hp} HP)`;
}

/** Explains ability and item effects that the damage range alone hides. */
function itemNotes(traits: Survival, hits: 1 | 2, multiHit: boolean, abilityNote: string): string {
  const notes: string[] = abilityNote ? [abilityNote] : [];
  if (traits.endures && !multiHit) notes.push('Focus Sash / Sturdy leaves 1 HP after a single hit from full HP');
  if (traits.sitrus && hits === 2) notes.push('Sitrus Berry heals between hits');
  return notes.length ? ` (${notes.join('; ')})` : '';
}

export function checkGoal(goal: Goal, set: PokemonSet, c: Conditions): GoalCheck {
  switch (goal.kind) {
    case 'outspeed':
    case 'underspeed': {
      const [mine, theirs] = speedOf(goal, set, c);
      return { goal, ok: passes(goal, set, c), detail: `Speed ${mine} vs ${theirs}` };
    }
    case 'survive': {
      const { chance, result } = surviveChance(goal, set, c);
      const intimidate = goal.intimidated ? intimidateEffect(goal.attacker).note : '';
      const notes = itemNotes(survivalTraits(set, goal.attacker), goal.hits, isMultiHit(result), intimidate);
      const hits = goal.hits === 2 ? ' per hit' : '';
      return { goal, ok: chance >= goal.minChance, detail: `Takes ${rangeText(result)}${hits}; survives ${pct(chance)} of rolls${notes}` };
    }
    case 'ko': {
      const { chance, result } = koChanceOf(goal, set, c);
      const notes = itemNotes(survivalTraits(goal.defender, set), goal.hits, isMultiHit(result), '');
      const hits = goal.hits === 2 ? ' per hit' : '';
      return { goal, ok: chance >= goal.minChance, detail: `Deals ${rangeText(result)}${hits}; KOs ${pct(chance)} of rolls${notes}` };
    }
  }
}

const STAGE_STAT: Record<string, string> = { atk: 'Atk', def: 'Def', spa: 'SpA', spd: 'SpD', spe: 'Spe' };
const stageText = (stage: number, stat: string) => (stage === 0 ? '' : ` at ${stage > 0 ? '+' : ''}${stage} ${STAGE_STAT[stat]}`);

/** One-line description of a goal, e.g. "Survive Flutter Mane's Moonblast". */
export function describeGoal(goal: Goal): string {
  switch (goal.kind) {
    case 'outspeed':
    case 'underspeed': {
      const verb = goal.kind === 'outspeed' ? 'Outspeed' : 'Underspeed (Trick Room)';
      const tailwind = [goal.myTailwind && 'my Tailwind', goal.targetTailwind && 'their Tailwind'].filter(Boolean).join(', ');
      return `${verb} ${goal.target.species}${stageText(goal.targetStage, 'spe')}` +
        `${goal.myStage ? `, me${stageText(goal.myStage, 'spe')}` : ''}${tailwind ? ` (${tailwind})` : ''}`;
    }
    case 'survive':
      return `Survive ${goal.hits === 2 ? 'two of ' : ''}${goal.attacker.species}'s ${goal.move}` +
        `${stageText(goal.attackerStage, offensiveStat(goal.move))}${goal.intimidated ? ' after Intimidate' : ''}` +
        `${goal.minChance < 1 ? ' (15 of 16 rolls)' : ''}`;
    case 'ko':
      return `${goal.hits === 1 ? 'OHKO' : '2HKO'} ${goal.defender.species} with ${goal.move}` +
        `${goal.minChance < 1 ? ' (15 of 16 rolls)' : ''}`;
  }
}

// ---------------------------------------------------------------------------------------------
// Search

export interface OptimizeOptions {
  /** Where EVs left over after the benchmarks go, in order. */
  leftoverTo: StatID[];
}

function unreachable(set: PokemonSet, goals: Goal[], c: Conditions, problem: string): Solution {
  return { set, evsForGoals: 0, checks: goals.map((g) => checkGoal(g, set, c)), ok: false, problem };
}

/** Finds the cheapest spread for `set` (keeping its nature) that passes every goal. */
export function optimize(set: PokemonSet, goals: Goal[], c: Conditions, options: OptimizeOptions): Solution {
  let current = withEvs(set, { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 });
  const allPass = (s: PokemonSet, gs: Goal[]) => gs.every((g) => passes(g, s, c));

  // 1. Speed: the cheapest Speed EVs, lowering the Speed IV only for Trick Room benchmarks.
  const speedGoals = goals.filter((g): g is SpeedGoal => g.kind === 'outspeed' || g.kind === 'underspeed');
  if (speedGoals.length > 0) {
    const speEv = usefulEvs(current, 'spe').find((ev) => allPass(withEvs(current, { spe: ev }), speedGoals));
    if (speEv !== undefined) current = withEvs(current, { spe: speEv });
    else {
      const hasUnderspeed = speedGoals.some((g) => g.kind === 'underspeed');
      const ivs = hasUnderspeed ? Array.from({ length: current.ivs.spe }, (_, i) => current.ivs.spe - 1 - i) : [];
      const iv = ivs.find((v) => allPass(withEvs(current, { spe: 0 }, { spe: v }), speedGoals));
      if (iv === undefined) {
        const fastest = withEvs(current, { spe: MAX_STAT_EVS });
        const slowest = withEvs(current, { spe: 0 }, { spe: 0 });
        const impossible = speedGoals
          .filter((g) => !passes(g, g.kind === 'outspeed' ? fastest : slowest, c))
          .map(describeGoal);
        const problem = impossible.length > 0
          ? `Not reachable with this nature and item: ${impossible.join('; ')}.`
          : 'The speed benchmarks contradict each other: no single Speed meets all of them.';
        return unreachable(set, goals, c, problem);
      }
      current = withEvs(current, { spe: 0 }, { spe: iv });
    }
  }

  // 2. Offence: per attacking stat, the cheapest EVs that secure every KO using it.
  const koGoals = goals.filter((g): g is KoGoal => g.kind === 'ko');
  const floors: Partial<Record<StatID, number>> = {};
  for (const stat of ['atk', 'spa', 'def'] as const) {
    const statGoals = koGoals.filter((g) => offensiveStat(g.move) === stat);
    if (statGoals.length === 0) continue;
    const evs = usefulEvs(current, stat);
    const i = firstPassing(evs, (ev) => allPass(withEvs(current, { [stat]: ev }), statGoals));
    if (i < 0) {
      const maxed = withEvs(current, { [stat]: MAX_STAT_EVS });
      const impossible = statGoals.filter((g) => !passes(g, maxed, c)).map(describeGoal);
      return unreachable(set, goals, c, `Not even 252 EVs reach: ${impossible.join('; ')}.`);
    }
    floors[stat] = evs[i];
    current = withEvs(current, { [stat]: evs[i] });
  }

  // 3. Defence: try every HP value and keep the cheapest HP / Def / SpD split.
  const surviveGoals = goals.filter((g): g is SurviveGoal => g.kind === 'survive');
  if (surviveGoals.length > 0) {
    let best: { hp: number; def: number; spd: number; total: number; bulk: number } | null = null;
    for (const hp of usefulEvs(current, 'hp')) {
      let spread = withEvs(current, { hp });
      const picked: Partial<Record<'def' | 'spd', number>> = {};
      let reachable = true;
      for (const stat of ['def', 'spd'] as const) {
        const statGoals = surviveGoals.filter((g) => defensiveStat(g.move) === stat);
        const floor = floors[stat] ?? 0;
        const evs = usefulEvs(spread, stat).filter((ev) => ev >= floor);
        const i = statGoals.length === 0 ? 0 : firstPassing(evs, (ev) => allPass(withEvs(spread, { [stat]: ev }), statGoals));
        if (i < 0) {
          reachable = false;
          break;
        }
        picked[stat] = evs[i];
        spread = withEvs(spread, { [stat]: evs[i] });
      }
      if (!reachable) continue;
      const total = hp + picked.def! + picked.spd!;
      // Among equally cheap splits, prefer the bulkiest one.
      const s = toStats(spread);
      const bulk = s.hp * s.def + s.hp * s.spd;
      if (!best || total < best.total || (total === best.total && bulk > best.bulk)) {
        best = { hp, def: picked.def!, spd: picked.spd!, total, bulk };
      }
    }
    if (!best) {
      const maxed = withEvs(current, { hp: MAX_STAT_EVS, def: MAX_STAT_EVS, spd: MAX_STAT_EVS });
      const impossible = surviveGoals.filter((g) => !passes(g, maxed, c)).map(describeGoal);
      const problem = impossible.length > 0
        ? `Not even 252 HP and 252 Def / SpD reach: ${impossible.join('; ')}.`
        : 'Each survival benchmark is reachable alone, but not all of them with the same HP.';
      return unreachable(set, goals, c, problem);
    }
    current = withEvs(current, { hp: best.hp, def: best.def, spd: best.spd });
  }

  const evsForGoals = totalEvs(current.evs);
  if (evsForGoals > MAX_TOTAL_EVS) {
    return unreachable(
      withEvs(set, current.evs, current.ivs), goals, c,
      `These benchmarks need ${evsForGoals} EVs, but a Pokémon can only have ${MAX_TOTAL_EVS}.`,
    );
  }

  // 4. Leftovers, never into Speed when a Trick Room benchmark needs it low.
  const keepSlow = speedGoals.some((g) => g.kind === 'underspeed');
  let remaining = MAX_TOTAL_EVS - evsForGoals;
  for (const stat of options.leftoverTo) {
    if (stat === 'spe' && keepSlow) continue;
    const have = current.evs[stat];
    const target = usefulEvs(current, stat).filter((ev) => ev >= have && ev - have <= remaining).pop();
    if (target === undefined || target === have) continue;
    remaining -= target - have;
    current = withEvs(current, { [stat]: target });
  }

  const checks = goals.map((g) => checkGoal(g, current, c));
  return { set: current, evsForGoals, checks, ok: checks.every((ch) => ch.ok) };
}

/**
 * Runs the optimizer with every nature and returns the spreads that meet all goals,
 * cheapest first. Natures that keep the set's current one win ties.
 */
export function optimizeNatures(set: PokemonSet, goals: Goal[], c: Conditions, options: OptimizeOptions): Solution[] {
  // Neutral natures never beat a nature that lowers an unused stat, so only the current one is kept.
  return NATURES
    .filter((n) => n.plus !== n.minus || n.name === set.nature)
    .map((n) => optimize({ ...set, nature: n.name }, goals, c, options))
    .filter((s) => s.ok)
    .sort((a, b) => a.evsForGoals - b.evsForGoals || Number(b.set.nature === set.nature) - Number(a.set.nature === set.nature));
}

/** Final stats of a set at its level, nature, IVs and EVs. */
export function toStats(set: PokemonSet): StatsTable {
  const base = getSpecies(set.species).baseStats;
  return Object.fromEntries(
    STATS.map((s) => [s, calcStat(calcGen, s, base[s], set.ivs[s], set.evs[s], set.level, set.nature)]),
  ) as StatsTable;
}
