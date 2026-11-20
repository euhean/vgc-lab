import { useState } from 'react';
import type { Conditions } from '../lib/battle';
import { gen } from '../lib/dex';
import { describeGoal, optimize, optimizeNatures, toStats, type Goal, type Solution } from '../lib/optimizer';
import { spreadText, STAT_LABELS, STATS, totalEvs, type PokemonSet, type StatID } from '../lib/team';

type Kind = Goal['kind'];

/** A benchmark as edited in the form; turned into a Goal when the search runs. */
interface Draft {
  id: number;
  kind: Kind;
  target: number;
  move: string;
  hits: 1 | 2;
  /** Survive: the attacker's attacking stat stage. Speed: the target's Speed stage. */
  stage: number;
  myStage: number;
  intimidated: boolean;
  allRolls: boolean;
  myTailwind: boolean;
  targetTailwind: boolean;
}

const KIND_LABELS: Record<Kind, string> = {
  outspeed: 'Outspeed',
  underspeed: 'Underspeed (Trick Room)',
  survive: 'Survive an attack from',
  ko: 'KO with an attack',
};

const ADD_LABELS: Record<Kind, string> = {
  outspeed: 'Outspeed', underspeed: 'Underspeed (Trick Room)', survive: 'Survive', ko: 'KO',
};

const STAGES = [-2, -1, 0, 1, 2];
const stageLabel = (n: number) => (n === 0 ? '±0' : n > 0 ? `+${n}` : `${n}`);

/** Where leftovers go after the chosen stat, in this order. */
const LEFTOVER_ORDER: StatID[] = ['hp', 'def', 'spd', 'atk', 'spa', 'spe'];

function damagingMoves(moves: string[]): string[] {
  return moves.filter((m) => {
    const data = gen.moves.get(m);
    return data !== undefined && data.category !== 'Status';
  });
}

interface Props {
  set: PokemonSet;
  targets: PokemonSet[];
  conditions: Conditions;
  onApply: (set: PokemonSet) => void;
}

export default function EvOptimizer({ set, targets, conditions, onApply }: Props) {
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [nextId, setNextId] = useState(1);
  const [leftover, setLeftover] = useState<StatID>('hp');
  const [allNatures, setAllNatures] = useState(false);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Solution[] | null>(null);
  const [applied, setApplied] = useState('');

  if (targets.length === 0) {
    return (
      <p className="muted">
        Benchmarks are set against the opponent team&apos;s Pokémon. Choose an opponent team on the team page first.
      </p>
    );
  }

  const myMoves = damagingMoves(set.moves);
  const movesFor = (d: Draft) => (d.kind === 'survive' ? damagingMoves(targets[d.target]?.moves ?? []) : myMoves);

  const add = (kind: Kind) => {
    const draft: Draft = {
      id: nextId, kind, target: 0, move: '', hits: 1, stage: 0, myStage: 0,
      intimidated: false, allRolls: true, myTailwind: false, targetTailwind: false,
    };
    draft.move = movesFor(draft)[0] ?? '';
    setDrafts([...drafts, draft]);
    setNextId(nextId + 1);
    setResults(null);
  };

  const change = (id: number, patch: Partial<Draft>) => {
    setDrafts(drafts.map((d) => {
      if (d.id !== id) return d;
      const next = { ...d, ...patch };
      // A new target or kind may not have the previous move.
      if (!movesFor(next).includes(next.move)) next.move = movesFor(next)[0] ?? '';
      return next;
    }));
    setResults(null);
  };

  const needsMove = (d: Draft) => d.kind === 'survive' || d.kind === 'ko';
  const incomplete = drafts.filter((d) => needsMove(d) && !d.move);

  const toGoal = (d: Draft): Goal => {
    const target = targets[d.target];
    const minChance = d.allRolls ? 1 : 15 / 16;
    switch (d.kind) {
      case 'outspeed':
      case 'underspeed':
        return {
          kind: d.kind, target, myStage: d.myStage, targetStage: d.stage,
          myTailwind: d.myTailwind, targetTailwind: d.targetTailwind,
        };
      case 'survive':
        return {
          kind: 'survive', attacker: target, move: d.move, hits: d.hits,
          attackerStage: d.stage, intimidated: d.intimidated, minChance,
        };
      case 'ko':
        return { kind: 'ko', defender: target, move: d.move, hits: d.hits, minChance };
    }
  };

  const run = () => {
    setBusy(true);
    setApplied('');
    // Let the "Searching…" state paint before the synchronous search starts.
    setTimeout(() => {
      const goals = drafts.map(toGoal);
      const options = { leftoverTo: [leftover, ...LEFTOVER_ORDER.filter((s) => s !== leftover)] };
      const found = allNatures ? optimizeNatures(set, goals, conditions, options) : [optimize(set, goals, conditions, options)];
      // With every nature compared and none working, show why with the current nature.
      setResults(found.length > 0 ? found.slice(0, 3) : [optimize(set, goals, conditions, options)]);
      setBusy(false);
    }, 0);
  };

  const apply = (solution: Solution) => {
    onApply(solution.set);
    setApplied(`Applied: ${solution.set.nature}, ${spreadText(solution.set)}`);
  };

  return (
    <div className="stack">
      <p className="muted small">
        Add the benchmarks this Pokémon must hit. The optimizer finds the spread that meets all of them with the
        fewest EVs, using the sets of your opponent team and the battle conditions from the comparison panel.
      </p>

      {drafts.map((d) => (
        <div key={d.id} className="goal">
          <label>Benchmark
            <select value={d.kind} onChange={(e) => change(d.id, { kind: e.target.value as Kind })}>
              {(Object.keys(KIND_LABELS) as Kind[]).map((k) => <option key={k} value={k}>{KIND_LABELS[k]}</option>)}
            </select>
          </label>
          <label>{d.kind === 'ko' ? 'Target' : 'Pokémon'}
            <select value={d.target} onChange={(e) => change(d.id, { target: Number(e.target.value) })}>
              {targets.map((t, i) => <option key={i} value={i}>{t.species}</option>)}
            </select>
          </label>

          {(d.kind === 'outspeed' || d.kind === 'underspeed') && (
            <>
              <label>Their Speed
                <select value={d.stage} onChange={(e) => change(d.id, { stage: Number(e.target.value) })}>
                  {STAGES.map((n) => <option key={n} value={n}>{stageLabel(n)}</option>)}
                </select>
              </label>
              <label>My Speed
                <select value={d.myStage} onChange={(e) => change(d.id, { myStage: Number(e.target.value) })}>
                  {STAGES.map((n) => <option key={n} value={n}>{stageLabel(n)}</option>)}
                </select>
              </label>
              <label className="row inline">
                <input type="checkbox" checked={d.myTailwind} onChange={(e) => change(d.id, { myTailwind: e.target.checked })} />
                My Tailwind
              </label>
              <label className="row inline">
                <input type="checkbox" checked={d.targetTailwind} onChange={(e) => change(d.id, { targetTailwind: e.target.checked })} />
                Their Tailwind
              </label>
            </>
          )}

          {needsMove(d) && (
            <>
              <label>Move
                <select value={d.move} onChange={(e) => change(d.id, { move: e.target.value })} disabled={movesFor(d).length === 0}>
                  {movesFor(d).length === 0 && <option value="">No damaging moves</option>}
                  {movesFor(d).map((m) => <option key={m}>{m}</option>)}
                </select>
              </label>
              <label>Hits
                <select value={d.hits} onChange={(e) => change(d.id, { hits: Number(e.target.value) as 1 | 2 })}>
                  <option value={1}>{d.kind === 'ko' ? 'OHKO' : '1 hit'}</option>
                  <option value={2}>{d.kind === 'ko' ? '2HKO' : '2 hits'}</option>
                </select>
              </label>
              {d.kind === 'survive' && (
                <>
                  <label>Their attack stage
                    <select value={d.stage} onChange={(e) => change(d.id, { stage: Number(e.target.value) })}>
                      {STAGES.map((n) => <option key={n} value={n}>{stageLabel(n)}</option>)}
                    </select>
                  </label>
                  <label className="row inline">
                    <input type="checkbox" checked={d.intimidated} onChange={(e) => change(d.id, { intimidated: e.target.checked })} />
                    Intimidated
                  </label>
                </>
              )}
              <label>Rolls
                <select value={d.allRolls ? 'all' : '15'} onChange={(e) => change(d.id, { allRolls: e.target.value === 'all' })}>
                  <option value="all">Every roll</option>
                  <option value="15">15 of 16 rolls</option>
                </select>
              </label>
            </>
          )}

          <button className="ghost small" onClick={() => { setDrafts(drafts.filter((x) => x.id !== d.id)); setResults(null); }}>
            Remove
          </button>
        </div>
      ))}

      <div className="row wrap">
        {(Object.keys(KIND_LABELS) as Kind[]).map((k) => (
          <button key={k} className="ghost small" onClick={() => add(k)}>+ {ADD_LABELS[k]}</button>
        ))}
      </div>

      <div className="row wrap">
        <label className="row inline">Leftover EVs to
          <select value={leftover} onChange={(e) => setLeftover(e.target.value as StatID)}>
            {STATS.map((s) => <option key={s} value={s}>{STAT_LABELS[s]}</option>)}
          </select>
        </label>
        <label className="row inline">
          <input type="checkbox" checked={allNatures} onChange={(e) => setAllNatures(e.target.checked)} />
          Compare every nature
        </label>
        <button onClick={run} disabled={busy || drafts.length === 0 || incomplete.length > 0}>
          {busy && <span className="spinner" aria-hidden="true" />}
          {busy ? 'Searching…' : 'Find spread'}
        </button>
      </div>
      {incomplete.length > 0 && <p className="error small">Some benchmarks need a damaging move.</p>}
      {applied && <p className="muted small" role="status">{applied}</p>}

      {results?.map((r, i) => (
        <div key={i} className="card stack tight result">
          <div className="row between wrap">
            <strong>{r.ok ? `${r.set.nature} · ${spreadText(r.set)}` : 'No spread meets every benchmark'}</strong>
            {r.ok && <button className="small" onClick={() => apply(r)}>Apply</button>}
          </div>
          {r.ok && (
            <span className="muted small">
              {r.evsForGoals} EVs for the benchmarks, {totalEvs(r.set.evs) - r.evsForGoals} left over
              {r.set.ivs.spe !== set.ivs.spe ? ` · Speed IV ${r.set.ivs.spe}` : ''}
              {' · '}Stats {STATS.map((s) => toStats(r.set)[s]).join(' / ')}
            </span>
          )}
          {r.problem && <p className="error small">{r.problem}</p>}
          <ul className="checks">
            {r.checks.map((c, j) => (
              <li key={j} className={c.ok ? 'ok' : 'fail'}>
                <strong>{describeGoal(c.goal)}</strong>
                <span className="muted small">{c.detail}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
