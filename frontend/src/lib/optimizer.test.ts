import { describe, expect, it } from 'vitest';
import { calcDamage, DEFAULT_CONDITIONS as C } from './battle';
import {
  checkGoal, damageDistribution, koChance, optimize, optimizeNatures, toStats, usefulEvs, type Goal, type OptimizeOptions,
} from './optimizer';
import { newSet, totalEvs, type PokemonSet, type StatsTable } from './team';

const evs = (o: Partial<StatsTable> = {}): StatsTable => ({ hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0, ...o });
const mk = (species: string, o: Partial<PokemonSet>): PokemonSet => ({ ...newSet(species), ...o });
const noLeftovers: OptimizeOptions = { leftoverTo: [] };

// Common Scarlet/Violet VGC threats.
const flutter = mk('Flutter Mane', {
  nature: 'Modest', item: 'Booster Energy', ability: 'Protosynthesis', evs: evs({ spa: 252, spe: 252 }), moves: ['Moonblast'],
});
const specsFlutter = mk('Flutter Mane', { nature: 'Modest', item: 'Choice Specs', ability: 'Protosynthesis', moves: ['Moonblast'] });
const kingambit = mk('Kingambit', { nature: 'Adamant', item: 'Black Glasses', ability: 'Defiant', evs: evs({ hp: 252, atk: 252 }), moves: ['Kowtow Cleave'] });
const rillaboom = mk('Rillaboom', { nature: 'Adamant', item: 'Assault Vest', ability: 'Grassy Surge', evs: evs({ hp: 252, atk: 252 }), moves: ['Wood Hammer'] });
const chienPao = mk('Chien-Pao', { nature: 'Jolly', item: 'Focus Sash', ability: 'Sword of Ruin', evs: evs({ atk: 252, spe: 252 }), moves: ['Icicle Crash'] });
const hatterene = mk('Hatterene', { nature: 'Quiet', moves: ['Psychic'] });
const incineroar = mk('Incineroar', { nature: 'Careful', item: 'Sitrus Berry', ability: 'Intimidate', moves: ['Flare Blitz'] });
const amoonguss = mk('Amoonguss', { nature: 'Relaxed', item: 'Rocky Helmet', ability: 'Regenerator', moves: ['Pollen Puff'] });

const outspeedRilla: Goal = { kind: 'outspeed', target: rillaboom, myStage: 0, targetStage: 0, myTailwind: false, targetTailwind: false };
const twoMoonblasts: Goal = { kind: 'survive', attacker: flutter, move: 'Moonblast', hits: 2, attackerStage: 0, intimidated: false, minChance: 1 };

/** The previous useful EV value of a stat, i.e. one stat point less. */
function oneStepLess(set: PokemonSet, stat: keyof StatsTable): PokemonSet {
  const values = usefulEvs(set, stat);
  const lower = values[values.indexOf(set.evs[stat]) - 1];
  return { ...set, evs: { ...set.evs, [stat]: lower } };
}

describe('level 50 EV steps', () => {
  it('only tries EV values that raise the stat: 4, then every 8', () => {
    const values = usefulEvs(incineroar, 'hp');
    expect(values.slice(0, 4)).toEqual([0, 4, 12, 20]);
    expect(values.at(-1)).toBe(252);
    expect(values).toHaveLength(33);
  });

  it('shifts to multiples of 8 with an even IV', () => {
    const values = usefulEvs({ ...incineroar, ivs: { ...incineroar.ivs, spe: 30 } }, 'spe');
    expect(values.slice(0, 3)).toEqual([0, 8, 16]);
    expect(values.at(-1)).toBe(248);
  });
});

describe('damage rolls', () => {
  it('combines the rolls of every hit of a multi-hit move', () => {
    const urshifu = mk('Urshifu-Rapid-Strike', { nature: 'Adamant', item: 'Choice Band', evs: evs({ atk: 252 }) });
    const result = calcDamage(urshifu, incineroar, 'Surging Strikes', C, true);
    const dist = damageDistribution(result.damage);
    const totals = [...dist.keys()];
    expect(Math.min(...totals)).toBe(result.range()[0]);
    expect(Math.max(...totals)).toBe(result.range()[1]);
    expect([...dist.values()].reduce((a, b) => a + b)).toBeCloseTo(1);
  });

  it('lets Focus Sash survive a single hit from full HP, but not a multi-hit move', () => {
    const dist = new Map([[150, 1]]);
    const sash = { endures: true, sitrus: false };
    expect(koChance(dist, 1, 100, sash, false)).toBe(0);
    expect(koChance(dist, 1, 100, sash, true)).toBe(1);
    expect(koChance(dist, 2, 100, sash, false)).toBe(1);
  });

  it('heals a quarter of max HP with Sitrus Berry between two hits', () => {
    const dist = new Map([[60, 1]]);
    // 100 HP: the first hit leaves 40, Sitrus heals 25 back to 65, so the second 60 doesn't KO.
    expect(koChance(dist, 2, 100, { endures: false, sitrus: true }, false)).toBe(0);
    expect(koChance(dist, 2, 100, { endures: false, sitrus: false }, false)).toBe(1);
  });
});

describe('speed benchmarks', () => {
  it('spends just enough Speed EVs to outspeed by one point', () => {
    const { set, ok } = optimize(incineroar, [outspeedRilla], C, noLeftovers);
    expect(ok).toBe(true);
    expect(set.evs.spe).toBe(204);
    expect(checkGoal(outspeedRilla, set, C).detail).toBe('Speed 106 vs 105');
    // One stat point less only ties, which is not outspeeding.
    expect(checkGoal(outspeedRilla, oneStepLess(set, 'spe'), C).ok).toBe(false);
  });

  it('lowers the Speed IV for Trick Room when 0 EVs are not slow enough', () => {
    const underspeed: Goal = { kind: 'underspeed', target: hatterene, myStage: 0, targetStage: 0, myTailwind: false, targetTailwind: false };
    const { set, ok, checks } = optimize(amoonguss, [underspeed], C, { leftoverTo: ['spe', 'hp'] });
    expect(ok).toBe(true);
    expect(set.ivs.spe).toBe(27);
    expect(set.evs.spe).toBe(0); // leftovers never go into Speed under a Trick Room benchmark
    expect(checks[0].detail).toBe('Speed 43 vs 44');
  });

  it('reports a speed benchmark that no investment reaches', () => {
    const result = optimize(amoonguss, [{ ...outspeedRilla, target: chienPao }], C, noLeftovers);
    expect(result.ok).toBe(false);
    expect(result.problem).toContain('Outspeed Chien-Pao');
  });
});

describe('defensive benchmarks', () => {
  it('finds the cheapest HP / SpD split, counting Sitrus Berry between hits', () => {
    const { set, ok, evsForGoals } = optimize(incineroar, [twoMoonblasts], C, noLeftovers);
    expect(ok).toBe(true);
    expect(evsForGoals).toBe(set.evs.hp + set.evs.spd);
    expect(set.evs.hp).toBeGreaterThan(0);
    expect(set.evs.spd).toBeGreaterThan(0);
    // Every invested stat is needed: one point less in either of them fails.
    for (const stat of ['hp', 'spd'] as const) {
      expect(checkGoal(twoMoonblasts, oneStepLess(set, stat), C).ok).toBe(false);
    }
    // And without the berry the same spread doesn't hold.
    expect(checkGoal(twoMoonblasts, { ...set, item: 'Leftovers' }, C).ok).toBe(false);
  });

  it('explains when a benchmark is out of reach even at maximum bulk', () => {
    const noBerry = { ...incineroar, item: 'Safety Goggles' };
    const result = optimize(noBerry, [twoMoonblasts], C, noLeftovers);
    expect(result.ok).toBe(false);
    expect(result.problem).toContain("Survive two of Flutter Mane's Moonblast");
  });

  it('accounts for Intimidate, including abilities that turn it around', () => {
    const rillaHit: Goal = { kind: 'survive', attacker: rillaboom, move: 'Wood Hammer', hits: 2, attackerStage: 0, intimidated: false, minChance: 1 };
    const plain = optimize(amoonguss, [rillaHit], C, noLeftovers);
    const intimidated = optimize(amoonguss, [{ ...rillaHit, intimidated: true }], C, noLeftovers);
    expect(intimidated.evsForGoals).toBeLessThanOrEqual(plain.evsForGoals);

    // Defiant Kingambit ends at +1 Atk after Intimidate, so it hits harder, not softer.
    const kowtow: Goal = { kind: 'survive', attacker: kingambit, move: 'Kowtow Cleave', hits: 1, attackerStage: 0, intimidated: false, minChance: 1 };
    const normal = checkGoal(kowtow, incineroar, C);
    const defiant = checkGoal({ ...kowtow, intimidated: true }, incineroar, C);
    expect(defiant.detail).toContain('Defiant');
    const maxDamage = (detail: string) => Number(detail.match(/–(\d+) damage/)![1]);
    expect(maxDamage(defiant.detail)).toBeGreaterThan(maxDamage(normal.detail));
  });
});

describe('offensive benchmarks', () => {
  it('spends the minimum SpA for a guaranteed 2HKO through Assault Vest', () => {
    const goal: Goal = { kind: 'ko', defender: rillaboom, move: 'Moonblast', hits: 2, minChance: 1 };
    const { set, ok } = optimize(specsFlutter, [goal], C, noLeftovers);
    expect(ok).toBe(true);
    expect(set.evs.spa).toBe(36);
    expect(checkGoal(goal, oneStepLess(set, 'spa'), C).ok).toBe(false);
  });

  it('knows Focus Sash prevents a single-hit OHKO', () => {
    const goal: Goal = { kind: 'ko', defender: chienPao, move: 'Moonblast', hits: 1, minChance: 1 };
    const result = optimize(flutter, [goal], C, noLeftovers);
    expect(result.ok).toBe(false);
    expect(result.checks[0].detail).toContain('Focus Sash');
  });
});

describe('the whole spread', () => {
  it('meets speed and bulk benchmarks together within 510 EVs and gives leftovers away', () => {
    const goals = [outspeedRilla, twoMoonblasts];
    const { set, ok, evsForGoals } = optimize(incineroar, goals, C, { leftoverTo: ['hp', 'def'] });
    expect(ok).toBe(true);
    expect(evsForGoals).toBeLessThanOrEqual(510);
    expect(totalEvs(set.evs)).toBeGreaterThan(evsForGoals);
    expect(totalEvs(set.evs)).toBeLessThanOrEqual(510);
    expect(toStats(set).spe).toBe(106);
  });

  it('compares natures, cheapest first, and skips neutral ones', () => {
    const results = optimizeNatures(incineroar, [outspeedRilla, twoMoonblasts], C, noLeftovers);
    expect(results.length).toBeGreaterThan(0);
    expect(results.map((r) => r.set.nature)).not.toContain('Hardy');
    const costs = results.map((r) => r.evsForGoals);
    expect(costs).toEqual([...costs].sort((a, b) => a - b));
  });
});
