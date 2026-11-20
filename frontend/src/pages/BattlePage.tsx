import { useEffect, useReducer, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Battle, type Pokemon } from '@pkmn/client';
import { Protocol } from '@pkmn/protocol';
import { ChoiceBuilder, LogFormatter } from '@pkmn/view';
import { api, tokenStore } from '../api/client';
import { Sprite } from '../components/Sprite';
import { gens } from '../lib/dex';
import { liveBattleUrl, moveChoice, targetLocations } from '../lib/live-battle';

const API_URL: string = import.meta.env.VITE_API_URL;

type ServerMessage =
  | { type: 'chunk'; data: string }
  | { type: 'end'; winner: 'p1' | 'p2' | null }
  | { type: 'error'; message: string };

/** The battle as the client tracks it: state, readable log and the pending request. */
class BattleView {
  readonly battle = new Battle(gens);
  readonly formatter = new LogFormatter('p1', this.battle);
  log: string[] = [];
  request: Protocol.Request | null = null;
  builder: ChoiceBuilder | null = null;
  error = '';

  /** The choice for the pending request was sent: wait for the next one. */
  chosen() {
    this.request = null;
    this.builder = null;
  }

  receive(chunk: string) {
    for (const line of chunk.split('\n')) {
      if (line.startsWith('|request|')) {
        const request = Protocol.parseRequest(line.slice('|request|'.length) as Protocol.RequestJSON);
        this.battle.update(request);
        this.request = request;
        this.builder = request.requestType === 'move' || request.requestType === 'switch' ? new ChoiceBuilder(request) : null;
        this.error = '';
      } else if (line.startsWith('|error|')) {
        // An invalid choice: start the turn's choices again.
        this.error = line.slice('|error|'.length);
        if (this.request) this.builder = new ChoiceBuilder(this.request);
      } else if (line) {
        const { args, kwArgs } = Protocol.parseBattleLine(line);
        const text = this.formatter.formatText(args, kwArgs).trim();
        if (text) this.log.push(...text.split('\n').filter(Boolean));
        this.battle.add(args, kwArgs);
      }
    }
  }
}

export default function BattlePage() {
  const { id, opponentId } = useParams();
  // A mutable object that the protocol updates in place; `rerender` shows its changes.
  const [view] = useState(() => new BattleView());
  const socket = useRef<WebSocket | null>(null);
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const [status, setStatus] = useState('Connecting…');
  const [winner, setWinner] = useState<'p1' | 'p2' | null | undefined>(undefined);
  const logEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let closed = false;
    // Refreshes the access token if it expired, since the socket can't.
    api.me().then(() => {
      if (closed) return;
      ws = new WebSocket(liveBattleUrl(API_URL));
      socket.current = ws;
      ws.onopen = () => {
        ws!.send(JSON.stringify({ token: tokenStore.access(), team_id: Number(id), opponent_team_id: Number(opponentId) }));
        setStatus('');
      };
      ws.onmessage = (event) => {
        const message = JSON.parse(event.data as string) as ServerMessage;
        if (message.type === 'chunk') view.receive(message.data);
        if (message.type === 'end') setWinner(message.winner);
        if (message.type === 'error') setStatus(message.message);
        rerender();
      };
      ws.onclose = (event) => {
        if (event.code >= 4000) setStatus(event.reason || 'The battle could not start');
      };
    }).catch((e: Error) => setStatus(e.message));
    return () => {
      closed = true;
      ws?.close(); // leaving the page forfeits the battle
    };
  }, [id, opponentId, view]);

  useEffect(() => {
    logEnd.current?.scrollIntoView({ block: 'nearest' });
  });

  const send = (choice: string) => {
    socket.current!.send(JSON.stringify({ type: 'choose', choice }));
    view.chosen();
    rerender();
  };

  const { battle, request, builder, log, error } = view;
  const over = winner !== undefined;

  return (
    <div className="stack battle-page">
      <div className="row between wrap">
        <div className="row">
          <Link to={`/teams/${id}`} className="ghost button">←</Link>
          <h2>Battle against the AI</h2>
        </div>
        <span className="muted">{battle.turn > 0 ? `Turn ${battle.turn}` : ''}</span>
      </div>
      {status && <p className="error" role="alert">{status}</p>}

      <div className="battle-grid">
        <section className="stack">
          <Field label="Opponent" active={battle.p2.active} />
          <Field label="You" active={battle.p1.active} />

          {over && (
            <div className="card stack result-banner" role="status">
              <strong>{winner === 'p1' ? 'You won!' : winner === 'p2' ? 'You lost.' : 'Tie.'}</strong>
              <div className="row">
                <button onClick={() => window.location.reload()}>Rematch</button>
                <Link to={`/teams/${id}`} className="ghost button">Back to the team</Link>
              </div>
            </div>
          )}
          {!over && error && <p className="error small">{error}</p>}
          {!over && request?.requestType === 'team' && <TeamPreview request={request} onChoose={send} />}
          {!over && builder && <Choices key={builder.request.rqid} battle={battle} builder={builder} onChange={rerender} onDone={send} />}
          {!over && !request && battle.turn > 0 && <p className="muted">Waiting for the opponent…</p>}
        </section>

        <section className="card battle-log" aria-label="Battle log">
          {log.map((line, i) => <LogLine key={i} line={line} />)}
          <div ref={logEnd} />
        </section>
      </div>
    </div>
  );
}

/** A log line; the formatter marks names in **bold** and turns as "== Turn 2 ==". */
function LogLine({ line }: { line: string }) {
  if (line.startsWith('==')) return <p className="turn">{line.replace(/=/g, '').trim()}</p>;
  return <p>{line.split('**').map((part, i) => (i % 2 ? <strong key={i}>{part}</strong> : part))}</p>;
}

function Field({ label, active }: { label: string; active: (Pokemon | null)[] }) {
  return (
    <div className="stack tight">
      <span className="muted small">{label}</span>
      <div className="field-row">
        {active.map((p, i) => (p ? <ActiveCard key={i} pokemon={p} /> : <div key={i} className="card active-card empty muted">Empty</div>))}
      </div>
    </div>
  );
}

function ActiveCard({ pokemon }: { pokemon: Pokemon }) {
  const percent = pokemon.maxhp ? Math.round((pokemon.hp / pokemon.maxhp) * 100) : 0;
  return (
    <div className={`card active-card ${pokemon.fainted ? 'fainted' : ''}`}>
      <Sprite species={pokemon.speciesForme} size={64} />
      <div className="stack tight grow">
        <strong>{pokemon.name}</strong>
        <div className="hp-bar" aria-label={`${percent}% HP`}><div style={{ width: `${percent}%` }} /></div>
        <span className="small muted">
          {percent}% {pokemon.status ? `· ${pokemon.status.toUpperCase()}` : ''}
          {pokemon.terastallized ? ` · Tera ${pokemon.terastallized}` : ''}
        </span>
      </div>
    </div>
  );
}

function TeamPreview({ request, onChoose }: { request: Protocol.TeamRequest; onChoose: (choice: string) => void }) {
  const [order, setOrder] = useState<number[]>([]);
  const team = request.side.pokemon;
  const size = Math.min(request.maxTeamSize ?? 4, team.length);
  const toggle = (n: number) => setOrder(order.includes(n) ? order.filter((x) => x !== n) : order.length < size ? [...order, n] : order);
  return (
    <div className="card stack">
      <strong>Choose {size} Pokémon to bring.{size > 2 ? ' The first two lead.' : ''}</strong>
      <div className="row wrap">
        {team.map((p, i) => {
          const position = order.indexOf(i + 1);
          return (
            <button key={i} className={`ghost pick ${position >= 0 ? 'picked' : ''}`} onClick={() => toggle(i + 1)}>
              {position >= 0 && <span className="badge">{position + 1}</span>}
              {p.speciesForme}
            </button>
          );
        })}
      </div>
      <button onClick={() => onChoose(`team ${order.join('')}`)} disabled={order.length !== size}>Start battle</button>
    </div>
  );
}

function Choices({ battle, builder, onChange, onDone }: {
  battle: Battle; builder: ChoiceBuilder; onChange: () => void; onDone: (choice: string) => void;
}) {
  const [move, setMove] = useState<number | null>(null);
  const [tera, setTera] = useState(false);
  const request = builder.request as Protocol.MoveRequest | Protocol.SwitchRequest;
  const slot = builder.index();
  const active = builder.currentMoveRequest();
  const side = request.side.pokemon;
  const mine = side[slot];

  const add = (choice: string) => {
    const problem = builder.addChoice(choice);
    if (problem) throw new Error(problem);
    setMove(null);
    setTera(false);
    if (builder.isDone()) onDone(builder.toString());
    else onChange();
  };

  const switches = side
    .map((p, i) => ({ p, n: i + 1 }))
    .filter(({ p, n }) => !p.active && !p.condition.endsWith(' fnt') && !builder.alreadySwitchingIn.includes(n));
  const canSwitch = request.requestType === 'switch' || !active?.trapped;
  const moves = active?.moves.filter((m): m is Extract<typeof m, { pp: number }> => 'pp' in m) ?? [];
  const chosen = move === null ? null : moves[move - 1];
  const targets = chosen ? targetLocations(chosen.target, slot) : [];
  const targetName = (loc: number) => (loc > 0 ? battle.p2.active[loc - 1] : battle.p1.active[-loc - 1])?.name;

  return (
    <div className="card stack">
      <strong>{request.requestType === 'switch' ? `Send in a Pokémon for ${mine.name}` : `What will ${mine.name} do?`}</strong>
      {active && (
        <>
          <div className="move-grid">
            {moves.map((m, i) => (
              <button key={m.id} className={move === i + 1 ? '' : 'ghost'} disabled={m.disabled}
                onClick={() => (targetLocations(m.target, slot).length > 0 ? setMove(i + 1) : add(moveChoice(i + 1, null, tera)))}>
                {m.name} <span className="muted small">{m.pp}/{m.maxpp}</span>
              </button>
            ))}
          </div>
          {active.canTerastallize && !builder.alreadyTera && (
            <label className="row inline">
              <input type="checkbox" checked={tera} onChange={(e) => setTera(e.target.checked)} />
              Terastallize ({active.canTerastallize})
            </label>
          )}
        </>
      )}
      {chosen && (
        <div className="row wrap" role="group" aria-label="Targets">
          <span className="muted small">Target:</span>
          {targets.filter((loc) => targetName(loc)).map((loc) => (
            <button key={loc} className="ghost small" onClick={() => add(moveChoice(move!, loc, tera))}>
              {targetName(loc)}{loc < 0 ? ' (ally)' : ''}
            </button>
          ))}
        </div>
      )}
      {canSwitch && switches.length > 0 && (
        <div className="row wrap" role="group" aria-label="Switches">
          <span className="muted small">Switch to:</span>
          {switches.map(({ p, n }) => (
            <button key={n} className="ghost small" onClick={() => add(`switch ${n}`)}>{p.speciesForme}</button>
          ))}
        </div>
      )}
    </div>
  );
}
