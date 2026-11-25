import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AttachmentBuilder } from 'discord.js';
import { getClient } from './bot.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');

const FILES_TO_BACKUP = [
  'redemptions.json',
  'verifications.json',
  'giveaways.json',
  'tickets.json',
  'memberlog.json',
  'scheduled.json',
  'welcome.json',
  'templates.json',
  'levels.json',
  'audit.json',
];

let timer = null;
let cfg = {};
let lastRunDate = null;

export function startBackupJob(opts = {}) {
  cfg = opts;
  if (!cfg.ownerId) {
    console.warn('[backup] OWNER_ID missing, backup disabled');
    return;
  }
  if (timer) clearInterval(timer);
  timer = setInterval(tick, 30 * 1000);
  console.log('[backup] job started — DM owner every day at 17:00 Europe/Paris');
}

function tick() {
  try {
    const now = new Date();
    const paris = new Intl.DateTimeFormat('fr-FR', {
      timeZone: 'Europe/Paris',
      hour: '2-digit',
      minute: '2-digit',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour12: false,
    }).formatToParts(now);
    const g = (k) => paris.find((p) => p.type === k)?.value;
    const hour = g('hour');
    const minute = g('minute');
    const dateKey = `${g('year')}-${g('month')}-${g('day')}`;
    if (hour !== '17') return;
    if (minute > '05') return; // only fire in first 5 minutes
    if (lastRunDate === dateKey) return;
    lastRunDate = dateKey;
    runBackup(dateKey).catch((e) => console.error('[backup] run error', e));
  } catch (e) {
    console.warn('[backup] tick error', e.message);
  }
}

async function runBackup(dateKey) {
  const client = getClient();
  const user = await client.users.fetch(cfg.ownerId);
  const dm = await user.createDM();

  const bundle = { date: dateKey, files: {} };
  let totalBytes = 0;
  for (const f of FILES_TO_BACKUP) {
    const p = path.join(DATA_DIR, f);
    try {
      const txt = fs.readFileSync(p, 'utf8');
      bundle.files[f] = JSON.parse(txt);
      totalBytes += txt.length;
    } catch {}
  }

  // server structure snapshot
  try {
    if (cfg.guildId) {
      const guild = await client.guilds.fetch(cfg.guildId);
      await guild.channels.fetch();
      await guild.roles.fetch();
      bundle.server = {
        name: guild.name,
        memberCount: guild.memberCount,
        roles: guild.roles.cache.map((r) => ({
          id: r.id, name: r.name, color: r.color, position: r.position, hoist: r.hoist, mentionable: r.mentionable,
        })),
        channels: guild.channels.cache.map((c) => ({
          id: c.id, name: c.name, type: c.type, parentId: c.parentId, position: c.rawPosition ?? 0,
        })),
      };
    }
  } catch (e) {
    bundle.serverError = e.message;
  }

  const json = JSON.stringify(bundle, null, 2);
  const filename = `ldfbot-backup-${dateKey}.json`;
  const sizeKB = Math.round(json.length / 1024);

  await dm.send({
    content: `📦 **Backup quotidien LDF BOT** — ${dateKey}\nTaille : ${sizeKB} KB · ${Object.keys(bundle.files).length} fichier(s) de données.`,
    files: [new AttachmentBuilder(Buffer.from(json, 'utf8'), { name: filename })],
  });
  console.log(`[backup] sent ${filename} to owner (${sizeKB} KB)`);
}
