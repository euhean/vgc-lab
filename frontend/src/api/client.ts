import createClient from 'openapi-fetch';
import type { components, paths } from './schema';

const API_URL: string = import.meta.env.VITE_API_URL;
if (!API_URL) throw new Error('VITE_API_URL is not set');

const TOKEN_KEY = 'vgc-lab-token';

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (token: string) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// Types come from the backend's OpenAPI schema (npm run gen:api), so API changes break the build.
export type User = components['schemas']['UserOut'];
export type TeamInput = components['schemas']['TeamIn'];
export type TeamRecord = components['schemas']['TeamOut'];

const client = createClient<paths>({ baseUrl: API_URL });

client.use({
  onRequest({ request }) {
    const token = tokenStore.get();
    if (token) request.headers.set('Authorization', `Bearer ${token}`);
    return request;
  },
});

interface Result<T> {
  data?: T;
  error?: unknown;
  response: Response;
}

/** Returns the response data, or throws an ApiError with the server's message. */
async function unwrap<T>(call: Promise<Result<T>>): Promise<T> {
  const { data, error, response } = await call;
  if (!response.ok) {
    const detail = (error as { detail?: unknown } | undefined)?.detail;
    const message = typeof detail === 'string'
      ? detail
      : Array.isArray(detail) ? String(detail[0]?.msg) : response.statusText;
    throw new ApiError(response.status, message);
  }
  return data as T;
}

export const api = {
  register: (username: string, email: string, password: string) =>
    unwrap(client.POST('/auth/register', { body: { username, email, password } })),
  login: (login: string, password: string) =>
    unwrap(client.POST('/auth/login', { body: { login, password } })),
  me: () => unwrap(client.GET('/auth/me')),
  listTeams: () => unwrap(client.GET('/teams')),
  getTeam: (id: number) => unwrap(client.GET('/teams/{team_id}', { params: { path: { team_id: id } } })),
  createTeam: (team: TeamInput) => unwrap(client.POST('/teams', { body: team })),
  updateTeam: (id: number, team: TeamInput) =>
    unwrap(client.PUT('/teams/{team_id}', { params: { path: { team_id: id } }, body: team })),
  deleteTeam: (id: number) => unwrap(client.DELETE('/teams/{team_id}', { params: { path: { team_id: id } } })),
};
