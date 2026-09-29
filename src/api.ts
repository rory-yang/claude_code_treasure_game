// Thin fetch wrappers for the SQLite-backed API in server/api.ts (same origin, session cookie).

export type User = { id: number; username: string };
export type ScoreEntry = { score: number; playedAt: string };
export type Stats = {
  gamesPlayed: number;
  bestScore: number | null;
  totalScore: number;
  recent: ScoreEntry[];
};
export type Session = { user: User | null; stats: Stats | null };

// Call an API endpoint. Input: path, optional method/body. Output: parsed JSON, or throws with the server's error message
async function request<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const { method = 'GET', body } = options;
  const res = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data as T;
}

// Get the current session. Output: signed-in user and stats, or nulls when signed out
export const fetchSession = () => request<Session>('/api/me');

// Create an account and sign in. Input: username, password. Output: new session
export const signUp = (username: string, password: string) =>
  request<Session>('/api/signup', { method: 'POST', body: { username, password } });

// Sign in to an existing account. Input: username, password. Output: session
export const signIn = (username: string, password: string) =>
  request<Session>('/api/login', { method: 'POST', body: { username, password } });

// End the current session. Output: { ok: true }
export const signOut = () => request<{ ok: true }>('/api/logout', { method: 'POST' });

// Save a finished game's score for the signed-in user. Input: final score. Output: updated stats
export const saveScore = (score: number) =>
  request<{ stats: Stats }>('/api/scores', { method: 'POST', body: { score } });
