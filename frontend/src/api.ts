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

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = tokenStore.get();
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const detail = typeof data.detail === 'string' ? data.detail : (data.detail?.[0]?.msg ?? res.statusText);
    throw new ApiError(res.status, detail);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

export interface User { id: number; username: string; email: string }
export interface TeamInput { name: string; format: string; paste: string }
export interface TeamRecord extends TeamInput { id: number; updated_at: string }

export const api = {
  register: (username: string, email: string, password: string) =>
    request<User>('POST', '/auth/register', { username, email, password }),
  login: (login: string, password: string) =>
    request<{ access_token: string }>('POST', '/auth/login', { login, password }),
  me: () => request<User>('GET', '/auth/me'),
  listTeams: () => request<TeamRecord[]>('GET', '/teams'),
  getTeam: (id: number) => request<TeamRecord>('GET', `/teams/${id}`),
  createTeam: (team: TeamInput) => request<TeamRecord>('POST', '/teams', team),
  updateTeam: (id: number, team: TeamInput) => request<TeamRecord>('PUT', `/teams/${id}`, team),
  deleteTeam: (id: number) => request<void>('DELETE', `/teams/${id}`),
};
