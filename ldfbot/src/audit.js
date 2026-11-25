import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.join(__dirname, '..', 'data', 'audit.json');
const MAX_ENTRIES = 2000;

let cache = null;

function load() {
  if (cache) return cache;
  try { cache = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { cache = { events: [] }; }
  if (!Array.isArray(cache.events)) cache.events = [];
  return cache;
}

function save() {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(cache, null, 2));
  fs.renameSync(tmp, FILE);
}

export function record(type, data = {}) {
  const d = load();
  d.events.unshift({ type, ts: new Date().toISOString(), ...data });
  if (d.events.length > MAX_ENTRIES) d.events.length = MAX_ENTRIES;
  save();
}

export function list({ limit = 100, type = null } = {}) {
  const d = load();
  let arr = d.events;
  if (type) arr = arr.filter((e) => e.type === type);
  return arr.slice(0, limit);
}

export function wireAuditListeners(client, { guildId } = {}) {
  const pick = (u) => u ? { id: u.id, tag: u.tag ?? `${u.username ?? '?'}#${u.discriminator ?? '0'}` } : null;

  client.on('guildMemberAdd', (m) => {
    if (guildId && m.guild.id !== guildId) return;
    record('member_add', { user: pick(m.user) });
  });
  client.on('guildMemberRemove', (m) => {
    if (guildId && m.guild.id !== guildId) return;
    record('member_remove', { user: pick(m.user) });
  });
  client.on('guildBanAdd', (ban) => {
    if (guildId && ban.guild.id !== guildId) return;
    record('ban_add', { user: pick(ban.user), reason: ban.reason ?? null });
  });
  client.on('guildBanRemove', (ban) => {
    if (guildId && ban.guild.id !== guildId) return;
    record('ban_remove', { user: pick(ban.user) });
  });
  client.on('messageDelete', (m) => {
    if (guildId && m.guild && m.guild.id !== guildId) return;
    if (m.author?.bot) return;
    record('message_delete', {
      user: pick(m.author),
      channelId: m.channel?.id,
      channelName: m.channel?.name,
      content: (m.content ?? '').slice(0, 500),
    });
  });
  client.on('messageUpdate', (oldM, newM) => {
    if (guildId && newM.guild && newM.guild.id !== guildId) return;
    if (newM.author?.bot) return;
    if ((oldM.content ?? '') === (newM.content ?? '')) return;
    record('message_edit', {
      user: pick(newM.author),
      channelId: newM.channel?.id,
      channelName: newM.channel?.name,
      before: (oldM.content ?? '').slice(0, 300),
      after: (newM.content ?? '').slice(0, 300),
    });
  });
  client.on('channelCreate', (ch) => {
    if (guildId && ch.guild?.id !== guildId) return;
    record('channel_create', { channelId: ch.id, name: ch.name, type: ch.type });
  });
  client.on('channelDelete', (ch) => {
    if (guildId && ch.guild?.id !== guildId) return;
    record('channel_delete', { channelId: ch.id, name: ch.name, type: ch.type });
  });
  client.on('roleCreate', (r) => {
    if (guildId && r.guild.id !== guildId) return;
    record('role_create', { roleId: r.id, name: r.name });
  });
  client.on('roleDelete', (r) => {
    if (guildId && r.guild.id !== guildId) return;
    record('role_delete', { roleId: r.id, name: r.name });
  });
  client.on('guildMemberUpdate', (oldM, newM) => {
    if (guildId && newM.guild.id !== guildId) return;
    const added = [...newM.roles.cache.keys()].filter((k) => !oldM.roles.cache.has(k));
    const removed = [...oldM.roles.cache.keys()].filter((k) => !newM.roles.cache.has(k));
    if (added.length) record('role_add', { user: pick(newM.user), roles: added });
    if (removed.length) record('role_remove', { user: pick(newM.user), roles: removed });
  });
  console.log('[audit] listeners wired');
}
