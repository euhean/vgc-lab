import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { describe, it } from 'node:test';
import { Battle, Dex, PRNG, RandomPlayerAI } from '@pkmn/sim';
import { damageShare, HeuristicAI, scoreOptions } from '../ai.mjs';
import { FORMAT, packTeam, playAiBattle, seedFrom, startBattle, watch } from '../battle.mjs';
import { simulate } from '../simulate.mjs';
import { CORE, WEAK } from './teams.mjs';

describe('teams', () => {
  it('rejects an empty paste', () => {
    assert.throws(() => packTeam(''), /empty or not a valid/);
  });
});

describe('heuristic AI', () => {
  it('estimates more damage from super effective moves and none into immunities', () => {
    const { stream } = startBattle({ p1: CORE, p2: CORE, seed: '1,2,3,4' });
    const [mine, theirs] = stream.battle.sides;
    const incineroar = mine.pokemon.find((p) => p.species.name === 'Incineroar');
    const amoonguss = theirs.pokemon.find((p) => p.species.name === 'Amoonguss');
    const flutter = theirs.pokemon.find((p) => p.species.name === 'Flutter Mane');
    const dex = stream.battle.dex;
    // Flare Blitz is super effective on Amoonguss; Fake Out can't touch Ghost-type Flutter Mane.
    assert.ok(damageShare(dex, incineroar, Dex.moves.get('flareblitz'), amoonguss) >
      damageShare(dex, incineroar, Dex.moves.get('knockoff'), amoonguss));
    assert.equal(damageShare(dex, incineroar, Dex.moves.get('fakeout'), flutter), 0);
  });

  it('scores Fake Out only on the first turn out', () => {
    // Incineroar and Rillaboom lead with Fake Out; Amoonguss and Flutter Mane on the other side.
    const battle = new Battle({ formatid: FORMAT, seed: '1,2,3,4' });
    battle.setPlayer('p1', { team: packTeam(CORE) });
    battle.setPlayer('p2', { team: packTeam(CORE) });
    battle.choose('p1', 'team 2345');
    battle.choose('p2', 'team 5123');
    const side = battle.sides[0];
    const prng = new PRNG('1,1,1,1');
    const fakeOut = () => scoreOptions(battle, side, 0, side.activeRequest.active[0], prng)
      .filter((o) => o.move.id === 'fakeout');
    // Into Amoonguss it is worth a flinch; Ghost-type Flutter Mane is immune.
    assert.ok(fakeOut().find((o) => o.choice === 'move 1 1').score >= 0.9);
    assert.ok(fakeOut().find((o) => o.choice === 'move 1 2').score < 0.1);

    battle.choose('p1', 'move 2 1, move 2 1');
    battle.choose('p2', 'move 4, move 1 1');
    assert.ok(fakeOut().every((o) => o.score < 0.1));
  });

  it('beats a random player most of the time', async () => {
    let wins = 0;
    for (let i = 0; i < 40; i++) {
      const prng = new PRNG(`${i + 1},3,3,3`);
      const { stream, streams } = startBattle({ p1: CORE, p2: CORE, seed: seedFrom(prng) });
      void new HeuristicAI(streams.p1, stream, 'p1', seedFrom(prng)).start();
      void new RandomPlayerAI(streams.p2, { seed: seedFrom(prng) }).start();
      if ((await watch(stream, streams.omniscient)) === 'p1') wins++;
    }
    assert.ok(wins >= 34, `won ${wins} of 40`);
  });
});

describe('Monte Carlo win rate', () => {
  it('is reproducible with a seed', async () => {
    assert.equal(await playAiBattle(CORE, CORE, '1,2,3,4'), await playAiBattle(CORE, CORE, '1,2,3,4'));
    const a = await simulate({ p1: CORE, p2: CORE, games: 10, seed: '9,9,9,9' });
    assert.deepEqual(a, await simulate({ p1: CORE, p2: CORE, games: 10, seed: '9,9,9,9' }));
    assert.equal(a.wins + a.losses + a.ties, 10);
  });

  it('favours the stronger team', async () => {
    const { wins, games } = await simulate({ p1: CORE, p2: WEAK, games: 20, seed: '5,5,5,5' });
    assert.equal(wins, games);
  });

  it('runs as a script: JSON in on stdin, JSON out on stdout', async () => {
    const child = spawn(process.execPath, ['simulate.mjs'], { cwd: new URL('..', import.meta.url) });
    child.stdin.end(JSON.stringify({ p1: CORE, p2: WEAK, games: 3, seed: '1,1,1,1' }));
    let out = '';
    for await (const chunk of child.stdout) out += chunk;
    assert.deepEqual(JSON.parse(out), { games: 3, wins: 3, losses: 0, ties: 0 });
  });
});
