import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getClient } from './bot.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.join(__dirname, '..', 'data', 'memberlog.json');
const MAX_EVENTS = 500;

let cache = null;

function load() {
  if (cache) return cache;
  try {
    cache = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch {
    cache = { events: [] };
  }
  if (!cache.events) cache.events = [];
  return cache;
}

function save() {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(cache, null, 2));
  fs.renameSync(tmp, FILE);
}

export function record(type, user) {
  const data = load();
  data.events.unshift({
    type,
    userId: user?.id ?? null,
    username: user?.tag ?? user?.username ?? 'unknown',
    globalName: user?.globalName ?? null,
    avatar: user?.displayAvatarURL?.({ size: 64 }) ?? null,
    at: new Date().toISOString(),
  });
  if (data.events.length > MAX_EVENTS) {
    data.events.length = MAX_EVENTS;
  }
  save();
}

export function listEvents({ limit = 100, type } = {}) {
  const data = load();
  let events = data.events;
  if (type) events = events.filter((e) => e.type === type);
  return events.slice(0, limit);
}

export function counts() {
  const data = load();
  let joins = 0, leaves = 0;
  const now = Date.now();
  const day24 = 24 * 60 * 60 * 1000;
  let joins24 = 0, leaves24 = 0;
  for (const e of data.events) {
    const age = now - new Date(e.at).getTime();
    if (e.type === 'join') { joins++; if (age <= day24) joins24++; }
    if (e.type === 'leave') { leaves++; if (age <= day24) leaves24++; }
  }
  return { joins, leaves, joins24, leaves24 };
}

export async function liveMemberCount(guildId) {
  try {
    const client = getClient();
    const guild = await client.guilds.fetch(guildId);
    return {
      total: guild.memberCount ?? null,
      name: guild.name,
      iconURL: guild.iconURL?.({ size: 64 }) ?? null,
    };
  } catch {
    return { total: null };
  }
}
