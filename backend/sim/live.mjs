/**
 * Live battles: you against the heuristic AI. One process runs every live battle, started and
 * kept by the API, which talks to it with one JSON message per line.
 *
 * In (stdin):
 *   {"id": "b1", "type": "start", "p1": paste, "p2": paste}   you are p1, the AI is p2
 *   {"id": "b1", "type": "choose", "choice": "move 1 2, move 3"}
 *   {"id": "b1", "type": "stop"}                      forfeit: the battle ends as a loss
 * Out (stdout):
 *   {"id": "b1", "type": "chunk", "data": "..."}   p1's view of the battle in Showdown's protocol,
 *                                                   including its |request| lines
 *   {"id": "b1", "type": "end", "winner": "p1" | "p2" | null}
 *   {"id": "b1", "type": "error", "message": "..."}
 */
import { createInterface } from 'node:readline';
import { HeuristicAI } from './ai.mjs';
import { startBattle, watch } from './battle.mjs';

/** Live battles by id: p1's player stream, which takes your choices, and the full battle stream. */
const battles = new Map();

const send = (message) => process.stdout.write(`${JSON.stringify(message)}\n`);

function start(id, p1, p2) {
  if (battles.has(id)) throw new Error(`Battle ${id} already exists`);
  const { stream, streams } = startBattle({ p1, p2, names: ['You', 'Opponent'] });
  void new HeuristicAI(streams.p2, stream, 'p2').start();
  battles.set(id, { player: streams.p1, omniscient: streams.omniscient });
  void (async () => {
    for await (const data of streams.p1) send({ id, type: 'chunk', data });
  })();
  void watch(stream, streams.omniscient).then(
    (winner) => send({ id, type: 'end', winner }),
    (error) => send({ id, type: 'error', message: error.message }),
  ).finally(() => battles.delete(id));
}

function handle(message) {
  const { id, type } = message;
  if (type === 'start') return start(id, message.p1, message.p2);
  const battle = battles.get(id);
  if (!battle) throw new Error(`No battle ${id}`);
  if (type === 'choose') return void battle.player.write(message.choice);
  if (type === 'stop') return void battle.omniscient.write('>forcelose p1');
  throw new Error(`Unknown message type: ${type}`);
}

for await (const line of createInterface({ input: process.stdin })) {
  if (!line.trim()) continue;
  const message = JSON.parse(line);
  try {
    handle(message);
  } catch (error) {
    send({ id: message.id, type: 'error', message: error.message });
  }
}
