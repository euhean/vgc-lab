import { Icons, Sprites } from '@pkmn/img';

export function Sprite({ species, shiny = false, size = 96 }: { species: string; shiny?: boolean; size?: number }) {
  const sprite = Sprites.getPokemon(species, { gen: 'gen5', shiny });
  return (
    <img className="sprite" src={sprite.url} alt={species} width={size} height={size} loading="lazy" />
  );
}

export function Icon({ species }: { species: string }) {
  return <span className="icon" style={Icons.getPokemon(species).css} aria-label={species} />;
}

export function TypePill({ type }: { type: string }) {
  return <span className={`type type-${type.toLowerCase()}`}>{type}</span>;
}
