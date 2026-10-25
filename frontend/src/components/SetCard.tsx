import { STAT_LABELS, STATS, type PokemonSet } from '../lib/team';
import { Sprite } from './Sprite';

/** The summary of one Pokémon shown in a team slot. */
export default function SetCard({ set, showEvs = false }: { set: PokemonSet; showEvs?: boolean }) {
  const evs = STATS.filter((s) => set.evs[s] > 0).map((s) => `${set.evs[s]} ${STAT_LABELS[s]}`).join(' / ');
  return (
    <>
      <Sprite species={set.species} shiny={set.shiny} size={80} />
      <strong>{set.species}</strong>
      <span className="muted small">{set.item || 'No item'} · {set.ability}</span>
      <span className="small slot-moves">{set.moves.length ? set.moves.join(' / ') : 'No moves yet'}</span>
      {showEvs && <span className="muted small">{set.nature} · {evs || 'No EVs'}</span>}
    </>
  );
}
