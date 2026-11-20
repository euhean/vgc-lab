import { Fragment, useEffect, useMemo, useState } from 'react';
import { api, type TeamRecord } from '../api/client';
import type { Conditions } from '../lib/battle';
import { formatName, rankThreats, type UsagePokemon, type UsageReport } from '../lib/meta';
import { exportTeam, MAX_TEAM_SIZE, type PokemonSet } from '../lib/team';
import { Icon } from './Sprite';

/** Most used Pokémon analysed: about 30 × 6 × 8 damage calcs, a few hundred milliseconds. */
const ANALYSED = 30;

interface Props {
  team: PokemonSet[];
  conditions: Conditions;
  onOpponentCreated: (team: TeamRecord) => void;
  onClose: () => void;
}

const pct = (x: number) => `${Math.round(x)}%`;

export default function MetaThreats({ team, conditions, onOpponentCreated, onClose }: Props) {
  const [reports, setReports] = useState<UsageReport[] | null>(null);
  const [reportId, setReportId] = useState<number | null>(null);
  // The loaded report's Pokémon, kept with its id so switching reports never shows stale threats.
  const [meta, setMeta] = useState<{ id: number; pokemon: UsagePokemon[] } | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [status, setStatus] = useState('');

  useEffect(() => {
    api.listUsageReports().then((rs) => {
      setReports(rs);
      if (rs.length > 0) setReportId(rs[0].id);
    }).catch((e: Error) => setStatus(e.message));
  }, []);

  useEffect(() => {
    if (reportId === null) return;
    api.getUsageReport(reportId, ANALYSED).then((r) => setMeta({ id: r.id, pokemon: r.pokemon })).catch((e: Error) => setStatus(e.message));
  }, [reportId]);

  const loaded = meta?.id === reportId ? meta.pokemon : null;
  const threats = useMemo(() => (loaded ? rankThreats(team, loaded, conditions) : null), [team, loaded, conditions]);
  const report = reports?.find((r) => r.id === reportId);

  const createOpponent = async () => {
    const top = threats!.slice(0, MAX_TEAM_SIZE).map((t) => t.set);
    const created = await api.createTeam({
      name: `Top threats · ${formatName(report!.format)} ${report!.month}`,
      format: 'gen9vgc',
      paste: exportTeam(top),
    });
    onOpponentCreated(created);
    setStatus(`Created "${created.name}" and chose it as the opponent team`);
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="card modal wide stack" onClick={(e) => e.stopPropagation()}>
        <div className="row between">
          <h2>Meta threats</h2>
          <button onClick={onClose}>Close</button>
        </div>

        {reports?.length === 0 && <p className="muted">No usage statistics have been loaded yet.</p>}
        {reports && reports.length > 0 && (
          <div className="row between wrap">
            <label className="row inline">Usage statistics
              <select value={reportId ?? ''} onChange={(e) => setReportId(Number(e.target.value))}>
                {reports.map((r) => (
                  <option key={r.id} value={r.id}>
                    {formatName(r.format)} · {r.month} · {r.rating}+ · {r.battles.toLocaleString()} battles
                  </option>
                ))}
              </select>
            </label>
            <button onClick={createOpponent} disabled={!threats || threats.length === 0}>
              Use the top {MAX_TEAM_SIZE} as opponent team
            </button>
          </div>
        )}
        {status && <p className="muted small" role="status">{status}</p>}
        {reportId !== null && !threats && !status && <p className="muted">Loading…</p>}

        {threats && (
          <>
            <p className="muted small">
              The {threats.length} most used Pokémon, each with its most common set, against your team. Threat ={' '}
              usage × (how hard it hits your team − how hard your team hits it). Click a row for the matchups.
            </p>
            <div className="table-scroll">
              <table className="matrix threats">
                <thead>
                  <tr>
                    <th>Pokémon</th><th>Usage</th><th>Hits your team</th><th>You hit it</th>
                    <th>Can OHKO</th><th>Outspeeds</th><th>Threat</th>
                  </tr>
                </thead>
                <tbody>
                  {threats.map((t, i) => (
                    <Fragment key={t.set.species}>
                      <tr className="clickable" onClick={() => setOpen(open === i ? null : i)}>
                        <th><span className="row inline"><Icon species={t.set.species} />#{t.rank} {t.set.species}</span></th>
                        <td>{pct(t.usage * 100)}</td>
                        <td>{pct(t.hitsYou)}</td>
                        <td>{pct(t.youHit)}</td>
                        <td>{t.ohkos} / {team.length}</td>
                        <td>{t.outspeeds} / {team.length}</td>
                        <td className={t.score > 0 ? 'threat-high' : 'muted'}>{t.score.toFixed(2)}</td>
                      </tr>
                      {open === i && (
                        <tr className="detail">
                          <td colSpan={7}>
                            <div className="threat-detail">
                              <pre className="small">{exportTeam([t.set])}</pre>
                              <ul className="small">
                                {t.matchups.map((m, j) => (
                                  <li key={j}>
                                    <strong>{m.mine.species}</strong>: takes {m.theirs ? `${pct(m.theirs.percent)} from ${m.theirs.move}` : 'no damage'},
                                    {' '}deals {m.yours ? `${pct(m.yours.percent)} with ${m.yours.move}` : 'no damage'},
                                    {' '}{m.faster ? 'moves after it' : 'moves first'}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="muted small">Damage is each side&apos;s strongest move at its highest roll, capped at 100%, with the battle conditions from Compare teams.</p>
          </>
        )}
      </div>
    </div>
  );
}
