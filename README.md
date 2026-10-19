# VGC Lab

A team builder and damage calculator for Pokémon VGC (Scarlet/Violet, doubles at level 50).
Create an account, build teams from the full Pokédex, save them, and compare them against
other teams: speed order, damage between every move and every target, and type matchups.

## Features

- **Accounts**: sign up with username, email and password; log in with JWT.
- **Teams**: create, rename, edit and delete teams. Teams are stored in Pokémon Showdown's
  text format, so they reload exactly as you left them and can be imported from or exported
  to Showdown.
- **Pokédex**: search every Pokémon available in Scarlet/Violet by name and filter by type.
- **Set editor**: ability, item, nature, Tera Type and moves (only moves the Pokémon can learn),
  plus shiny, level, EVs and IVs with the final stats shown live.
- **Move hover**: hovering a move shows the damage formula with the real numbers plugged in,
  the modifiers that apply and the damage range against a chosen target. Status moves show
  their effect instead.
- **Team comparison**: singles or doubles, weather, terrain, Trick Room, Tailwind, screens,
  Helping Hand and Terastallization, with three views:
  - Speed: turn order for both teams.
  - Damage: every damaging move against every opposing Pokémon.
  - Types: weakness and resistance chart for both teams.

## Tech stack

| Part | Technology |
| --- | --- |
| Frontend | React 19, TypeScript, Vite, React Router |
| Pokémon logic | [@smogon/calc](https://github.com/smogon/damage-calc), [@pkmn/data and @pkmn/dex](https://github.com/pkmn/ps), @pkmn/sets, @pkmn/img |
| Backend | Python 3.13, FastAPI, SQLAlchemy 2, Pydantic |
| Database | PostgreSQL |
| Auth | JWT (PyJWT) with bcrypt password hashing |
| Tests | pytest (API), Vitest (calc and team logic) |
| DevOps | Docker, Docker Compose, GitHub Actions |

All Pokémon calculations run in the browser, where the Showdown libraries live. The API only
handles accounts and team storage.

```
frontend/            React app
  src/lib/           Pokédex, team and battle logic (unit tested)
  src/components/    Pokédex, set editor, move tooltip, comparison panel
  src/pages/         Login, home and team pages
backend/             FastAPI app
  app/routers/       /auth and /teams endpoints
  tests/             API tests
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
uvicorn app.main:app --reload

# Frontend (in another terminal)
cd frontend
npm install
cp .env.example .env          # VITE_API_URL=http://localhost:8000
npm run dev
```

## Tests

```bash
cd backend && pytest
cd frontend && npm test
```

GitHub Actions runs both suites, the linter and the production build on every push.

## API

| Method | Path | Description |
| --- | --- | --- |
| POST | `/auth/register` | Create an account |
| POST | `/auth/login` | Log in with username or email, returns a JWT |
| GET | `/auth/me` | Current user |
| GET | `/teams` | List your teams |
| POST | `/teams` | Create a team |
| GET | `/teams/{id}` | Get one of your teams |
| PUT | `/teams/{id}` | Update one of your teams |
| DELETE | `/teams/{id}` | Delete one of your teams |

## Roadmap

- Turn-by-turn battle simulation with `@pkmn/sim`.
- Pokémon Champions mechanics (stat points instead of EVs and IVs).

## License

MIT. See [LICENSE](LICENSE).

## Disclaimer

This is a non-commercial fan project made for learning. Pokémon and all related names and
images are © Nintendo, Game Freak and The Pokémon Company. Game data and sprites come from
Pokémon Showdown through the MIT-licensed `@pkmn` and `@smogon/calc` packages.
