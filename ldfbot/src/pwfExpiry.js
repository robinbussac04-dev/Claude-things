import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EmbedBuilder } from 'discord.js';
import { getClient } from './bot.js';
import { all as allRedemptions } from './redemptions.js';
import { checkKey, getPWF } from './pwf.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const NOTIF_FILE = path.join(__dirname, '..', 'data', 'pwf-expiry-notifs.json');

const THRESHOLDS = [7, 3, 1];
let scannerTimer = null;
let cfg = {};

function loadNotifs() {
  try { return JSON.parse(fs.readFileSync(NOTIF_FILE, 'utf8')); } catch { return {}; }
}
function saveNotifs(data) {
  fs.mkdirSync(path.dirname(NOTIF_FILE), { recursive: true });
  fs.writeFileSync(NOTIF_FILE, JSON.stringify(data, null, 2));
}

async function dmUser(userId, payload) {
  const client = getClient();
  const user = await client.users.fetch(userId);
  const dm = await user.createDM();
  return dm.send(payload);
}

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  return Math.ceil((d.getTime() - Date.now()) / (24 * 3600 * 1000));
}

export function startPwfExpiryScanner(opts = {}) {
  cfg = opts;
  if (!getPWF()) {
    console.log('[pwfExpiry] PWF disabled, scanner idle');
    return;
  }
  if (scannerTimer) clearInterval(scannerTimer);
  scannerTimer = setInterval(scanOnce, 6 * 60 * 60 * 1000);
  setTimeout(() => scanOnce().catch((e) => console.error('[pwfExpiry]', e)), 30 * 1000);
  console.log('[pwfExpiry] scanner started (every 6h, first run in 30s)');
}

async function scanOnce() {
  if (!getPWF()) return;
  const notifs = loadNotifs();
  const all = allRedemptions();
  let notified = 0;
  let expired = 0;
  for (const [key, r] of Object.entries(all)) {
    try {
      const userId = r.discord_user_id;
      if (!userId) continue;
      let result;
      try { result = await checkKey(key); } catch { continue; }
      if (!result) continue;
      const days = result.days_remaining ?? daysUntil(result.expires_at ?? r.expires_at);
      if (days == null) continue;
      notifs[userId] = notifs[userId] || {};
      const isExpired = days < 0 || (result.status && String(result.status).toLowerCase() === 'expired') || !result.success;
      if (isExpired) {
        if (!notifs[userId][key + ':expired']) {
          await handleExpired(userId, key, { ...r, ...result });
          notifs[userId][key + ':expired'] = Date.now();
          expired++;
        }
      } else {
        for (const t of THRESHOLDS) {
          if (days <= t && !notifs[userId][key + ':' + t]) {
            await notifyExpiring(userId, key, { ...r, ...result }, days);
            notifs[userId][key + ':' + t] = Date.now();
            notified++;
          }
        }
      }
      await new Promise((r2) => setTimeout(r2, 250));
    } catch (e) {
      console.warn('[pwfExpiry] key scan error', key, e.message);
    }
  }
  saveNotifs(notifs);
  console.log(`[pwfExpiry] scan done — ${notified} reminders, ${expired} expired`);
}

async function notifyExpiring(userId, key, r, days) {
  try {
    const embed = new EmbedBuilder()
      .setTitle('⏰ Ta clé LDF Devs expire bientôt')
      .setDescription(
        `Ta clé pour **${r.productName ?? r.product_name ?? 'ton logiciel'}** expire dans **${days} jour(s)**.`
      )
      .setColor(days <= 1 ? 0xe74c3c : 0xf1c40f)
      .addFields({ name: 'Expire le', value: String(r.expires_at ?? '—'), inline: true });
    const payload = { embeds: [embed] };
    if (cfg.renewUrl) payload.content = `🔁 Renouvelle ta clé ici : ${cfg.renewUrl}`;
    await dmUser(userId, payload);
  } catch (e) {
    console.warn('[pwfExpiry] DM notify failed', userId, e.message);
  }
}

async function handleExpired(userId, key, r) {
  const client = getClient();
  if (cfg.guildId && (cfg.customerRoleId || cfg.unverifiedRoleId)) {
    try {
      const guild = await client.guilds.fetch(cfg.guildId);
      const member = await guild.members.fetch(userId).catch(() => null);
      if (member) {
        if (cfg.customerRoleId) {
          await member.roles.remove(cfg.customerRoleId, 'PWF key expired').catch(() => {});
        }
        if (cfg.unverifiedRoleId) {
          await member.roles.add(cfg.unverifiedRoleId, 'PWF key expired').catch(() => {});
        }
      }
    } catch (e) {
      console.warn('[pwfExpiry] role mgmt failed', userId, e.message);
    }
  }
  try {
    const embed = new EmbedBuilder()
      .setTitle('❌ Ta clé LDF Devs a expiré')
      .setDescription(
        `Ta clé pour **${r.productName ?? r.product_name ?? 'ton logiciel'}** est expirée. Ton accès customer a été retiré.`
      )
      .setColor(0xe74c3c);
    const payload = { embeds: [embed] };
    if (cfg.renewUrl) payload.content = `🔁 Renouvelle pour récupérer l'accès : ${cfg.renewUrl}`;
    await dmUser(userId, payload);
  } catch {}
  if (cfg.logChannelId) {
    try {
      const ch = await client.channels.fetch(cfg.logChannelId);
      await ch.send(`❌ Clé expirée pour <@${userId}> (${key.slice(0, 4)}…${key.slice(-4)}) — rôle Customer retiré.`);
    } catch {}
  }
}

export async function forceScan() {
  return scanOnce();
}
