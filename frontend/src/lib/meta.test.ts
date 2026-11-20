import { describe, expect, it } from 'vitest';
import { DEFAULT_CONDITIONS as C } from './battle';
import { commonSet, formatName, parseSpread, rankThreats, type UsagePokemon } from './meta';
import { newSet, type PokemonSet } from './team';

// Shaped like GET /meta/reports/{id}: ids and shares, most common first.
const usage = (rank: number, species: string, share: number, sets: UsagePokemon['sets']): UsagePokemon => ({
  rank, species, usage: share, sets,
});

const INCINEROAR = usage(1, 'Incineroar', 0.52, {
  moves: [{ id: 'fakeout', share: 0.97 }, { id: 'partingshot', share: 0.8 }, { id: 'knockoff', share: 0.75 }, { id: 'flareblitz', share: 0.7 }, { id: 'protect', share: 0.3 }],
  items: [{ id: 'sitrusberry', share: 0.45 }, { id: 'safetygoggles', share: 0.3 }],
  abilities: [{ id: 'intimidate', share: 1 }],
  spreads: [{ id: 'Careful:252/4/0/0/252/0', share: 0.3 }],
  tera_types: [{ id: 'ghost', share: 0.5 }],
});
const RILLABOOM = usage(2, 'Rillaboom', 0.33, {
  moves: [{ id: 'fakeout', share: 0.96 }, { id: 'grassyglide', share: 0.95 }, { id: 'woodhammer', share: 0.9 }, { id: 'uturn', share: 0.6 }],
  items: [{ id: 'assaultvest', share: 0.6 }],
  abilities: [{ id: 'grassysurge', share: 1 }],
  spreads: [{ id: 'Adamant:252/252/0/0/4/0', share: 0.6 }],
  tera_types: [{ id: 'fire', share: 0.5 }],
});

const amoonguss: PokemonSet = {
  ...newSet('Amoonguss'), nature: 'Relaxed', item: 'Rocky Helmet', ability: 'Regenerator',
  evs: { hp: 252, atk: 0, def: 172, spa: 0, spd: 84, spe: 0 }, moves: ['Spore', 'Rage Powder', 'Pollen Puff', 'Protect'],
};

describe('usage data', () => {
  it('names VGC formats', () => {
    expect(formatName('gen9vgc2024regg')).toBe('VGC 2024 Reg G');
    expect(formatName('gen9vgc2026regibo3')).toBe('VGC 2026 Reg I Bo3');
    expect(formatName('gen9ou')).toBe('gen9ou');
  });

  it('reads spreads in HP/Atk/Def/SpA/SpD/Spe order', () => {
    expect(parseSpread('Careful:252/4/0/0/252/0')).toEqual({
      nature: 'Careful', evs: { hp: 252, atk: 4, def: 0, spa: 0, spd: 252, spe: 0 },
    });
    expect(() => parseSpread('Careful:252/4')).toThrow('Invalid spread');
  });

  it('builds the most common set with display names', () => {
    const set = commonSet(INCINEROAR);
    expect(set).toMatchObject({
      species: 'Incineroar', item: 'Sitrus Berry', ability: 'Intimidate', nature: 'Careful', teraType: 'Ghost', level: 50,
      moves: ['Fake Out', 'Parting Shot', 'Knock Off', 'Flare Blitz'],
    });
    expect(set.evs.spd).toBe(252);
  });

  it('fails loudly on ids the Pokédex does not know', () => {
    expect(() => commonSet({ ...INCINEROAR, sets: { ...INCINEROAR.sets, moves: [{ id: 'notamove', share: 1 }] } })).toThrow('Unknown move');
  });
});

describe('threat ranking', () => {
  it('ranks a Pokémon that hits the team hard and takes little back first', () => {
    // Flare Blitz is super effective on Amoonguss; Rillaboom's Grass moves are resisted 4x and
    // Amoonguss hits it back with a super effective Pollen Puff.
    const [first, second] = rankThreats([amoonguss], [RILLABOOM, INCINEROAR], C);
    expect(first.set.species).toBe('Incineroar');
    expect(first.matchups[0].theirs?.move).toBe('Flare Blitz');
    expect(first.hitsYou).toBeGreaterThan(first.youHit);
    expect(second.set.species).toBe('Rillaboom');
    expect(second.score).toBeLessThan(0);
    // 0-Speed Relaxed Amoonguss is slower than both.
    expect(first.outspeeds).toBe(1);
  });

  it('flips speed under Trick Room', () => {
    const [threat] = rankThreats([amoonguss], [INCINEROAR], { ...C, trickRoom: true });
    expect(threat.outspeeds).toBe(0);
  });
});
