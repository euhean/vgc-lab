import { useEffect, useState } from 'react';
import type { StatID } from '@pkmn/types';
import { toCalcPokemon, type Conditions } from '../lib/battle';
import { abilitiesOf, getSpecies, ITEMS, learnableMoves, NATURES, TYPES } from '../lib/dex';
import { MAX_TOTAL_EVS, setEv, setIv, STAT_LABELS, STATS, totalEvs, type PokemonSet } from '../lib/team';
import MoveTooltip from './MoveTooltip';
import { Sprite, TypePill } from './Sprite';

interface Props {
  set: PokemonSet;
  targets: PokemonSet[];
  conditions: Conditions;
  onChange: (set: PokemonSet) => void;
  onRemove: () => void;
  onClose: () => void;
}

export default function MonEditor({ set, targets, conditions, onChange, onRemove, onClose }: Props) {
  const [tab, setTab] = useState<'set' | 'training'>('set');
  const [moves, setMoves] = useState<string[]>([]);
  const [targetIndex, setTargetIndex] = useState(0);
  const species = getSpecies(set.species);
  const target = targets[targetIndex] ?? null;
  const stats = toCalcPokemon(set, false).stats;

  useEffect(() => {
    learnableMoves(getSpecies(set.species)).then(setMoves);
  }, [set.species]);

  const update = (patch: Partial<PokemonSet>) => onChange({ ...set, ...patch });
  const setMove = (i: number, move: string) => {
    const next = [...set.moves];
    next[i] = move;
    update({ moves: next.filter(Boolean) });
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="card modal stack" onClick={(e) => e.stopPropagation()}>
        <div className="row between">
          <div className="row">
            <Sprite species={set.species} shiny={set.shiny} />
            <div className="stack tight">
              <h2>{set.species}</h2>
              <span className="types">{species.types.map((t) => <TypePill key={t} type={t} />)}</span>
            </div>
          </div>
          <div className="row">
            <button className="ghost" onClick={onRemove}>Remove</button>
            <button onClick={onClose}>Done</button>
          </div>
        </div>

        <div className="tabs">
          <button className={tab === 'set' ? 'active' : ''} onClick={() => setTab('set')}>Set</button>
          <button className={tab === 'training' ? 'active' : ''} onClick={() => setTab('training')}>Appearance & training</button>
        </div>

        {tab === 'set' && (
          <div className="form-grid">
            <label>Ability
              <select value={set.ability} onChange={(e) => update({ ability: e.target.value })}>
                {abilitiesOf(species).map((a) => <option key={a}>{a}</option>)}
              </select>
            </label>
            <label>Item
              <input list="items" value={set.item} onChange={(e) => update({ item: e.target.value })} placeholder="No item" />
              <datalist id="items">{ITEMS.map((i) => <option key={i} value={i} />)}</datalist>
            </label>
            <label>Nature
              <select value={set.nature} onChange={(e) => update({ nature: e.target.value })}>
                {NATURES.map((n) => (
                  <option key={n.name} value={n.name}>
                    {n.name}{n.plus && n.plus !== n.minus ? ` (+${STAT_LABELS[n.plus]} −${STAT_LABELS[n.minus!]})` : ''}
                  </option>
                ))}
              </select>
            </label>
            <label>Tera Type
              <select value={set.teraType} onChange={(e) => update({ teraType: e.target.value })}>
                {TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </label>

            <div className="span-2 stack">
              <div className="row between">
                <strong>Moves</strong>
                <label className="row inline">Hover target
                  <select value={targetIndex} onChange={(e) => setTargetIndex(Number(e.target.value))} disabled={targets.length === 0}>
                    {targets.length === 0 && <option>Choose an opponent team first</option>}
                    {targets.map((t, i) => <option key={i} value={i}>{t.species}</option>)}
                  </select>
                </label>
              </div>
              <datalist id="moves">{moves.map((m) => <option key={m} value={m} />)}</datalist>
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="move-row">
                  <input list="moves" value={set.moves[i] ?? ''} onChange={(e) => setMove(i, e.target.value)} placeholder={`Move ${i + 1}`} />
                  {set.moves[i] && <MoveTooltip attacker={set} move={set.moves[i]} target={target} conditions={conditions} />}
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'training' && (
          <div className="stack">
            <label className="row inline">
              <input type="checkbox" checked={set.shiny ?? false} onChange={(e) => update({ shiny: e.target.checked })} />
              Shiny
            </label>
            <label className="row inline">Level
              <input type="number" min={1} max={100} value={set.level} onChange={(e) => update({ level: Math.max(1, Math.min(100, Number(e.target.value))) })} />
            </label>
            <table className="stats">
              <thead><tr><th /><th>Base</th><th>EVs</th><th /><th>IVs</th><th>Stat</th></tr></thead>
              <tbody>
                {STATS.map((stat: StatID) => (
                  <tr key={stat}>
                    <th>{STAT_LABELS[stat]}</th>
                    <td className="muted">{species.baseStats[stat]}</td>
                    <td>
                      <input type="number" min={0} max={252} step={4} value={set.evs[stat]}
                        onChange={(e) => update({ evs: setEv(set.evs, stat, Number(e.target.value)) })} />
                    </td>
                    <td className="grow">
                      <input type="range" min={0} max={252} step={4} value={set.evs[stat]}
                        onChange={(e) => update({ evs: setEv(set.evs, stat, Number(e.target.value)) })} />
                    </td>
                    <td>
                      <input type="number" min={0} max={31} value={set.ivs[stat]}
                        onChange={(e) => update({ ivs: setIv(set.ivs, stat, Number(e.target.value)) })} />
                    </td>
                    <td><strong>{stats[stat]}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <span className="muted small">{totalEvs(set.evs)} / {MAX_TOTAL_EVS} EVs used</span>
          </div>
        )}
      </div>
    </div>
  );
}
