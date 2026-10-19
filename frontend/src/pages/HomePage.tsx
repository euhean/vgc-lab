import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, type TeamRecord } from '../api';
import { Icon } from '../components/Sprite';
import { exportTeam, parseTeam } from '../lib/team';

export default function HomePage() {
  const navigate = useNavigate();
  const [teams, setTeams] = useState<TeamRecord[] | null>(null);
  const [name, setName] = useState('');
  const [paste, setPaste] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.listTeams().then(setTeams).catch((e: Error) => setError(e.message));
  }, []);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      // Parsing first rejects invalid pastes before anything is saved.
      const normalized = exportTeam(parseTeam(paste));
      const team = await api.createTeam({ name: name.trim(), format: 'gen9vgc', paste: normalized });
      navigate(`/teams/${team.id}`);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const remove = async (team: TeamRecord) => {
    if (!confirm(`Delete "${team.name}"?`)) return;
    await api.deleteTeam(team.id);
    setTeams((ts) => ts!.filter((t) => t.id !== team.id));
  };

  return (
    <div className="stack">
      <form className="card stack" onSubmit={create}>
        <h2>New team</h2>
        <div className="row">
          <input placeholder="Team name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={64} />
          <button type="submit">Create</button>
          <button type="button" className="ghost" onClick={() => setShowImport(!showImport)}>
            {showImport ? 'Start empty' : 'Import from Showdown'}
          </button>
        </div>
        {showImport && (
          <textarea rows={10} placeholder="Paste a Showdown team export here" value={paste} onChange={(e) => setPaste(e.target.value)} />
        )}
        {error && <p className="error">{error}</p>}
      </form>

      <section className="stack">
        <h2>Your teams</h2>
        {teams === null && <p className="muted">Loading…</p>}
        {teams?.length === 0 && <p className="muted">No teams yet. Create your first one above.</p>}
        <div className="grid">
          {teams?.map((team) => (
            <div key={team.id} className="card team-card">
              <Link to={`/teams/${team.id}`} className="team-link">
                <strong>{team.name}</strong>
                <div className="icons">
                  {parseTeam(team.paste).map((set, i) => <Icon key={i} species={set.species} />)}
                </div>
                <span className="muted small">Edited {new Date(team.updated_at).toLocaleString()}</span>
              </Link>
              <button className="ghost small" onClick={() => remove(team)}>Delete</button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
