import { Team, Teams } from '@pkmn/sets';
import type { PokemonSet, StatID, StatsTable } from '@pkmn/types';
import { abilitiesOf, getSpecies } from './dex';

export type { PokemonSet, StatID, StatsTable };

export const STATS: StatID[] = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
export const STAT_LABELS: Record<StatID, string> = {
  hp: 'HP', atk: 'Atk', def: 'Def', spa: 'SpA', spd: 'SpD', spe: 'Spe',
};
export const MAX_TEAM_SIZE = 6;
export const MAX_TOTAL_EVS = 510;
export const MAX_STAT_EVS = 252;

const stats = (value: number): StatsTable => ({ hp: value, atk: value, def: value, spa: value, spd: value, spe: value });

export function newSet(speciesName: string): PokemonSet {
  const species = getSpecies(speciesName);
  return {
    name: '',
    species: species.name,
    item: species.requiredItem ?? '',
    ability: abilitiesOf(species)[0],
    moves: [],
    nature: 'Hardy',
    gender: '',
    evs: stats(0),
    ivs: stats(31),
    level: 50,
    shiny: false,
    teraType: species.types[0],
  };
}

/** Parses a Showdown paste. An empty paste is an empty team. */
export function parseTeam(paste: string): PokemonSet[] {
  if (paste.trim() === '') return [];
  const team = Teams.importTeam(paste);
  if (!team) throw new Error('Invalid team paste');
  return team.team.map(withDefaults);
}

export function exportTeam(sets: PokemonSet[]): string {
  return new Team(sets).export().trim();
}

/** Imported sets may omit fields; fill them so the editor always works on complete sets. */
export function withDefaults(set: Partial<PokemonSet>): PokemonSet {
  if (!set.species) throw new Error('Set without species');
  const base = newSet(set.species);
  return {
    ...base,
    ...set,
    evs: { ...stats(0), ...set.evs },
    ivs: { ...stats(31), ...set.ivs },
    moves: set.moves ?? [],
  } as PokemonSet;
}

export function totalEvs(evs: StatsTable): number {
  return STATS.reduce((sum, s) => sum + evs[s], 0);
}

/** Sets one EV, clamped so the stat stays within 0–252 and the total within 510. */
export function setEv(evs: StatsTable, stat: StatID, value: number): StatsTable {
  const others = totalEvs(evs) - evs[stat];
  const clamped = Math.max(0, Math.min(MAX_STAT_EVS, MAX_TOTAL_EVS - others, Math.floor(value)));
  return { ...evs, [stat]: clamped };
}

export function setIv(ivs: StatsTable, stat: StatID, value: number): StatsTable {
  return { ...ivs, [stat]: Math.max(0, Math.min(31, Math.floor(value))) };
}
