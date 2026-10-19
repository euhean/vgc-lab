import { useMemo, useState } from 'react';
import type { TypeName } from '@pkmn/data';
import { searchSpecies, TYPES } from '../lib/dex';
import { Icon, TypePill } from './Sprite';

const PAGE = 60;

export default function Pokedex({ onAdd, full }: { onAdd: (species: string) => void; full: boolean }) {
  const [query, setQuery] = useState('');
  const [type, setType] = useState<TypeName | ''>('');
  const [limit, setLimit] = useState(PAGE);
  const results = useMemo(() => searchSpecies(query, type), [query, type]);

  return (
    <aside className="card stack dex">
      <h2>Pokédex</h2>
      <div className="row">
        <input placeholder="Search by name" value={query} onChange={(e) => { setQuery(e.target.value); setLimit(PAGE); }} />
        <select value={type} onChange={(e) => { setType(e.target.value as TypeName | ''); setLimit(PAGE); }}>
          <option value="">All types</option>
          {TYPES.map((t) => <option key={t}>{t}</option>)}
        </select>
      </div>
      <span className="muted small">{results.length} Pokémon</span>
      <ul className="dex-list">
        {results.slice(0, limit).map((s) => (
          <li key={s.id} className="dex-row">
            <Icon species={s.name} />
            <span className="grow">{s.name}</span>
            <span className="types">{s.types.map((t) => <TypePill key={t} type={t} />)}</span>
            <span className="muted small bst">{Object.values(s.baseStats).reduce((a, b) => a + b, 0)}</span>
            <button className="small" disabled={full} onClick={() => onAdd(s.name)}>Add</button>
          </li>
        ))}
      </ul>
      {results.length > limit && <button className="ghost" onClick={() => setLimit(limit + PAGE)}>Show more</button>}
    </aside>
  );
}
