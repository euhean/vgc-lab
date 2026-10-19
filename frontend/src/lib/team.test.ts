import { describe, expect, it } from 'vitest';
import { exportTeam, newSet, parseTeam, setEv, setIv, totalEvs } from './team';

const PASTE = `Incineroar @ Sitrus Berry
Ability: Intimidate
Level: 50
Tera Type: Ghost
EVs: 252 HP / 4 Atk / 252 SpD
Careful Nature
IVs: 0 Spe
- Fake Out
- Flare Blitz
- Knock Off
- Parting Shot`;

describe('team paste', () => {
  it('round-trips a Showdown paste without losing data', () => {
    const [set] = parseTeam(PASTE);
    expect(set.species).toBe('Incineroar');
    expect(set.ivs.spe).toBe(0);
    expect(parseTeam(exportTeam([set]))).toEqual(parseTeam(PASTE));
  });

  it('treats an empty paste as an empty team', () => {
    expect(parseTeam('  ')).toEqual([]);
  });

  it('creates new sets ready for VGC', () => {
    const set = newSet('Ogerpon-Wellspring');
    expect(set.level).toBe(50);
    expect(set.item).toBe('Wellspring Mask');
    expect(set.ability).toBe('Water Absorb');
  });
});

describe('EVs and IVs', () => {
  const evs = { hp: 252, atk: 252, def: 0, spa: 0, spd: 0, spe: 0 };

  it('caps a single stat at 252', () => {
    expect(setEv(evs, 'def', 300).def).toBe(0 + 6);
    expect(setEv({ ...evs, hp: 0 }, 'def', 300).def).toBe(252);
  });

  it('keeps the total at 510 or less', () => {
    const next = setEv(evs, 'spe', 252);
    expect(next.spe).toBe(6);
    expect(totalEvs(next)).toBe(510);
  });

  it('clamps IVs to 0–31', () => {
    expect(setIv(evs, 'spe', -5).spe).toBe(0);
    expect(setIv(evs, 'spe', 40).spe).toBe(31);
  });
});
