import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import { getClient } from './bot.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.join(__dirname, '..', 'data', 'giveaways.json');

const timers = new Map();
let logChannelId = null;

/* ---------- Persistence ---------- */
let cache = null;

function ensureDir() {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
}

function load() {
  if (cache) return cache;
  try {
    cache = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    if (!cache.giveaways) cache.giveaways = {};
  } catch {
    cache = { giveaways: {} };
  }
  return cache;
}

function save() {
  ensureDir();
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(cache, null, 2));
  fs.renameSync(tmp, FILE);
}

/* ---------- Public helpers (sanitized) ---------- */
function sanitize(g) {
  if (!g) return null;
  return {
    id: g.id,
    title: g.title,
    productName: g.productName,
    winnersCount: g.winnersCount,
    keysCount: g.keys?.length ?? 0,
    channelId: g.channelId,
    messageId: g.messageId,
    createdAt: g.createdAt,
    endsAt: g.endsAt,
    status: g.status,
    entrantsCount: g.entrants?.length ?? 0,
    winners: (g.winners ?? []).map((w) => ({ userId: w.userId, dmSent: w.dmSent, dmError: w.dmError })),
    createdBy: g.createdBy,
  };
}

export function listPublic() {
  const data = load();
  return Object.values(data.giveaways)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map(sanitize);
}

export function getPublic(id) {
  const data = load();
  return sanitize(data.giveaways[id]);
}

/* ---------- Discord rendering ---------- */
function buildEmbed(g) {
  const ended = g.status !== 'active';
  const endsTs = Math.floor(new Date(g.endsAt).getTime() / 1000);
  const embed = new EmbedBuilder()
    .setTitle(ended ? '🎊 GIVEAWAY TERMINÉ' : '🎉 GIVEAWAY')
    .setColor(ended ? 0x747f8d : 0xf1c40f)
    .setDescription(`**${g.title}**`)
    .addFields(
      { name: 'Produit', value: g.productName, inline: true },
      { name: 'Gagnants', value: String(g.winnersCount), inline: true },
      { name: 'Participants', value: String(g.entrants?.length ?? 0), inline: true },
    );

  if (!ended) {
    embed.addFields({ name: 'Fin', value: `<t:${endsTs}:R> (<t:${endsTs}:f>)` });
    embed.setFooter({ text: 'Clique sur 🎉 pour participer' });
  } else if (g.status === 'ended') {
    const winners = (g.winners ?? []).map((w) => `<@${w.userId}>`).join(' ') || '*aucun participant*';
    embed.addFields({ name: '🎊 Gagnants', value: winners });
    embed.setFooter({ text: 'Giveaway terminé' });
  } else {
    embed.addFields({ name: 'Statut', value: 'Annulé' });
  }
  embed.setTimestamp(new Date(g.endsAt));
  return embed;
}

function buildRow(g) {
  if (g.status !== 'active') return null;
  const btn = new ButtonBuilder()
    .setCustomId(`giveaway:enter:${g.id}`)
    .setLabel('Participer')
    .setEmoji('🎉')
    .setStyle(ButtonStyle.Primary);
  return new ActionRowBuilder().addComponents(btn);
}

async function postOrEditMessage(g) {
  const client = getClient();
  const channel = await client.channels.fetch(g.channelId);
  const embed = buildEmbed(g);
  const row = buildRow(g);
  const payload = { embeds: [embed], components: row ? [row] : [] };

  if (g.messageId) {
    try {
      const msg = await channel.messages.fetch(g.messageId);
      await msg.edit(payload);
      return msg;
    } catch (e) {
      console.warn('[giveaway] edit failed, re-posting:', e.message);
    }
  }
  const msg = await channel.send(payload);
  g.messageId = msg.id;
  save();
  return msg;
}

async function logToChannel(line) {
  if (!logChannelId) return;
  try {
    const client = getClient();
    const ch = await client.channels.fetch(logChannelId);
    await ch.send(line);
  } catch (e) {
    console.error('[giveaway] log error:', e);
  }
}

/* ---------- Scheduling ---------- */
function scheduleEnd(g) {
  if (timers.has(g.id)) {
    clearTimeout(timers.get(g.id));
    timers.delete(g.id);
  }
  const ms = new Date(g.endsAt).getTime() - Date.now();
  const delay = Math.max(0, ms);
  const t = setTimeout(() => {
    endGiveaway(g.id).catch((e) => console.error('[giveaway] auto-end error:', e));
  }, delay);
  timers.set(g.id, t);
}

export function restoreTimers({ logChannelId: logId } = {}) {
  if (logId) logChannelId = logId;
  const data = load();
  let count = 0;
  for (const g of Object.values(data.giveaways)) {
    if (g.status === 'active') {
      scheduleEnd(g);
      count++;
    }
  }
  console.log(`[giveaway] restored ${count} active timer(s)`);
}

/* ---------- Core actions ---------- */
export async function createGiveaway({
  title,
  productName,
  keys,
  winnersCount,
  durationHours,
  channelId,
  createdBy,
}) {
  if (!title || !productName) throw new Error('Titre et produit requis');
  if (!Array.isArray(keys) || keys.length === 0) throw new Error('Au moins une clé requise');
  if (!Number.isInteger(winnersCount) || winnersCount < 1) throw new Error('Nombre de gagnants invalide');
  if (keys.length !== winnersCount) throw new Error(`Il faut exactement ${winnersCount} clés (reçues : ${keys.length})`);
  if (![12, 24, 48, 72].includes(Number(durationHours))) throw new Error('Durée invalide (12, 24, 48, 72h)');
  if (!channelId) throw new Error('Salon requis');

  const id = crypto.randomUUID();
  const now = new Date();
  const endsAt = new Date(now.getTime() + Number(durationHours) * 3600 * 1000);

  const g = {
    id,
    title: title.trim(),
    productName: productName.trim(),
    keys: keys.map((k) => String(k).trim()).filter(Boolean),
    winnersCount,
    createdBy,
    channelId,
    messageId: null,
    createdAt: now.toISOString(),
    endsAt: endsAt.toISOString(),
    status: 'active',
    entrants: [],
    winners: [],
  };

  const data = load();
  data.giveaways[id] = g;
  save();

  await postOrEditMessage(g);
  scheduleEnd(g);

  logToChannel(`🎉 **Nouveau giveaway** lancé par <@${createdBy}> — \`${g.title}\` (${g.winnersCount} gagnant(s), fin <t:${Math.floor(endsAt.getTime() / 1000)}:R>) dans <#${g.channelId}>`);

  return sanitize(g);
}

export async function enterGiveaway(giveawayId, userId) {
  const data = load();
  const g = data.giveaways[giveawayId];
  if (!g) return { ok: false, reason: 'not_found' };
  if (g.status !== 'active') return { ok: false, reason: 'ended' };
  if (g.entrants.includes(userId)) return { ok: false, reason: 'already_entered' };
  g.entrants.push(userId);
  save();
  // Refresh embed (fire-and-forget)
  postOrEditMessage(g).catch((e) => console.warn('[giveaway] refresh failed:', e.message));
  return { ok: true, entrantsCount: g.entrants.length };
}

function shuffle(array) {
  const a = array.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function deliverKey(userId, g, keyIndex) {
  const client = getClient();
  try {
    const user = await client.users.fetch(userId);
    const dm = await user.createDM();
    const embed = new EmbedBuilder()
      .setTitle('🎊 Félicitations, tu as gagné !')
      .setColor(0xf1c40f)
      .setDescription(`Tu as gagné le giveaway **${g.title}**.`)
      .addFields(
        { name: 'Produit', value: g.productName },
        { name: 'Ta clé', value: '```' + g.keys[keyIndex] + '```' },
      )
      .setFooter({ text: 'Garde cette clé en lieu sûr. Utilise /redeem dans le serveur pour obtenir ton rôle.' });
    await dm.send({ embeds: [embed] });
    return { ok: true };
  } catch (e) {
    console.warn('[giveaway] DM failed for', userId, e.message);
    return { ok: false, error: e.message };
  }
}

export async function endGiveaway(giveawayId, { force = false } = {}) {
  const data = load();
  const g = data.giveaways[giveawayId];
  if (!g) throw new Error('Giveaway introuvable');
  if (g.status !== 'active') {
    if (!force) return sanitize(g);
  }

  // Cancel scheduled timer if any
  if (timers.has(g.id)) {
    clearTimeout(timers.get(g.id));
    timers.delete(g.id);
  }

  const shuffled = shuffle(g.entrants);
  const picked = shuffled.slice(0, g.winnersCount);

  const winners = [];
  for (let i = 0; i < picked.length; i++) {
    const userId = picked[i];
    const res = await deliverKey(userId, g, i);
    winners.push({
      userId,
      keyIndex: i,
      dmSent: res.ok,
      dmError: res.ok ? null : res.error,
    });
  }

  g.winners = winners;
  g.status = 'ended';
  save();

  await postOrEditMessage(g);

  if (winners.length > 0) {
    const mentions = winners.map((w) => `<@${w.userId}>`).join(' ');
    try {
      const client = getClient();
      const ch = await client.channels.fetch(g.channelId);
      await ch.send({ content: `🎊 Félicitations ${mentions} ! Vous avez gagné **${g.title}**. Vérifiez vos DM pour votre clé.` });
    } catch (e) {
      console.warn('[giveaway] winner announce failed:', e.message);
    }
  }

  logToChannel(`🏁 **Giveaway terminé** — \`${g.title}\` — ${winners.length}/${g.winnersCount} gagnants, ${g.entrants.length} participant(s)`);

  return sanitize(g);
}

export async function rerollWinner(giveawayId, winnerIndex) {
  const data = load();
  const g = data.giveaways[giveawayId];
  if (!g) throw new Error('Giveaway introuvable');
  if (g.status !== 'ended') throw new Error('Giveaway pas encore terminé');
  if (winnerIndex < 0 || winnerIndex >= g.winners.length) throw new Error('Winner index invalide');

  const excluded = new Set(g.winners.map((w) => w.userId));
  const pool = g.entrants.filter((u) => !excluded.has(u));
  if (pool.length === 0) throw new Error('Aucun participant restant pour re-roll');

  const newUser = pool[crypto.randomInt(pool.length)];
  const keyIndex = g.winners[winnerIndex].keyIndex;
  const res = await deliverKey(newUser, g, keyIndex);
  g.winners[winnerIndex] = {
    userId: newUser,
    keyIndex,
    dmSent: res.ok,
    dmError: res.ok ? null : res.error,
  };
  save();
  await postOrEditMessage(g);

  logToChannel(`🔄 **Re-roll** sur \`${g.title}\` — nouveau gagnant : <@${newUser}>`);

  return sanitize(g);
}

export async function cancelGiveaway(giveawayId) {
  const data = load();
  const g = data.giveaways[giveawayId];
  if (!g) throw new Error('Giveaway introuvable');
  if (g.status !== 'active') throw new Error('Giveaway déjà terminé');

  if (timers.has(g.id)) {
    clearTimeout(timers.get(g.id));
    timers.delete(g.id);
  }
  g.status = 'cancelled';
  save();
  await postOrEditMessage(g);

  logToChannel(`🚫 **Giveaway annulé** — \`${g.title}\``);

  return sanitize(g);
}
