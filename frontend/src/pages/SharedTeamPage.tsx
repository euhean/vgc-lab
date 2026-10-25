import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, type SharedTeam } from '../api/client';
import { useAuth } from '../auth-context';
import SetCard from '../components/SetCard';
import { parseTeam } from '../lib/team';

/** Read-only view of a team shared by link. Works without logging in. */
export default function SharedTeamPage() {
  const shareId = useParams().shareId!;
  const { user } = useAuth();
  const navigate = useNavigate();
  const [team, setTeam] = useState<SharedTeam | null>(null);
  const [status, setStatus] = useState('');

  useEffect(() => {
    api.getSharedTeam(shareId).then(setTeam).catch((e: Error) => setStatus(e.message));
  }, [shareId]);

  if (!team) return <p className="muted center">{status || 'Loading…'}</p>;

  const copyPaste = async () => {
    await navigator.clipboard.writeText(team.paste);
    setStatus('Showdown paste copied to clipboard');
  };

  const saveCopy = async () => {
    const copy = await api.createTeam({ name: team.name, format: team.format, paste: team.paste });
    navigate(`/teams/${copy.id}`);
  };

  return (
    <div className="stack">
      <div className="row between wrap">
        <div className="stack tight">
          <h1>{team.name}</h1>
          <span className="muted small">Shared by {team.owner} · updated {new Date(team.updated_at).toLocaleString()}</span>
        </div>
        <div className="row wrap">
          <span className="muted small">{status}</span>
          <button className="ghost" onClick={copyPaste}>Copy Showdown paste</button>
          {user && <button onClick={saveCopy}>Save a copy to my teams</button>}
        </div>
      </div>
      <div className="slots">
        {parseTeam(team.paste).map((set, i) => (
          <div key={i} className="card slot"><SetCard set={set} showEvs /></div>
        ))}
      </div>
    </div>
  );
}
