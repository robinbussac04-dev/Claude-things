import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { sendToChannel } from './bot.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.join(__dirname, '..', 'data', 'scheduled.json');
const TZ = process.env.TZ_SCHEDULER || 'Europe/Paris';

let cache = null;
let tickInterval = null;

function load() {
  if (cache) return cache;
  try {
    cache = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch {
    cache = { jobs: {} };
  }
  if (!cache.jobs) cache.jobs = {};
  return cache;
}

function save() {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(cache, null, 2));
  fs.renameSync(tmp, FILE);
}

function parisNow() {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = fmt.formatToParts(now);
  const hour = Number(parts.find((p) => p.type === 'hour').value);
  const minute = Number(parts.find((p) => p.type === 'minute').value);
  return { hour, minute, ts: now.getTime() };
}

function sanitize(j) {
  if (!j) return null;
  return {
    id: j.id,
    name: j.name,
    hour: j.hour,
    minute: j.minute,
    channelId: j.channelId,
    enabled: j.enabled !== false,
    createdAt: j.createdAt,
    lastRun: j.lastRun ?? null,
    payload: j.payload,
  };
}

export function listPublic() {
  const data = load();
  return Object.values(data.jobs)
    .sort((a, b) => (a.hour - b.hour) || (a.minute - b.minute))
    .map(sanitize);
}

export function createJob({ name, hour, minute, channelId, payload }) {
  if (!name) throw new Error('Nom requis');
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) throw new Error('Heure invalide');
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) throw new Error('Minute invalide');
  if (!channelId) throw new Error('Salon requis');
  if (!payload || (!payload.embed && !payload.content)) throw new Error('Contenu vide');

  const data = load();
  const id = crypto.randomUUID();
  data.jobs[id] = {
    id,
    name: String(name).trim(),
    hour,
    minute,
    channelId,
    payload,
    enabled: true,
    createdAt: new Date().toISOString(),
    lastRun: null,
  };
  save();
  return sanitize(data.jobs[id]);
}

export function updateJob(id, patch) {
  const data = load();
  const j = data.jobs[id];
  if (!j) throw new Error('Job introuvable');
  for (const k of ['name', 'hour', 'minute', 'channelId', 'payload', 'enabled']) {
    if (patch[k] !== undefined) j[k] = patch[k];
  }
  save();
  return sanitize(j);
}

export function deleteJob(id) {
  const data = load();
  if (!data.jobs[id]) return false;
  delete data.jobs[id];
  save();
  return true;
}

async function fire(job) {
  const p = job.payload ?? {};
  const payload = { allowedMentions: { parse: p.pingEveryone ? ['everyone'] : [] } };
  if (p.content) payload.content = p.pingEveryone ? `@everyone\n${p.content}` : p.content;
  else if (p.pingEveryone) payload.content = '@everyone';
  if (p.embed) payload.embeds = [p.embed];
  if (Array.isArray(p.components) && p.components.length) payload.components = p.components;

  try {
    await sendToChannel(job.channelId, payload);
    const data = load();
    const j = data.jobs[job.id];
    if (j) {
      j.lastRun = new Date().toISOString();
      save();
    }
    console.log(`[scheduler] fired job "${job.name}" (${job.id})`);
  } catch (e) {
    console.error(`[scheduler] fire error on "${job.name}":`, e.message);
  }
}

function tick() {
  const data = load();
  const { hour, minute, ts } = parisNow();
  for (const job of Object.values(data.jobs)) {
    if (!job.enabled) continue;
    if (job.hour !== hour || job.minute !== minute) continue;
    if (job.lastRun && ts - new Date(job.lastRun).getTime() < 60_000) continue;
    fire(job).catch((e) => console.error('[scheduler] async fire:', e));
  }
}

export function startScheduler() {
  if (tickInterval) return;
  load();
  tick();
  tickInterval = setInterval(tick, 30_000);
  console.log(`[scheduler] started (tz=${TZ})`);
}

export function stopScheduler() {
  if (tickInterval) clearInterval(tickInterval);
  tickInterval = null;
}
