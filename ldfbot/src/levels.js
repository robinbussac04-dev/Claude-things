import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.join(__dirname, '..', 'data', 'levels.json');

const COOLDOWN_MS = 60 * 1000; // 1 XP grant per 60s per user
const XP_MIN = 15;
const XP_MAX = 25;

let cache = null;
const lastGranted = new Map();

function load() {
  if (cache) return cache;
  try { cache = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { cache = { users: {} }; }
  if (!cache.users) cache.users = {};
  return cache;
}
function save() {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(cache, null, 2));
  fs.renameSync(tmp, FILE);
}

// XP curve: level N requires 100 + 50*N^1.5 cumulative
export function xpForLevel(level) {
  return Math.floor(100 * Math.pow(level, 1.4));
}
export function levelFromXp(xp) {
  let l = 0;
  while (xp >= xpForLevel(l + 1)) l++;
  return l;
}

export function addXp(userId, username) {
  const now = Date.now();
  const last = lastGranted.get(userId) ?? 0;
  if (now - last < COOLDOWN_MS) return null;
  lastGranted.set(userId, now);
  const data = load();
  const u = data.users[userId] || { xp: 0, level: 0, username: null };
  const gain = XP_MIN + Math.floor(Math.random() * (XP_MAX - XP_MIN + 1));
  u.xp += gain;
  u.username = username ?? u.username;
  const newLevel = levelFromXp(u.xp);
  const leveledUp = newLevel > u.level;
  u.level = newLevel;
  data.users[userId] = u;
  save();
  return leveledUp ? { level: newLevel, xp: u.xp, gained: gain } : null;
}

export function getRank(userId) {
  const data = load();
  const u = data.users[userId];
  if (!u) return null;
  const sorted = Object.entries(data.users).sort(([, a], [, b]) => b.xp - a.xp);
  const rank = sorted.findIndex(([id]) => id === userId) + 1;
  return { ...u, rank, total: sorted.length, nextLevelAt: xpForLevel(u.level + 1) };
}

export function leaderboard(limit = 10) {
  const data = load();
  return Object.entries(data.users)
    .sort(([, a], [, b]) => b.xp - a.xp)
    .slice(0, limit)
    .map(([userId, u]) => ({ userId, ...u }));
}
