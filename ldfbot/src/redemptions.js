import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.join(__dirname, '..', 'data', 'redemptions.json');

let cache = null;

function ensureDir() {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
}

function load() {
  if (cache) return cache;
  try {
    cache = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch {
    cache = {};
  }
  return cache;
}

function save() {
  ensureDir();
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(cache, null, 2));
  fs.renameSync(tmp, FILE);
}

export function findByKey(licenseKey) {
  const data = load();
  return data[licenseKey] ?? null;
}

export function findByUser(discordUserId) {
  const data = load();
  return Object.entries(data)
    .filter(([_, r]) => r.discord_user_id === discordUserId)
    .map(([key, r]) => ({ license_key: key, ...r }));
}

export function record(licenseKey, discordUserId, meta = {}) {
  const data = load();
  data[licenseKey] = {
    discord_user_id: discordUserId,
    redeemed_at: new Date().toISOString(),
    ...meta,
  };
  save();
  return data[licenseKey];
}

export function revoke(licenseKey) {
  const data = load();
  const existed = licenseKey in data;
  delete data[licenseKey];
  if (existed) save();
  return existed;
}

export function all() {
  return load();
}
