import { Teams } from '@pkmn/sets';

/**
 * Species names in a Showdown paste, read without the Pokédex data.
 * Kept apart from team.ts so the home page doesn't download the full Pokédex.
 */
export function speciesInPaste(paste: string): string[] {
  if (paste.trim() === '') return [];
  const team = Teams.importTeam(paste);
  if (!team) throw new Error('Invalid team paste');
  return team.team.map((set) => set.species).filter((species): species is string => Boolean(species));
}
