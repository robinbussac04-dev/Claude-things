import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.join(__dirname, '..', 'data', 'templates.json');

let cache = null;

function load() {
  if (cache) return cache;
  try {
    cache = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch {
    cache = { templates: {} };
  }
  if (!cache.templates) cache.templates = {};
  return cache;
}

function save() {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(cache, null, 2));
  fs.renameSync(tmp, FILE);
}

export function listTemplates() {
  const data = load();
  return Object.values(data.templates).sort((a, b) =>
    a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }),
  );
}

export function getTemplate(id) {
  const data = load();
  return data.templates[id] ?? null;
}

export function saveTemplate({ id, name, fields }) {
  const data = load();
  const tid = id && data.templates[id] ? id : crypto.randomUUID();
  const now = new Date().toISOString();
  data.templates[tid] = {
    id: tid,
    name: String(name ?? '').trim() || 'Sans nom',
    fields: fields ?? {},
    createdAt: data.templates[tid]?.createdAt ?? now,
    updatedAt: now,
  };
  save();
  return data.templates[tid];
}

export function deleteTemplate(id) {
  const data = load();
  if (!(id in data.templates)) return false;
  delete data.templates[id];
  save();
  return true;
}
