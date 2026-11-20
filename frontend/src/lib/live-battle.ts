/** Helpers for playing a live battle against the AI (pages/BattlePage.tsx). */

/** The WebSocket URL of the live battle endpoint, from the API's http(s) URL. */
export function liveBattleUrl(apiUrl: string): string {
  return `${apiUrl.replace(/^http/, 'ws')}/battles/live`;
}

/**
 * Where a move used by the Pokémon in `slot` (0 or 1) can be aimed in a double battle, as
 * Showdown target locations: 1 and 2 are the foes, -1 and -2 your own Pokémon.
 * An empty list means the move picks its own targets (spread moves, self-targeting moves…).
 */
export function targetLocations(target: string, slot: number): number[] {
  const self = -(slot + 1);
  const ally = -((slot ^ 1) + 1);
  switch (target) {
    case 'normal':
    case 'any':
      return [1, 2, ally];
    case 'adjacentFoe':
      return [1, 2];
    case 'adjacentAlly':
      return [ally];
    case 'adjacentAllyOrSelf':
      return [self, ally];
    default:
      return [];
  }
}

/** A move choice in Showdown's syntax, e.g. "move 2 1 terastallize". */
export function moveChoice(move: number, target: number | null, tera: boolean): string {
  return `move ${move}${target === null ? '' : ` ${target}`}${tera ? ' terastallize' : ''}`;
}
