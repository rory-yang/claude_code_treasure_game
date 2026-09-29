// SQLite-backed sign up / sign in / score API, mounted into the Vite dev & preview server as middleware.
// Requires Node >= 22.13 for the built-in `node:sqlite` module (no npm dependency needed).
// On older Node the dev server still starts (guest mode works); API calls answer with a clear error.
import type { DatabaseSync } from 'node:sqlite';
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';

const SESSION_COOKIE = 'treasure_sid';
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
const MAX_BODY_BYTES = 10 * 1024;
const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,20}$/;
const PASSWORD_MIN_LENGTH = 6;
const PASSWORD_MAX_LENGTH = 100;
// Only final scores reachable with 3 boxes / 1 treasure: found on the 1st, 2nd or 3rd pick
const VALID_FINAL_SCORES = new Set([100, 50, 0]);

type User = { id: number; username: string };

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const NODE_VERSION_HINT = `Sign in needs Node >= 22.13 (running ${process.version}). Run \`nvm use\` and restart \`npm run dev\`.`;

// Load node:sqlite lazily so a static import cannot crash vite.config.ts on older Node. Output: module or undefined
function loadSqlite(): typeof import('node:sqlite') | undefined {
  return process.getBuiltinModule?.('node:sqlite') as typeof import('node:sqlite') | undefined;
}

let db: DatabaseSync | null = null;

// Open the database (creating file and tables on first use). Output: shared DatabaseSync handle
function getDb(): DatabaseSync {
  if (db) return db;
  const sqlite = loadSqlite();
  if (!sqlite) throw new HttpError(503, NODE_VERSION_HINT);
  const file = process.env.TREASURE_DB_PATH ?? path.resolve(process.cwd(), 'data', 'treasure.db');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  db = new sqlite.DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      score INTEGER NOT NULL,
      played_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_scores_user ON scores(user_id, id DESC);
  `);
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
  return db;
}

// Hash a password with a random salt. Input: plain password. Output: "saltHex:hashHex"
function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

// Check a password against a stored hash. Input: plain password, "saltHex:hashHex". Output: match or not
function verifyPassword(password: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(':');
  const expected = Buffer.from(hashHex, 'hex');
  const actual = scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
  return timingSafeEqual(actual, expected);
}

// Sessions are stored hashed so a leaked DB file cannot be used to hijack logins. Input: raw token. Output: sha256 hex
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

// Read the raw session token from the Cookie header. Input: request. Output: token or null
function getSessionToken(req: IncomingMessage): string | null {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === SESSION_COOKIE) return rest.join('=') || null;
  }
  return null;
}

// Create a session row and set the HttpOnly cookie. Input: response, user id. Output: none
function startSession(res: ServerResponse, userId: number): void {
  const token = randomBytes(32).toString('hex');
  getDb()
    .prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
    .run(hashToken(token), userId, Date.now() + SESSION_TTL_SECONDS * 1000);
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL_SECONDS}`,
  );
}

// Resolve the signed-in user from the session cookie. Input: request. Output: user or null
function getCurrentUser(req: IncomingMessage): User | null {
  const token = getSessionToken(req);
  if (!token) return null;
  const row = getDb()
    .prepare(
      `SELECT u.id, u.username FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > ?`,
    )
    .get(hashToken(token), Date.now()) as User | undefined;
  return row ? { id: Number(row.id), username: String(row.username) } : null;
}

// Summarize a user's saved games. Input: user id. Output: totals, best score and the 5 latest games
function getStats(userId: number) {
  const summary = getDb()
    .prepare(
      `SELECT COUNT(*) AS gamesPlayed, MAX(score) AS bestScore, COALESCE(SUM(score), 0) AS totalScore
       FROM scores WHERE user_id = ?`,
    )
    .get(userId) as { gamesPlayed: number; bestScore: number | null; totalScore: number };
  const recent = getDb()
    .prepare('SELECT score, played_at AS playedAt FROM scores WHERE user_id = ? ORDER BY id DESC LIMIT 5')
    .all(userId) as { score: number; playedAt: string }[];
  return {
    gamesPlayed: Number(summary.gamesPlayed),
    bestScore: summary.bestScore === null ? null : Number(summary.bestScore),
    totalScore: Number(summary.totalScore),
    recent: recent.map((r) => ({ score: Number(r.score), playedAt: String(r.playedAt) })),
  };
}

// Read and parse a JSON request body with a size cap. Input: request. Output: parsed object
async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new HttpError(413, 'Request body too large');
    chunks.push(chunk);
  }
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
    if (body && typeof body === 'object' && !Array.isArray(body)) return body;
  } catch {
    // fall through to the 400 below
  }
  throw new HttpError(400, 'Invalid JSON body');
}

// Validate username/password fields from a body. Input: parsed body. Output: trimmed credentials
function readCredentials(body: Record<string, unknown>): { username: string; password: string } {
  const { username, password } = body;
  if (typeof username !== 'string' || typeof password !== 'string') {
    throw new HttpError(400, 'Username and password are required');
  }
  return { username: username.trim(), password };
}

// Send a JSON response. Input: response, status code, payload. Output: none
function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

// Route one /api/* request. Input: request, response. Output: resolves once the response is sent
async function handleApi(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const { pathname } = new URL(req.url ?? '/', 'http://localhost');
  const database = getDb();

  switch (`${req.method} ${pathname}`) {
    case 'GET /api/me': {
      const user = getCurrentUser(req);
      return sendJson(res, 200, { user, stats: user ? getStats(user.id) : null });
    }

    case 'POST /api/signup': {
      const { username, password } = readCredentials(await readJson(req));
      if (!USERNAME_PATTERN.test(username)) {
        throw new HttpError(400, 'Username must be 3-20 letters, numbers or underscores');
      }
      if (password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH) {
        throw new HttpError(400, `Password must be ${PASSWORD_MIN_LENGTH}-${PASSWORD_MAX_LENGTH} characters`);
      }
      if (database.prepare('SELECT 1 FROM users WHERE username = ?').get(username)) {
        throw new HttpError(409, 'Username is already taken');
      }
      const { lastInsertRowid } = database
        .prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)')
        .run(username, hashPassword(password));
      const user = { id: Number(lastInsertRowid), username };
      startSession(res, user.id);
      return sendJson(res, 201, { user, stats: getStats(user.id) });
    }

    case 'POST /api/login': {
      const { username, password } = readCredentials(await readJson(req));
      const row = database
        .prepare('SELECT id, username, password_hash FROM users WHERE username = ?')
        .get(username) as { id: number; username: string; password_hash: string } | undefined;
      if (!row || !verifyPassword(password, row.password_hash)) {
        throw new HttpError(401, 'Invalid username or password');
      }
      const user = { id: Number(row.id), username: String(row.username) };
      startSession(res, user.id);
      return sendJson(res, 200, { user, stats: getStats(user.id) });
    }

    case 'POST /api/logout': {
      const token = getSessionToken(req);
      if (token) database.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token));
      res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
      return sendJson(res, 200, { ok: true });
    }

    case 'POST /api/scores': {
      const user = getCurrentUser(req);
      if (!user) throw new HttpError(401, 'Sign in to save scores');
      const { score } = await readJson(req);
      if (typeof score !== 'number' || !VALID_FINAL_SCORES.has(score)) {
        throw new HttpError(400, 'Invalid score');
      }
      database.prepare('INSERT INTO scores (user_id, score) VALUES (?, ?)').run(user.id, score);
      return sendJson(res, 201, { stats: getStats(user.id) });
    }

    default:
      throw new HttpError(404, 'Not found');
  }
}

// Connect-style middleware: handles /api/* and passes everything else on. Input: req, res, next. Output: none
export function apiMiddleware(req: IncomingMessage, res: ServerResponse, next: () => void): void {
  if (!req.url?.startsWith('/api/')) return next();
  handleApi(req, res).catch((err) => {
    if (err instanceof HttpError) return sendJson(res, err.status, { error: err.message });
    console.error('[treasure-api]', err);
    sendJson(res, 500, { error: 'Internal server error' });
  });
}

// Vite plugin that serves the API from the same origin as the game (dev and `vite preview`). Output: plugin
export function treasureApiPlugin(): Plugin {
  return {
    name: 'treasure-api',
    configureServer(server) {
      if (!loadSqlite()) server.config.logger.warn(`\n[treasure-api] ${NODE_VERSION_HINT}\n`);
      server.middlewares.use(apiMiddleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(apiMiddleware);
    },
  };
}
