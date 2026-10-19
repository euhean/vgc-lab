import { Fragment, useState } from 'react';
import type { TypeName } from '@pkmn/data';
import {
  calcDamage, defensiveMatchups, percentRange, speedOrder, teamWeaknesses,
  type Conditions, type GameType, type SideConditions, type Terrain, type Weather,
} from '../lib/battle';
import { gen, TYPES } from '../lib/dex';
import type { PokemonSet } from '../lib/team';
import { Icon } from './Sprite';

interface Props {
  mine: PokemonSet[];
  theirs: PokemonSet[];
  conditions: Conditions;
  onConditions: (c: Conditions) => void;
  onClose: () => void;
}

const SIDE_TOGGLES: [keyof SideConditions, string][] = [
  ['tera', 'Terastallized'], ['tailwind', 'Tailwind'], ['helpingHand', 'Helping Hand'],
  ['reflect', 'Reflect'], ['lightScreen', 'Light Screen'], ['auroraVeil', 'Aurora Veil'],
];

export default function ComparePanel({ mine, theirs, conditions: c, onConditions, onClose }: Props) {
  const [tab, setTab] = useState<'speed' | 'damage' | 'types'>('speed');
  const toggleSide = (side: 'mine' | 'theirs', key: keyof SideConditions) =>
    onConditions({ ...c, [side]: { ...c[side], [key]: !c[side][key] } });

  return (
    <div className="overlay" onClick={onClose}>
      <div className="card modal wide stack" onClick={(e) => e.stopPropagation()}>
        <div className="row between">
          <h2>Compare teams</h2>
          <button onClick={onClose}>Close</button>
        </div>

        <div className="conditions">
          <label>Format
            <select value={c.gameType} onChange={(e) => onConditions({ ...c, gameType: e.target.value as GameType })}>
              <option>Doubles</option><option>Singles</option>
            </select>
          </label>
          <label>Weather
            <select value={c.weather} onChange={(e) => onConditions({ ...c, weather: e.target.value as Weather })}>
              <option value="">None</option><option>Sun</option><option>Rain</option><option>Sand</option><option>Snow</option>
            </select>
          </label>
          <label>Terrain
            <select value={c.terrain} onChange={(e) => onConditions({ ...c, terrain: e.target.value as Terrain })}>
              <option value="">None</option><option>Electric</option><option>Grassy</option><option>Psychic</option><option>Misty</option>
            </select>
          </label>
          <label className="row inline">
            <input type="checkbox" checked={c.trickRoom} onChange={() => onConditions({ ...c, trickRoom: !c.trickRoom })} />
            Trick Room
          </label>
          {(['mine', 'theirs'] as const).map((side) => (
            <div key={side} className="side">
              <span className="muted small">{side === 'mine' ? 'Your side' : 'Opponent side'}</span>
              {SIDE_TOGGLES.map(([key, label]) => (
                <label key={key} className="row inline small">
                  <input type="checkbox" checked={c[side][key]} onChange={() => toggleSide(side, key)} />
                  {label}
                </label>
              ))}
            </div>
          ))}
        </div>

        <div className="tabs">
          <button className={tab === 'speed' ? 'active' : ''} onClick={() => setTab('speed')}>Speed</button>
          <button className={tab === 'damage' ? 'active' : ''} onClick={() => setTab('damage')}>Damage</button>
          <button className={tab === 'types' ? 'active' : ''} onClick={() => setTab('types')}>Types</button>
        </div>

        {tab === 'speed' && <SpeedTab mine={mine} theirs={theirs} c={c} />}
        {tab === 'damage' && <DamageTab mine={mine} theirs={theirs} c={c} />}
        {tab === 'types' && <TypesTab mine={mine} theirs={theirs} c={c} />}
      </div>
    </div>
  );
}

function SpeedTab({ mine, theirs, c }: { mine: PokemonSet[]; theirs: PokemonSet[]; c: Conditions }) {
  return (
    <ol className="speed-list">
      {speedOrder(mine, theirs, c).map((e, i) => (
        <li key={i} className={e.mine ? 'mine' : 'theirs'}>
          <Icon species={e.set.species} />
          <span className="grow">{e.set.species}</span>
          <span className="muted small">{e.mine ? 'You' : 'Opponent'}</span>
          <strong>{e.speed}</strong>
        </li>
      ))}
      {c.trickRoom && <p className="muted small">Trick Room: slowest moves first.</p>}
    </ol>
  );
}

function DamageTab({ mine, theirs, c }: { mine: PokemonSet[]; theirs: PokemonSet[]; c: Conditions }) {
  const [attackingIsMine, setAttackingIsMine] = useState(true);
  const [attackers, defenders] = attackingIsMine ? [mine, theirs] : [theirs, mine];

  return (
    <div className="stack">
      <div className="tabs">
        <button className={attackingIsMine ? 'active' : ''} onClick={() => setAttackingIsMine(true)}>Your attacks</button>
        <button className={!attackingIsMine ? 'active' : ''} onClick={() => setAttackingIsMine(false)}>Their attacks</button>
      </div>
      <div className="table-scroll">
        <table className="matrix">
          <thead>
            <tr><th>Move</th>{defenders.map((d, i) => <th key={i} className="small"><Icon species={d.species} /><div>{d.species}</div></th>)}</tr>
          </thead>
          <tbody>
            {attackers.map((a, ai) => (
              <Fragment key={ai}>
                <tr className="group"><th colSpan={defenders.length + 1}><Icon species={a.species} /> {a.species}</th></tr>
                {a.moves.filter((m) => gen.moves.get(m)?.category !== 'Status').map((move) => (
                  <tr key={move}>
                    <th className="move-name">{move}</th>
                    {defenders.map((d, di) => {
                      const result = calcDamage(a, d, move, c, attackingIsMine);
                      const [min, max] = percentRange(result);
                      const level = max >= 100 ? 'ko' : max >= 50 ? 'high' : max > 0 ? 'low' : 'none';
                      return <td key={di} className={`dmg ${level}`} title={result.desc()}>{min}–{max}%</td>;
                    })}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted small">Hover a cell for the full calc. Status moves are left out.</p>
    </div>
  );
}

function TypesTab({ mine, theirs, c }: { mine: PokemonSet[]; theirs: PokemonSet[]; c: Conditions }) {
  const rows = (team: PokemonSet[], tera: boolean, title: string) => {
    const tables = team.map((s) => defensiveMatchups(s, tera));
    const summary = teamWeaknesses(team, tera);
    return (
      <div className="table-scroll">
        <table className="matrix types-table">
          <thead>
            <tr><th>{title}</th>{TYPES.map((t) => <th key={t} className="small">{t.slice(0, 3)}</th>)}</tr>
          </thead>
          <tbody>
            {team.map((s, i) => (
              <tr key={i}>
                <th className="small"><span className="row inline"><Icon species={s.species} />{s.species}</span></th>
                {TYPES.map((t: TypeName) => {
                  const m = tables[i][t];
                  return <td key={t} className={`eff e${String(m).replace('.', '_')}`}>{m === 1 ? '' : `×${m}`}</td>;
                })}
              </tr>
            ))}
            <tr className="summary">
              <th className="small">Weak / Resist</th>
              {summary.map((r) => <td key={r.type} className="small">{r.weak}/{r.resist}</td>)}
            </tr>
          </tbody>
        </table>
      </div>
    );
  };
  return (
    <div className="stack">
      {rows(mine, c.mine.tera, 'Your team')}
      {rows(theirs, c.theirs.tera, 'Opponent')}
      <p className="muted small">Multiplier each attacking type deals. Uses Tera Types when that side is terastallized.</p>
    </div>
  );
}
