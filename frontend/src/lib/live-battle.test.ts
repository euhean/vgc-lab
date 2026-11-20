import { describe, expect, it } from 'vitest';
import { liveBattleUrl, moveChoice, targetLocations } from './live-battle';

describe('live battle helpers', () => {
  it('turns the API URL into a WebSocket URL', () => {
    expect(liveBattleUrl('http://localhost:8000')).toBe('ws://localhost:8000/battles/live');
    expect(liveBattleUrl('https://api.example.com')).toBe('wss://api.example.com/battles/live');
  });

  it('lists the targets a move can aim at from each slot', () => {
    expect(targetLocations('normal', 0)).toEqual([1, 2, -2]);
    expect(targetLocations('adjacentFoe', 1)).toEqual([1, 2]);
    expect(targetLocations('adjacentAlly', 1)).toEqual([-1]);
    expect(targetLocations('adjacentAllyOrSelf', 0)).toEqual([-1, -2]);
    expect(targetLocations('allAdjacentFoes', 0)).toEqual([]);
    expect(targetLocations('self', 0)).toEqual([]);
  });

  it('writes move choices in Showdown syntax', () => {
    expect(moveChoice(2, 1, false)).toBe('move 2 1');
    expect(moveChoice(3, null, true)).toBe('move 3 terastallize');
  });
});
