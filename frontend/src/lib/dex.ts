import { Dex } from '@pkmn/dex';
import { Generations, type Specie, type TypeName } from '@pkmn/data';

/** Scarlet/Violet data. Every lookup in the app goes through this generation. */
export const gen = new Generations(Dex).get(9);

export const TYPES: TypeName[] = [...gen.types].map((t) => t.name).filter((t) => t !== 'Stellar');

export const SPECIES: Specie[] = [...gen.species].sort((a, b) => a.name.localeCompare(b.name));

export const ITEMS: string[] = [...gen.items].map((i) => i.name).sort();

export const NATURES = [...gen.natures].sort((a, b) => a.name.localeCompare(b.name));

export function getSpecies(name: string): Specie {
  const species = gen.species.get(name);
  if (!species) throw new Error(`Unknown species: ${name}`);
  return species;
}

export function abilitiesOf(species: Specie): string[] {
  return Object.values(species.abilities).filter((a): a is string => Boolean(a));
}

/** Moves a species can learn in Scarlet/Violet, sorted by name. */
export async function learnableMoves(species: Specie): Promise<string[]> {
  const learnable = await gen.learnsets.learnable(species.id);
  if (!learnable) return [];
  return Object.keys(learnable)
    .map((id) => gen.moves.get(id))
    .filter((m) => m !== undefined)
    .map((m) => m.name)
    .sort();
}

export function searchSpecies(query: string, type: TypeName | ''): Specie[] {
  const q = query.trim().toLowerCase();
  return SPECIES.filter(
    (s) => (q === '' || s.name.toLowerCase().includes(q)) && (type === '' || s.types.includes(type)),
  );
}
