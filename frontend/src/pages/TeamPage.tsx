import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, type TeamRecord } from '../api';
import ComparePanel from '../components/ComparePanel';
import MonEditor from '../components/MonEditor';
import Pokedex from '../components/Pokedex';
import { Sprite } from '../components/Sprite';
import { DEFAULT_CONDITIONS, type Conditions } from '../lib/battle';
import { exportTeam, MAX_TEAM_SIZE, newSet, parseTeam, type PokemonSet } from '../lib/team';

export default function TeamPage() {
  const id = Number(useParams().id);
  const [record, setRecord] = useState<TeamRecord | null>(null);
  const [name, setName] = useState('');
  const [sets, setSets] = useState<PokemonSet[]>([]);
  const [dirty, setDirty] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [allTeams, setAllTeams] = useState<TeamRecord[]>([]);
  const [opponentId, setOpponentId] = useState<number | null>(null);
  const [conditions, setConditions] = useState<Conditions>(DEFAULT_CONDITIONS);
  const [comparing, setComparing] = useState(false);
  const [status, setStatus] = useState('');

  useEffect(() => {
    api.getTeam(id).then((team) => {
      setRecord(team);
      setName(team.name);
      setSets(parseTeam(team.paste));
    }).catch((e: Error) => setStatus(e.message));
    api.listTeams().then(setAllTeams);
  }, [id]);

  const opponent = allTeams.find((t) => t.id === opponentId);
  // Comparing against this same team uses the live, unsaved sets.
  const opponentSets = opponentId === id ? sets : opponent ? parseTeam(opponent.paste) : [];

  const change = (next: PokemonSet[]) => {
    setSets(next);
    setDirty(true);
  };

  const save = async () => {
    const saved = await api.updateTeam(id, { name, format: record!.format, paste: exportTeam(sets) });
    setRecord(saved);
    setAllTeams((ts) => ts.map((t) => (t.id === saved.id ? saved : t)));
    setDirty(false);
    setStatus('Saved');
  };

  const copyPaste = async () => {
    await navigator.clipboard.writeText(exportTeam(sets));
    setStatus('Showdown paste copied to clipboard');
  };

  if (!record) return <p className="muted center">{status || 'Loading…'}</p>;

  return (
    <div className="team-layout">
      <section className="stack">
        <div className="row between wrap">
          <div className="row">
            <Link to="/" className="ghost button">←</Link>
            <input className="title-input" value={name} onChange={(e) => { setName(e.target.value); setDirty(true); }} maxLength={64} />
          </div>
          <div className="row wrap">
            <span className="muted small">{dirty ? 'Unsaved changes' : status}</span>
            <button className="ghost" onClick={copyPaste} disabled={sets.length === 0}>Export</button>
            <button onClick={save} disabled={!dirty || name.trim() === ''}>Save</button>
          </div>
        </div>

        <div className="slots">
          {Array.from({ length: MAX_TEAM_SIZE }, (_, i) => sets[i]).map((set, i) =>
            set ? (
              <button key={i} className="card slot" onClick={() => setEditing(i)}>
                <Sprite species={set.species} shiny={set.shiny} size={80} />
                <strong>{set.species}</strong>
                <span className="muted small">{set.item || 'No item'} · {set.ability}</span>
                <span className="small slot-moves">{set.moves.length ? set.moves.join(' / ') : 'No moves yet'}</span>
              </button>
            ) : (
              <div key={i} className="card slot empty muted">Empty slot</div>
            ),
          )}
        </div>

        <div className="card row between wrap">
          <label className="row inline">Opponent team
            <select value={opponentId ?? ''} onChange={(e) => setOpponentId(e.target.value ? Number(e.target.value) : null)}>
              <option value="">None</option>
              {allTeams.map((t) => <option key={t.id} value={t.id}>{t.name}{t.id === id ? ' (this team)' : ''}</option>)}
            </select>
          </label>
          <button onClick={() => setComparing(true)} disabled={!opponent || sets.length === 0}>Compare teams</button>
        </div>
      </section>

      <Pokedex full={sets.length >= MAX_TEAM_SIZE} onAdd={(species) => change([...sets, newSet(species)])} />

      {editing !== null && sets[editing] && (
        <MonEditor
          set={sets[editing]}
          targets={opponentSets}
          conditions={conditions}
          onChange={(set) => change(sets.map((s, i) => (i === editing ? set : s)))}
          onRemove={() => { change(sets.filter((_, i) => i !== editing)); setEditing(null); }}
          onClose={() => setEditing(null)}
        />
      )}

      {comparing && opponent && (
        <ComparePanel mine={sets} theirs={opponentSets} conditions={conditions} onConditions={setConditions} onClose={() => setComparing(false)} />
      )}
    </div>
  );
}
