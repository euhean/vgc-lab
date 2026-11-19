import createClient from 'openapi-fetch';
import type { components, paths } from './schema';

const API_URL: string = import.meta.env.VITE_API_URL;
if (!API_URL) throw new Error('VITE_API_URL is not set');

const ACCESS_KEY = 'vgc-lab-access-token';
const REFRESH_KEY = 'vgc-lab-refresh-token';

export const tokenStore = {
  access: () => localStorage.getItem(ACCESS_KEY),
  refresh: () => localStorage.getItem(REFRESH_KEY),
  set: (tokens: { access_token: string; refresh_token: string }) => {
    localStorage.setItem(ACCESS_KEY, tokens.access_token);
    localStorage.setItem(REFRESH_KEY, tokens.refresh_token);
  },
  clear: () => {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};

/** Fires "expired" when the session can't be refreshed, so the app can return to the login page. */
export const sessionEvents = new EventTarget();

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
export type SharedTeam = components['schemas']['SharedTeamOut'];

const client = createClient<paths>({ baseUrl: API_URL });
// Used only to refresh tokens, so refreshing never goes through the retry middleware below.
const refreshClient = createClient<paths>({ baseUrl: API_URL });

let refreshing: Promise<boolean> | null = null;

/** Exchanges the refresh token for new tokens. Concurrent callers share one request. */
function refreshTokens(): Promise<boolean> {
  refreshing ??= (async () => {
    const refresh_token = tokenStore.refresh();
    if (!refresh_token) return false;
    const { data } = await refreshClient.POST('/auth/refresh', { body: { refresh_token } });
    if (!data) {
      tokenStore.clear();
      sessionEvents.dispatchEvent(new Event('expired'));
      return false;
    }
    tokenStore.set(data);
    return true;
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

// Access tokens last minutes. When one expires, refresh it and retry the request once.
const pendingRetries = new Map<string, Request>();

client.use({
  onRequest({ request, id }) {
    const token = tokenStore.access();
    if (token) request.headers.set('Authorization', `Bearer ${token}`);
    pendingRetries.set(id, request.clone());
    return request;
  },
  async onResponse({ response, id }) {
    const retry = pendingRetries.get(id);
    pendingRetries.delete(id);
    if (response.status !== 401 || !retry || !(await refreshTokens())) return response;
    retry.headers.set('Authorization', `Bearer ${tokenStore.access()}`);
    return fetch(retry);
  },
  onError({ id }) {
    pendingRetries.delete(id);
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
  logout: (refresh_token: string) => unwrap(client.POST('/auth/logout', { body: { refresh_token } })),
  me: () => unwrap(client.GET('/auth/me')),
  health: () => unwrap(client.GET('/health')),
  listTeams: () => unwrap(client.GET('/teams')),
  getTeam: (id: number) => unwrap(client.GET('/teams/{team_id}', { params: { path: { team_id: id } } })),
  createTeam: (team: TeamInput) => unwrap(client.POST('/teams', { body: team })),
  updateTeam: (id: number, team: TeamInput) =>
    unwrap(client.PUT('/teams/{team_id}', { params: { path: { team_id: id } }, body: team })),
  deleteTeam: (id: number) => unwrap(client.DELETE('/teams/{team_id}', { params: { path: { team_id: id } } })),
  shareTeam: (id: number) => unwrap(client.POST('/teams/{team_id}/share', { params: { path: { team_id: id } } })),
  unshareTeam: (id: number) => unwrap(client.DELETE('/teams/{team_id}/share', { params: { path: { team_id: id } } })),
  getSharedTeam: (shareId: string) =>
    unwrap(client.GET('/shared/{share_id}', { params: { path: { share_id: shareId } } })),
};
