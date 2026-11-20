import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, type TeamRecord } from '../api/client';
import ComparePanel from '../components/ComparePanel';
import MetaThreats from '../components/MetaThreats';
import MonEditor from '../components/MonEditor';
import Pokedex from '../components/Pokedex';
import SetCard from '../components/SetCard';
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
  const [threats, setThreats] = useState(false);
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
  const opponentPaste = opponent?.paste;
  const opponentSets = useMemo(
    () => (opponentId === id ? sets : opponentPaste !== undefined ? parseTeam(opponentPaste) : []),
    [opponentId, id, sets, opponentPaste],
  );

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

  const shareUrl = (shareId: string) => `${window.location.origin}/t/${shareId}`;

  const share = async () => {
    const shared = await api.shareTeam(id);
    setRecord(shared);
    await copyShareLink(shared.share_id!);
  };

  const copyShareLink = async (shareId: string) => {
    await navigator.clipboard.writeText(shareUrl(shareId));
    setStatus('Share link copied to clipboard');
  };

  const stopSharing = async () => {
    setRecord(await api.unshareTeam(id));
    setStatus('Share link removed');
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
                <SetCard set={set} />
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
          <div className="row">
            <button className="ghost" onClick={() => setThreats(true)} disabled={sets.length === 0}>Meta threats</button>
            <button onClick={() => setComparing(true)} disabled={!opponent || sets.length === 0}>Compare teams</button>
          </div>
        </div>

        <div className="card row between wrap">
          {record.share_id ? (
            <>
              <label className="row inline grow">Share link
                <input className="grow" readOnly value={shareUrl(record.share_id)} onFocus={(e) => e.target.select()} />
              </label>
              <div className="row">
                <button className="ghost" onClick={() => copyShareLink(record.share_id!)}>Copy link</button>
                <button className="ghost" onClick={stopSharing}>Stop sharing</button>
              </div>
            </>
          ) : (
            <>
              <span className="muted small">Anyone with a share link can view this team without logging in.</span>
              <button className="ghost" onClick={share}>Create share link</button>
            </>
          )}
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

      {threats && (
        <MetaThreats
          team={sets}
          conditions={conditions}
          onOpponentCreated={(team) => { setAllTeams((ts) => [team, ...ts]); setOpponentId(team.id); }}
          onClose={() => setThreats(false)}
        />
      )}

      {comparing && opponent && (
        <ComparePanel mine={sets} theirs={opponentSets} conditions={conditions} onConditions={setConditions} onClose={() => setComparing(false)} />
      )}
    </div>
  );
}
