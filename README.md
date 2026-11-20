# VGC Lab

**Live demo:** https://vgc-lab-taupe.vercel.app
(The API sleeps when idle on the free tier; the first request can take up to a minute.)

A team builder and damage calculator for Pokémon VGC (Scarlet/Violet, doubles at level 50).
Create an account, build teams from the full Pokédex, save them, and compare them against
other teams: speed order, damage between every move and every target, and type matchups.

## Features

- **Accounts**: sign up with username, email and password. Short-lived JWT access tokens with
  rotating refresh tokens, and rate-limited login.
- **Teams**: create, rename, edit and delete teams. Teams are stored in Pokémon Showdown's
  text format, so they reload exactly as you left them and can be imported from or exported
  to Showdown.
- **Pokédex**: search every Pokémon available in Scarlet/Violet by name and filter by type.
- **Set editor**: ability, item, nature, Tera Type and moves (only moves the Pokémon can learn),
  plus shiny, level, EVs and IVs with the final stats shown live.
- **EV optimizer**: set the benchmarks a Pokémon must hit and get the spread that meets all of
  them with the fewest EVs, the way competitive players build spreads by hand:
  - outspeed or underspeed (Trick Room) a target, with Speed stages and Tailwind;
  - survive one or two of a chosen attack, with stat stages and ability-aware Intimidate;
  - OHKO or 2HKO a target with one of your moves.

  Items and abilities go through the damage calc (Assault Vest, Choice items, Booster Energy…),
  KO odds use every damage roll, and Focus Sash, Sturdy and Sitrus Berry are accounted for.
  It can compare every nature and lowers the Speed IV for Trick Room when needed.
- **Move hover**: hovering a move shows the damage formula with the real numbers plugged in,
  the modifiers that apply and the damage range against a chosen target. Status moves show
  their effect instead.
- **Team comparison**: singles or doubles, weather, terrain, Trick Room, Tailwind, screens,
  Helping Hand and Terastallization, with three views:
  - Speed: turn order for both teams.
  - Damage: every damaging move against every opposing Pokémon.
  - Types: weakness and resistance chart for both teams.
- **Share links**: publish a read-only link to a team that anyone can open without an account,
  copy as a Showdown paste or save to their own teams.

## Tech stack

| Part | Technology |
| --- | --- |
| Frontend | React 19, TypeScript, Vite, React Router |
| Pokémon logic | [@smogon/calc](https://github.com/smogon/damage-calc), [@pkmn/data and @pkmn/dex](https://github.com/pkmn/ps), @pkmn/sets, @pkmn/img |
| Backend | Python 3.13, FastAPI, SQLAlchemy 2, Pydantic, Alembic |
| Database | PostgreSQL |
| Auth | JWT (PyJWT) with bcrypt password hashing |
| API contract | OpenAPI schema → TypeScript types (openapi-typescript, openapi-fetch) |
| Tests | pytest (API and migrations), Vitest (calc and team logic), Playwright (end to end) |
| DevOps | Docker, Docker Compose, GitHub Actions |

All Pokémon calculations run in the browser, where the Showdown libraries live. The API only
handles accounts and team storage.

```
frontend/            React app
  src/lib/           Pokédex, team and battle logic (unit tested)
  src/api/           API client and types generated from the backend's OpenAPI schema
  src/components/    Pokédex, set editor, move tooltip, comparison panel
  src/pages/         Login, home and team pages
  e2e/               Playwright end-to-end test
backend/             FastAPI app
  app/routers/       /auth and /teams endpoints
  migrations/        Alembic database migrations
  tests/             API and migration tests
```

## Run it with Docker

```bash
docker compose up --build
```

Then open http://localhost:5173. The API docs are at http://localhost:8000/docs.

## Run it for development

Requirements: Python 3.13, Node 22 and a PostgreSQL database.

```bash
# Backend
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env          # set DATABASE_URL and JWT_SECRET
alembic upgrade head          # create or update the database tables
uvicorn app.main:app --reload

# Frontend (in another terminal)
cd frontend
npm install
cp .env.example .env          # VITE_API_URL=http://localhost:8000
npm run dev
```

## Tests

```bash
cd backend && pytest              # API and migrations
cd frontend && npm test           # calc and team logic
cd frontend && npm run test:e2e   # full flow in a browser; needs the app running (docker compose up)
```

GitHub Actions runs on every push: the backend and frontend tests, the linter, the production
build, the end-to-end test against the Docker Compose stack, and an API contract check.

## Changing the database or the API

- **Database:** after changing a model in `backend/app/models.py`, create a migration with
  `alembic revision --autogenerate -m "describe the change"` and review it. A test fails if
  the models and migrations get out of sync. The API container applies pending migrations on start.
- **API:** after changing an endpoint or schema, regenerate the frontend types:
  ```bash
  cd backend && python -m scripts.export_openapi ../frontend/openapi.json
  cd frontend && npm run gen:api
  ```
  The TypeScript build fails wherever the frontend no longer matches the API, and CI fails if
  the generated files weren't updated.

## Design decisions

- **Pokémon calculations run in the browser.** The Smogon calc and the Showdown data are
  JavaScript libraries, so the damage, speed and type logic lives in the frontend, next to the
  UI that uses it. The API stays small: accounts and team storage.
- **Teams are stored as Showdown text.** It's the format players already use, it makes import
  and export free, and it keeps the database to one text column per team.
- **No Web Worker for the damage table.** A full 6v6 table is up to 144 calcs. Measured at
  13–36 ms, so it is memoized instead of moved to a worker, which would have duplicated the
  Pokédex data in a second bundle.
- **Short access tokens, rotating refresh tokens.** Access tokens last 15 minutes, so a leaked
  one is useful only briefly. Refresh tokens are single-use and stored as SHA-256 hashes; if an
  already used one comes back, every session of that user is revoked, since it may have been
  stolen. They're kept in the browser's storage rather than an httpOnly cookie because the
  frontend and API live on different domains, where cross-site cookies are unreliable.
- **Login rate limit in memory.** Ten failed attempts per minute per IP, kept in the API process.
  Successful logins don't count, so retrying a correct password never locks anyone out. That
  fits the single instance this runs on; several instances would need a shared store like Redis.
- **Team pages load on demand.** The Pokédex and calc data are several megabytes, so only the
  team pages load them. The first download went from 2.8 MB (612 KB gzipped) to 436 KB
  (137 KB gzipped).
- **The EV optimizer finds the exact minimum, not an approximation.** See
  [How the EV optimizer works](#how-the-ev-optimizer-works).
- **One API, one database.** Splitting into services would add deployment and coordination work
  with no benefit at this size.

## How the EV optimizer works

The optimizer (`frontend/src/lib/optimizer.ts`) finds the spread with the fewest EVs that meets
every benchmark. Trying every spread is out of reach (33⁶ ≈ 1.3 billion, each needing damage
calcs), so it relies on how stats work.

**Only 33 EV values per stat matter.** At level 50 a stat point costs 8 EVs (4 for the first),
so the values in between are wasted. Instead of hard-coding 0, 4, 12 … 252, it keeps the values
where the stat changes, which also handles other IVs and levels:

```ts
for (let ev = 0; ev <= MAX_STAT_EVS; ev += 4) {
  const value = calcStat(calcGen, stat, base, set.ivs[stat], ev, set.level, set.nature);
  if (value !== last) out.push(ev);
  last = value;
}
```

**Damage is a probability distribution.** A calc returns 16 equally likely rolls, and benchmarks
such as "survive 15 of 16" or "guaranteed 2HKO" are questions about probability. The hits of a
multi-hit move roll independently, so their distributions are convolved into the distribution of
the total. Adding the minimum and maximum rolls would give the range but not how likely each
total is:

```ts
function convolve(a: Distribution, b: Distribution): Distribution {
  const out: Distribution = new Map();
  for (const [x, px] of a) {
    for (const [y, py] of b) out.set(x + y, (out.get(x + y) ?? 0) + px * py);
  }
  return out;
}
```

**Two attacks are not simply added together.** A Sitrus Berry heals a quarter of max HP once HP
falls to half or less, so the second hit's threshold depends on the first roll. `koChance` goes
through each first roll, applies the berry if it activates, and counts the second rolls that
still KO. Focus Sash and Sturdy leave 1 HP after a single hit from full HP, but not against
multi-hit moves:

```ts
let left = Math.max(1, hp - first);
if (traits.sitrus && left <= hp / 2) left += Math.floor(hp / 4);
for (const [second, p2] of dist) if (second >= left) p += p1 * p2;
```

With two hits, "15 of 16 rolls" means at least 15/16 of the 256 roll pairs, not one excluded
roll per hit.

**The search runs in three phases**, because only the bulk benchmarks share a stat:

1. **Speed** depends only on Spe. The first useful value that passes is the cheapest, since more
   EVs never make a Pokémon slower. A tie fails, so outspeeding means creeping by one point. For
   Trick Room, the Speed IV is lowered when 0 EVs are not slow enough.
2. **Offence** depends only on the attacking stat (Atk, SpA, or Def for Body Press). More of it
   never deals less damage, so a binary search finds the cheapest value. A Body Press result
   becomes the minimum Def for the next phase.
3. **Bulk** shares HP between physical and special benchmarks, and more HP can save more or fewer
   Def EVs than it costs, so every HP value is tried. With HP fixed, Def and SpD are independent
   (a move hits one or the other), and survival only improves with bulk, so a binary search finds
   the cheapest of each. The cheapest total wins; among equal totals, the one with the highest
   HP×Def + HP×SpD:

```ts
for (const hp of usefulEvs(current, 'hp')) {
  // for Def and SpD: the first value that passes, at or above the Body Press minimum
  const i = firstPassing(evs, (ev) => allPass(withEvs(spread, { [stat]: ev }), statGoals));
  ...
  if (!best || total < best.total || (total === best.total && bulk > best.bulk)) best = { ... };
}
```

That is about 400 damage-calc rounds instead of 33³ ≈ 36,000 for every HP / Def / SpD
combination, with the same result. The three phases only interact through the Body Press
minimum, so minimising each one minimises the whole spread. The tests check this: one stat point
less in any invested stat fails a benchmark.

Leftover EVs then go to the stats in the order chosen, never into Speed when a Trick Room
benchmark needs it low. With "Compare every nature", the search runs once per nature and the
results are sorted by EV cost. Neutral natures are skipped, since one that lowers an unused stat
is never worse.

**Not modelled yet:** HP-number rules (Sitrus multiples of 4, Life Orb recoil, sandstorm), residual
damage and healing, a Sitrus Berry activating in the middle of a multi-hit move, moves that pick
their category in battle (Shell Side Arm), and Foul Play, which uses the target's Attack.

## API

| Method | Path | Description |
| --- | --- | --- |
| POST | `/auth/register` | Create an account |
| POST | `/auth/login` | Log in with username or email; returns an access and a refresh token |
| POST | `/auth/refresh` | Swap a refresh token for a new pair (the old one is revoked) |
| POST | `/auth/logout` | Revoke a refresh token |
| GET | `/auth/me` | Current user |
| GET | `/teams` | List your teams |
| POST | `/teams` | Create a team |
| GET | `/teams/{id}` | Get one of your teams |
| PUT | `/teams/{id}` | Update one of your teams |
| DELETE | `/teams/{id}` | Delete one of your teams |
| POST | `/teams/{id}/share` | Create a public share link for one of your teams |
| DELETE | `/teams/{id}/share` | Remove the share link |
| GET | `/shared/{share_id}` | View a shared team (no login needed) |

## Roadmap

- Turn-by-turn battle simulation with `@pkmn/sim`.
- Pokémon Champions mechanics (stat points instead of EVs and IVs).

## License

MIT. See [LICENSE](LICENSE).

## Disclaimer

This is a non-commercial fan project made for learning. Pokémon and all related names and
images are © Nintendo, Game Freak and The Pokémon Company. Game data and sprites come from
Pokémon Showdown through the MIT-licensed `@pkmn` and `@smogon/calc` packages.
