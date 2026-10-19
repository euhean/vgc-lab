import { calcDamage, formulaBreakdown, percentRange, statusEffect, type Conditions } from '../lib/battle';
import { gen } from '../lib/dex';
import type { PokemonSet } from '../lib/team';

/** What a move does: the damage formula and estimate against the target, or the effect of a status move. */
export default function MoveTooltip({ attacker, move, target, conditions }: {
  attacker: PokemonSet; move: string; target: PokemonSet | null; conditions: Conditions;
}) {
  const data = gen.moves.get(move);
  if (!data) return null;
  const header = <div className="muted small">{data.type} · {data.category} · {data.basePower || '—'} BP · {data.accuracy === true ? '—' : `${data.accuracy}%`}</div>;

  if (data.category === 'Status') {
    return <div className="tooltip">{header}<p>{statusEffect(move)}</p></div>;
  }
  if (!target) {
    return <div className="tooltip">{header}<p>{data.shortDesc}</p><p className="muted">Pick a target to see the damage.</p></div>;
  }

  const result = calcDamage(attacker, target, move, conditions, true);
  const f = formulaBreakdown(result, conditions);
  const [min, max] = result.range();
  const [pmin, pmax] = percentRange(result);

  return (
    <div className="tooltip">
      {header}
      <code className="formula">
        ⌊⌊⌊2×{f.level}/5+2⌋ × {f.power} × {f.attack}/{f.defense}⌋ / 50⌋ + 2 = {f.baseDamage}
      </code>
      <div className="muted small">Level × Power × {f.attackStat}/{f.defenseStat} (base damage)</div>
      <ul className="mods">
        {f.modifiers.map((m) => <li key={m.label}><span>{m.label}</span><span>{m.value}</span></li>)}
      </ul>
      <p><strong>{min}–{max} HP ({pmin}–{pmax}%)</strong></p>
      <p className="muted small">{result.kochance(false).text || 'No KO chance'}</p>
    </div>
  );
}
