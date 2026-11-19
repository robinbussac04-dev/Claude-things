import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.join(__dirname, '..', 'data', 'verifications.json');
const STATES_FILE = path.join(__dirname, '..', 'data', 'verify-states.json');
const API = 'https://discord.com/api/v10';

let cache = null;

function load() {
  if (cache) return cache;
  try {
    cache = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch {
    cache = { users: {} };
  }
  if (!cache.users) cache.users = {};
  return cache;
}

function save() {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(cache, null, 2));
  fs.renameSync(tmp, FILE);
  try { fs.chmodSync(FILE, 0o600); } catch {}
}

/* ---------- CSRF state ---------- */
function loadStates() {
  try { return JSON.parse(fs.readFileSync(STATES_FILE, 'utf8')); }
  catch { return { states: {} }; }
}
function saveStates(s) {
  fs.mkdirSync(path.dirname(STATES_FILE), { recursive: true });
  fs.writeFileSync(STATES_FILE, JSON.stringify(s, null, 2));
}
export function newState() {
  const s = loadStates();
  const token = crypto.randomBytes(24).toString('base64url');
  // Garbage-collect expired entries (>10 min old)
  const cutoff = Date.now() - 10 * 60 * 1000;
  for (const [k, v] of Object.entries(s.states)) {
    if (v.createdAt < cutoff) delete s.states[k];
  }
  s.states[token] = { createdAt: Date.now() };
  saveStates(s);
  return token;
}
export function consumeState(token) {
  if (!token) return false;
  const s = loadStates();
  if (!s.states[token]) return false;
  const ok = s.states[token].createdAt > Date.now() - 10 * 60 * 1000;
  delete s.states[token];
  saveStates(s);
  return ok;
}

/* ---------- Discord API ---------- */
export async function exchangeCode({ code, clientId, clientSecret, redirectUri }) {
  const res = await fetch(`${API}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    }),
  });
  if (!res.ok) throw new Error(`token exchange: ${res.status} ${await res.text()}`);
  return res.json();
}

export async function refreshAccessToken({ refreshToken, clientId, clientSecret }) {
  const res = await fetch(`${API}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });
  if (!res.ok) throw new Error(`refresh: ${res.status} ${await res.text()}`);
  return res.json();
}

export async function getMe(accessToken) {
  const res = await fetch(`${API}/users/@me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`get user: ${res.status}`);
  return res.json();
}

export async function addMemberToGuild({ guildId, userId, accessToken, botToken, roles = [] }) {
  const res = await fetch(`${API}/guilds/${guildId}/members/${userId}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bot ${botToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ access_token: accessToken, roles }),
  });
  if (res.status === 201) return { added: true };
  if (res.status === 204) return { added: false, already: true };
  const text = await res.text();
  throw new Error(`guild add ${res.status}: ${text.slice(0, 180)}`);
}

export async function addRoleToMember({ guildId, userId, roleId, botToken }) {
  const res = await fetch(`${API}/guilds/${guildId}/members/${userId}/roles/${roleId}`, {
    method: 'PUT',
    headers: { Authorization: `Bot ${botToken}` },
  });
  if (res.status === 204) return { ok: true };
  const text = await res.text();
  throw new Error(`add role ${res.status}: ${text.slice(0, 180)}`);
}

async function ensureRoles({ guildId, userId, botToken, roleIds }) {
  for (const roleId of roleIds) {
    try {
      await addRoleToMember({ guildId, userId, roleId, botToken });
    } catch (e) {
      console.warn(`[verify] role ${roleId} assign failed for ${userId}:`, e.message);
    }
  }
}

/* ---------- Persistence ---------- */
export function recordUser({ user, tokens }) {
  const data = load();
  const prev = data.users[user.id];
  data.users[user.id] = {
    userId: user.id,
    username: user.username,
    globalName: user.global_name ?? null,
    avatar: user.avatar ?? null,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
    scope: tokens.scope,
    verifiedAt: prev?.verifiedAt ?? new Date().toISOString(),
    lastRefresh: new Date().toISOString(),
  };
  save();
  return data.users[user.id];
}

export function listPublic() {
  const data = load();
  return Object.values(data.users)
    .sort((a, b) => new Date(b.verifiedAt) - new Date(a.verifiedAt))
    .map((u) => ({
      userId: u.userId,
      username: u.username,
      globalName: u.globalName,
      avatar: u.avatar,
      verifiedAt: u.verifiedAt,
      expiresAt: u.expiresAt,
      expired: new Date(u.expiresAt).getTime() < Date.now(),
    }));
}

export function count() {
  return Object.keys(load().users).length;
}

export function remove(userId) {
  const data = load();
  if (!data.users[userId]) return false;
  delete data.users[userId];
  save();
  return true;
}

/* ---------- Pull ---------- */
export async function pullAll({ guildId, botToken, clientId, clientSecret, roleIds = [], throttleMs = 200 }) {
  const data = load();
  const users = Object.values(data.users);
  const results = { total: users.length, added: 0, already: 0, failed: 0, refreshFailed: 0, errors: [] };

  for (const u of users) {
    try {
      let accessToken = u.accessToken;
      if (new Date(u.expiresAt).getTime() < Date.now() + 60_000) {
        try {
          const r = await refreshAccessToken({
            refreshToken: u.refreshToken,
            clientId,
            clientSecret,
          });
          recordUser({
            user: {
              id: u.userId,
              username: u.username,
              global_name: u.globalName,
              avatar: u.avatar,
            },
            tokens: r,
          });
          accessToken = r.access_token;
        } catch (refreshErr) {
          results.refreshFailed++;
          results.errors.push({ userId: u.userId, username: u.username, error: 'refresh: ' + refreshErr.message });
          continue;
        }
      }
      const r = await addMemberToGuild({
        guildId,
        userId: u.userId,
        accessToken,
        botToken,
        roles: roleIds,
      });
      if (r.added) results.added++;
      else if (r.already) results.already++;
      if (r.already && roleIds.length > 0) {
        await ensureRoles({ guildId, userId: u.userId, botToken, roleIds });
      }
    } catch (e) {
      results.failed++;
      results.errors.push({ userId: u.userId, username: u.username, error: e.message });
    }
    await new Promise((r) => setTimeout(r, throttleMs));
  }
  return results;
}

export async function pullOne({ userId, guildId, botToken, clientId, clientSecret, roleIds = [] }) {
  const data = load();
  const u = data.users[userId];
  if (!u) throw new Error('User not verified');
  let accessToken = u.accessToken;
  if (new Date(u.expiresAt).getTime() < Date.now() + 60_000) {
    const r = await refreshAccessToken({
      refreshToken: u.refreshToken,
      clientId,
      clientSecret,
    });
    recordUser({
      user: { id: u.userId, username: u.username, global_name: u.globalName, avatar: u.avatar },
      tokens: r,
    });
    accessToken = r.access_token;
  }
  const result = await addMemberToGuild({ guildId, userId, accessToken, botToken, roles: roleIds });
  // The roles in the PUT body only apply on first add (201). For users already
  // in the guild (204), we have to assign each role via PUT /members/.../roles/...
  if (result.already && roleIds.length > 0) {
    await ensureRoles({ guildId, userId, botToken, roleIds });
  }
  return result;
}
