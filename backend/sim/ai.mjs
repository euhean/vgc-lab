/**
 * A simple heuristic VGC player: good enough that simulated win rates mean something, simple
 * enough to explain in a few lines.
 *
 * Each turn, every active Pokémon scores each of its moves against each possible target and
 * uses the best one:
 *   - Damaging moves: an estimate of the share of the target's remaining HP it takes, from the
 *     damage formula with base power, attacking and defending stats with stat stages, STAB,
 *     type effectiveness and accuracy. Spread moves add up every target hit, minus the damage
 *     to the ally.
 *   - Fake Out on the first turn out, Tailwind when the side has none, Trick Room when the side
 *     is slower, a sleep or status move on a healthy target, Protect now and then (never twice
 *     in a row).
 * It terastallizes when its best move matches its Tera type, never switches by choice, and
 * sends in the replacement with the best move against the foes when one faints. A little
 * noise varies its choices from game to game.
 *
 * It reads the battle state directly (it knows the opponent's sets), which keeps it simple.
 */
import { RandomPlayerAI } from '@pkmn/sim';

const PROTECT = new Set(['protect', 'detect', 'spikyshield', 'kingsshield', 'banefulbunker', 'silktrap', 'burningbulwark']);
const SPREAD_FOES = new Set(['allAdjacentFoes']);
const SPREAD_ALL = new Set(['allAdjacent']);
const NEEDS_TARGET = new Set(['normal', 'any', 'adjacentFoe']);
const NOISE = 0.05;

/** Stat stage multiplier, e.g. +1 → 1.5, -1 → 2/3. */
const stage = (n) => (n >= 0 ? (2 + n) / 2 : 2 / (2 - n));

function typesOf(pokemon) {
  return pokemon.terastallized && pokemon.terastallized !== 'Stellar' ? [pokemon.terastallized] : pokemon.types;
}

function stat(pokemon, name) {
  return pokemon.storedStats[name] * stage(pokemon.boosts[name]);
}

const alive = (pokemon) => pokemon && !pokemon.fainted && pokemon.hp > 0;

/** Estimated share (0–1) of the target's remaining HP that the move takes. */
export function damageShare(dex, attacker, move, target) {
  if (move.category === 'Status' || !alive(target)) return 0;
  const targetTypes = typesOf(target);
  if (!dex.getImmunity(move.type, targetTypes)) return 0;
  const physical = move.category === 'Physical';
  const attack = move.overrideOffensiveStat === 'def' ? stat(attacker, 'def') : stat(attacker, physical ? 'atk' : 'spa');
  const defense = stat(target, move.overrideDefensiveStat === 'def' || physical ? 'def' : 'spd');
  const power = move.basePower || 60; // moves with variable power
  const base = Math.floor(Math.floor((Math.floor((2 * attacker.level) / 5 + 2) * power * attack) / defense) / 50) + 2;
  const attackerTypes = [...attacker.types, attacker.terastallized].filter(Boolean);
  const stab = attackerTypes.includes(move.type) ? 1.5 : 1;
  const effectiveness = 2 ** dex.getEffectiveness(move.type, targetTypes);
  const accuracy = move.accuracy === true ? 1 : move.accuracy / 100;
  return Math.min(1, (base * stab * effectiveness * accuracy) / target.hp);
}

/** Possible choices for the active Pokémon in slot `i`, each with a score. */
export function scoreOptions(battle, side, i, active, prng) {
  const dex = battle.dex;
  const pokemon = side.active[i];
  const ally = side.active[i ^ 1];
  const foes = side.foe.active;
  const doubles = side.active.length > 1;
  const slower = side.active.filter(alive).reduce((s, p) => s + stat(p, 'spe'), 0) <
    foes.filter(alive).reduce((s, p) => s + stat(p, 'spe'), 0);
  const options = [];

  active.moves.forEach((slot, j) => {
    if (slot.disabled) return;
    const move = dex.moves.get(slot.id);
    const choice = `move ${j + 1}`;
    const noise = () => prng.random() * NOISE;

    if (move.category !== 'Status') {
      if (SPREAD_FOES.has(move.target) || SPREAD_ALL.has(move.target)) {
        const hits = foes.filter(alive);
        const spread = doubles && hits.length > 1 ? 0.75 : 1;
        let score = hits.reduce((s, f) => s + damageShare(dex, pokemon, move, f) * spread, 0);
        if (SPREAD_ALL.has(move.target) && alive(ally)) score -= damageShare(dex, pokemon, move, ally) * spread;
        options.push({ choice, score: score + noise(), move });
        return;
      }
      if (NEEDS_TARGET.has(move.target) && doubles) {
        foes.forEach((foe, t) => {
          if (!alive(foe)) return;
          let score = damageShare(dex, pokemon, move, foe);
          // Fake Out only works on the first move after coming in, like the move's own check.
          if (move.id === 'fakeout') score = pokemon.activeMoveActions === 0 && score > 0 ? 0.9 : 0;
          options.push({ choice: `${choice} ${t + 1}`, score: score + noise(), move });
        });
        return;
      }
      const foe = foes.find(alive);
      options.push({ choice, score: damageShare(dex, pokemon, move, foe) + noise(), move });
      return;
    }

    // Status moves.
    let score = 0.02;
    if (PROTECT.has(move.id)) score = PROTECT.has(pokemon.lastMove?.id) ? 0 : 0.2 * prng.random();
    else if (move.id === 'tailwind') score = side.sideConditions.tailwind ? 0 : 0.6;
    else if (move.id === 'trickroom') score = !battle.field.pseudoWeather.trickroom && slower ? 0.7 : 0;
    else if (move.status) {
      // Sleep, paralysis, burn…: worth it on a foe that has no status yet.
      const target = foes.find((f) => alive(f) && !f.status);
      if (target) {
        const t = foes.indexOf(target);
        const accuracy = move.accuracy === true ? 1 : move.accuracy / 100;
        const value = move.status === 'slp' ? 0.6 : 0.35;
        const suffix = NEEDS_TARGET.has(move.target) && doubles ? ` ${t + 1}` : '';
        options.push({ choice: `${choice}${suffix}`, score: value * accuracy + noise(), move });
        return;
      }
      score = 0;
    }
    let target = '';
    if (doubles && NEEDS_TARGET.has(move.target)) target = ` ${foes.findIndex(alive) + 1}`;
    if (doubles && move.target === 'adjacentAlly') target = ` -${(i ^ 1) + 1}`;
    if (doubles && move.target === 'adjacentAllyOrSelf') target = ` -${i + 1}`;
    options.push({ choice: `${choice}${target}`, score: score + noise(), move });
  });
  return options;
}

export class HeuristicAI extends RandomPlayerAI {
  /**
   * @param playerStream the player's stream from BattleStreams.getPlayerStreams
   * @param battleStream the BattleStream, to read the battle state
   * @param sideId 'p1' or 'p2'
   */
  constructor(playerStream, battleStream, sideId, seed) {
    super(playerStream, { seed });
    this.battleStream = battleStream;
    this.sideId = sideId;
  }

  get side() {
    return this.battleStream.battle.sides.find((s) => s.id === this.sideId);
  }

  /** Brings four of the six at random, in random order: the first two lead. */
  chooseTeamPreview(team) {
    const order = team.map((_, i) => i + 1);
    this.prng.shuffle(order);
    return `team ${order.join('')}`;
  }

  /** On a faint, sends in the bench Pokémon with the best move against the foes. */
  chooseSwitch(_active, switches) {
    const side = this.side;
    const dex = this.battleStream.battle.dex;
    const best = (pokemon) => Math.max(0, ...pokemon.moveSlots.flatMap((m) =>
      side.foe.active.map((foe) => damageShare(dex, pokemon, dex.moves.get(m.id), foe))));
    const scored = switches.map((s) => ({ slot: s.slot, score: best(side.pokemon[s.slot - 1]) + this.prng.random() * NOISE }));
    return scored.sort((a, b) => b.score - a.score)[0].slot;
  }

  receiveRequest(request) {
    if (!request.active || request.wait || request.forceSwitch || request.teamPreview) {
      super.receiveRequest(request);
      return;
    }
    const side = this.side;
    let canTera = true;
    const choices = request.active.map((active, i) => {
      const pokemon = request.side.pokemon[i];
      if (pokemon.condition.endsWith(' fnt') || pokemon.commanding) return 'pass';
      const options = scoreOptions(this.battleStream.battle, side, i, active, this.prng);
      if (options.length === 0) return 'pass';
      const best = options.reduce((a, b) => (b.score > a.score ? b : a));
      if (canTera && active.canTerastallize && best.move.category !== 'Status' && best.move.type === pokemon.teraType) {
        canTera = false;
        return `${best.choice} terastallize`;
      }
      return best.choice;
    });
    this.choose(choices.join(', '));
  }
}
