import { describe, expect, it } from 'vitest';
import {
  calcDamage, DEFAULT_CONDITIONS, effectiveSpeed, formulaBreakdown, percentRange, speedOrder, statusEffect, teamWeaknesses,
} from './battle';
import { newSet } from './team';

const incineroar = { ...newSet('Incineroar'), evs: { hp: 252, atk: 0, def: 0, spa: 0, spd: 252, spe: 0 }, nature: 'Careful' };
const flutter = { ...newSet('Flutter Mane'), nature: 'Timid', evs: { hp: 0, atk: 0, def: 0, spa: 252, spd: 0, spe: 252 } };
const amoonguss = { ...newSet('Amoonguss'), nature: 'Relaxed', ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 0 } };

describe('damage', () => {
  it('matches the base damage formula and lists the modifiers', () => {
    const result = calcDamage(flutter, incineroar, 'Moonblast', DEFAULT_CONDITIONS, true);
    const f = formulaBreakdown(result, DEFAULT_CONDITIONS);
    // Timid 252 SpA Flutter Mane (187 SpA) into Careful 252 SpD Incineroar (156 SpD) at level 50.
    expect([f.attack, f.defense, f.power]).toEqual([187, 156, 95]);
    expect(f.baseDamage).toBe(Math.floor(Math.floor(22 * 95 * 187 / 156) / 50) + 2);
    expect(f.modifiers).toContainEqual({ label: 'STAB', value: '×1.5' });
    expect(f.modifiers).toContainEqual({ label: 'Type effectiveness', value: '×1' });
    const [min, max] = percentRange(result);
    expect(min).toBeGreaterThan(0);
    expect(max).toBeGreaterThanOrEqual(min);
  });

  it('applies the spread modifier only in doubles', () => {
    const heatWave = (gameType: 'Doubles' | 'Singles') =>
      calcDamage(incineroar, amoonguss, 'Heat Wave', { ...DEFAULT_CONDITIONS, gameType }, true).range()[1];
    expect(heatWave('Doubles')).toBeLessThan(heatWave('Singles'));
  });

  it('applies screens on the defending side', () => {
    const plain = calcDamage(flutter, incineroar, 'Moonblast', DEFAULT_CONDITIONS, true).range()[1];
    const screened = calcDamage(flutter, incineroar, 'Moonblast', {
      ...DEFAULT_CONDITIONS, theirs: { ...DEFAULT_CONDITIONS.theirs, lightScreen: true },
    }, true).range()[1];
    expect(screened).toBeLessThan(plain);
  });
});

describe('speed', () => {
  it('doubles speed under Tailwind', () => {
    const base = effectiveSpeed(flutter, DEFAULT_CONDITIONS, true);
    const tailwind = effectiveSpeed(flutter, { ...DEFAULT_CONDITIONS, mine: { ...DEFAULT_CONDITIONS.mine, tailwind: true } }, true);
    expect(tailwind).toBe(base * 2);
  });

  it('reverses the order under Trick Room', () => {
    const normal = speedOrder([flutter], [amoonguss], DEFAULT_CONDITIONS).map((e) => e.set.species);
    const trickRoom = speedOrder([flutter], [amoonguss], { ...DEFAULT_CONDITIONS, trickRoom: true }).map((e) => e.set.species);
    expect(normal).toEqual(['Flutter Mane', 'Amoonguss']);
    expect(trickRoom).toEqual(['Amoonguss', 'Flutter Mane']);
  });
});

describe('types', () => {
  it('counts weaknesses and resistances across the team', () => {
    const fire = teamWeaknesses([amoonguss, flutter], false).find((r) => r.type === 'Fire')!;
    expect(fire).toEqual({ type: 'Fire', weak: 1, resist: 0 });
  });
});

it('describes status moves', () => {
  expect(statusEffect('Swords Dance')).toContain('+2 Atk (user)');
  expect(statusEffect('Thunder Wave')).toContain('Inflicts PAR');
});
