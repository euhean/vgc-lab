import { calculate, Field, Move, Pokemon, Side, type Result } from '@smogon/calc';
import type { Generation as CalcGeneration } from '@smogon/calc/dist/data/interface';
import { getBaseDamage, getFinalSpeed } from '@smogon/calc/dist/mechanics/util';
import type { TypeName } from '@pkmn/data';
import { gen, TYPES } from './dex';
import type { PokemonSet } from './team';

/**
 * The calc accepts @pkmn/data generations at runtime (its "adaptable" mode), but its own
 * type declarations differ slightly from @pkmn/data's, so the type is bridged here once.
 */
const calcGen = gen as unknown as CalcGeneration;

export type GameType = 'Doubles' | 'Singles';
export type Weather = '' | 'Sun' | 'Rain' | 'Sand' | 'Snow';
export type Terrain = '' | 'Electric' | 'Grassy' | 'Psychic' | 'Misty';

export interface SideConditions {
  tailwind: boolean;
  reflect: boolean;
  lightScreen: boolean;
  auroraVeil: boolean;
  helpingHand: boolean;
  /** Terastallize every Pokémon on this side. */
  tera: boolean;
}

export interface Conditions {
  gameType: GameType;
  weather: Weather;
  terrain: Terrain;
  trickRoom: boolean;
  /** Conditions on the side of the team being edited. */
  mine: SideConditions;
  /** Conditions on the opponent's side. */
  theirs: SideConditions;
}

const noSide: SideConditions = { tailwind: false, reflect: false, lightScreen: false, auroraVeil: false, helpingHand: false, tera: false };

export const DEFAULT_CONDITIONS: Conditions = {
  gameType: 'Doubles', weather: '', terrain: '', trickRoom: false, mine: noSide, theirs: noSide,
};

export function toCalcPokemon(set: PokemonSet, terastallized: boolean): Pokemon {
  return new Pokemon(calcGen, set.species, {
    level: set.level,
    // Ignore half-typed or unknown item names while the user is editing.
    item: gen.items.get(set.item)?.name,
    ability: set.ability || undefined,
    nature: set.nature,
    evs: set.evs,
    ivs: set.ivs,
    moves: set.moves,
    teraType: terastallized && set.teraType ? (set.teraType as TypeName) : undefined,
  });
}

function toSide(s: SideConditions): Side {
  return new Side({
    isTailwind: s.tailwind,
    isReflect: s.reflect,
    isLightScreen: s.lightScreen,
    isAuroraVeil: s.auroraVeil,
    isHelpingHand: s.helpingHand,
  } as Side);
}

/** Builds the calc field. `attackerIsMine` decides which side conditions belong to the attacker. */
export function toField(c: Conditions, attackerIsMine: boolean): Field {
  const attacker = attackerIsMine ? c.mine : c.theirs;
  const defender = attackerIsMine ? c.theirs : c.mine;
  return new Field({
    gameType: c.gameType,
    weather: c.weather || undefined,
    terrain: c.terrain || undefined,
    attackerSide: toSide(attacker),
    defenderSide: toSide(defender),
  });
}

export function calcDamage(attacker: PokemonSet, defender: PokemonSet, move: string, c: Conditions, attackerIsMine: boolean): Result {
  const [attackerSide, defenderSide] = attackerIsMine ? [c.mine, c.theirs] : [c.theirs, c.mine];
  return calculate(
    calcGen,
    toCalcPokemon(attacker, attackerSide.tera),
    toCalcPokemon(defender, defenderSide.tera),
    new Move(calcGen, move),
    toField(c, attackerIsMine),
  );
}

/** Damage as a percentage range of the defender's max HP. */
export function percentRange(result: Result): [number, number] {
  const [min, max] = result.range();
  const hp = result.defender.maxHP();
  const pct = (n: number) => Math.round((n / hp) * 1000) / 10;
  return [pct(min), pct(max)];
}

export interface FormulaBreakdown {
  level: number;
  power: number;
  attackStat: string;
  attack: number;
  defenseStat: string;
  defense: number;
  baseDamage: number;
  modifiers: { label: string; value: string }[];
}

const STAT_NAME = { atk: 'Atk', def: 'Def', spa: 'SpA', spd: 'SpD', spe: 'Spe', hp: 'HP' } as const;

/**
 * The Gen 5+ base damage formula with this matchup's numbers plugged in:
 * floor(floor(floor(2 × Level / 5 + 2) × Power × A / D) / 50) + 2.
 * Everything after the base damage is listed as a multiplier; the calc's result applies all of them exactly.
 */
export function formulaBreakdown(result: Result, c: Conditions): FormulaBreakdown {
  const { attacker, defender, move } = result;
  const physical = move.category === 'Physical';
  const data = gen.moves.get(move.name);
  const attackKey = data?.overrideOffensiveStat ?? (physical ? 'atk' : 'spa');
  const defenseKey = data?.overrideDefensiveStat ?? (physical ? 'def' : 'spd');
  const attackSource = data?.overrideOffensivePokemon === 'target' ? defender : attacker;
  const attack = attackSource.stats[attackKey];
  const defense = defender.stats[defenseKey];
  const power = result.rawDesc.moveBP ?? move.bp;

  const types = (defender.teraType ? [defender.teraType] : defender.types) as TypeName[];
  const effectiveness = gen.types.totalEffectiveness(move.type, types);
  const attackerTypes = attacker.teraType ? [...attacker.types, attacker.teraType] : attacker.types;
  const modifiers = [
    { label: 'Random roll', value: '×0.85–1.00' },
    { label: 'Type effectiveness', value: `×${effectiveness}` },
  ];
  if (attackerTypes.includes(move.type)) modifiers.push({ label: 'STAB', value: attacker.hasAbility('Adaptability') ? '×2' : '×1.5' });
  const spread = data && ['allAdjacentFoes', 'allAdjacent'].includes(data.target);
  if (spread && c.gameType === 'Doubles') modifiers.push({ label: 'Spread move', value: '×0.75' });
  if (move.isCrit) modifiers.push({ label: 'Critical hit', value: '×1.5' });
  for (const [key, label] of [
    ['attackerItem', 'Item'], ['attackerAbility', 'Ability'], ['weather', 'Weather'], ['terrain', 'Terrain'],
    ['isReflect', 'Reflect'], ['isLightScreen', 'Light Screen'], ['isAuroraVeil', 'Aurora Veil'],
    ['isHelpingHand', 'Helping Hand'], ['defenderItem', 'Defender item'], ['defenderAbility', 'Defender ability'],
  ] as const) {
    const value = result.rawDesc[key];
    if (value) modifiers.push({ label, value: value === true ? 'applied' : String(value) });
  }

  return {
    level: attacker.level,
    power,
    attackStat: STAT_NAME[attackKey],
    attack,
    defenseStat: STAT_NAME[defenseKey],
    defense,
    baseDamage: getBaseDamage(attacker.level, power, attack, defense),
    modifiers,
  };
}

/** Effective speed with item, ability, Tailwind and weather/terrain speed abilities applied. */
export function effectiveSpeed(set: PokemonSet, c: Conditions, mine: boolean): number {
  const field = toField(c, mine);
  return getFinalSpeed(calcGen, toCalcPokemon(set, false), field, field.attackerSide);
}

export interface SpeedEntry {
  set: PokemonSet;
  mine: boolean;
  speed: number;
}

/** Turn order: fastest first, or slowest first under Trick Room. */
export function speedOrder(myTeam: PokemonSet[], theirTeam: PokemonSet[], c: Conditions): SpeedEntry[] {
  const entries = [
    ...myTeam.map((set) => ({ set, mine: true, speed: effectiveSpeed(set, c, true) })),
    ...theirTeam.map((set) => ({ set, mine: false, speed: effectiveSpeed(set, c, false) })),
  ];
  return entries.sort((a, b) => (c.trickRoom ? a.speed - b.speed : b.speed - a.speed));
}

/** Multiplier each attacking type deals to a set, using its Tera Type when terastallized. */
export function defensiveMatchups(set: PokemonSet, terastallized: boolean): Record<TypeName, number> {
  const types = terastallized && set.teraType ? [set.teraType as TypeName] : gen.species.get(set.species)!.types;
  return Object.fromEntries(TYPES.map((t) => [t, gen.types.totalEffectiveness(t, types)])) as Record<TypeName, number>;
}

/** How many team members are weak (>1) or resist/immune (<1) to each attacking type. */
export function teamWeaknesses(team: PokemonSet[], terastallized: boolean): { type: TypeName; weak: number; resist: number }[] {
  const tables = team.map((s) => defensiveMatchups(s, terastallized));
  return TYPES.map((type) => ({
    type,
    weak: tables.filter((t) => t[type] > 1).length,
    resist: tables.filter((t) => t[type] < 1).length,
  }));
}

/** One-line summary of a status move's effect. */
export function statusEffect(moveName: string): string {
  const move = gen.moves.get(moveName);
  if (!move) throw new Error(`Unknown move: ${moveName}`);
  const parts: string[] = [];
  if (move.boosts) {
    const who = move.target === 'self' || move.target === 'allySide' || move.target === 'adjacentAllyOrSelf' ? 'user' : 'target';
    for (const [stat, n] of Object.entries(move.boosts)) {
      parts.push(`${n! > 0 ? '+' : ''}${n} ${STAT_NAME[stat as keyof typeof STAT_NAME] ?? stat} (${who})`);
    }
  }
  if (move.status) parts.push(`Inflicts ${move.status.toUpperCase()}`);
  if (move.priority) parts.push(`Priority ${move.priority > 0 ? '+' : ''}${move.priority}`);
  return [move.shortDesc, ...parts].filter(Boolean).join(' · ');
}
