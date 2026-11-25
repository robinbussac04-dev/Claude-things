// Anti-spam + scam filter + auto-reply "salut"
// All three plug into messageCreate; separated for clarity but kept in one file.

import { record as auditRecord } from './audit.js';
import { isTicketChannel, getTicketInfo } from './tickets.js';

const SPAM_WINDOW_MS = 10 * 1000; // 10s window
const SPAM_DUP_LIMIT = 4;         // 4 identical messages in window -> action
const SPAM_BURST_LIMIT = 7;       // 7 total messages in window -> action
const TIMEOUT_MS = 10 * 60 * 1000; // 10 min

const userBuffers = new Map(); // userId -> [{ content, ts }]

function pushMsg(userId, content) {
  const now = Date.now();
  const arr = userBuffers.get(userId) || [];
  arr.push({ content, ts: now });
  const filtered = arr.filter((m) => now - m.ts < SPAM_WINDOW_MS);
  userBuffers.set(userId, filtered);
  return filtered;
}

/* ---------- Scam links (known patterns) ---------- */
const SCAM_PATTERNS = [
  /discord[-.]?(nitro|gift|free)[-.\w]*\.(?:ru|com|net|org|xyz|cn|site|tk|ml|ga|cf|gq|top|info)/i,
  /dlscord|discrod|disc0rd|discordgift|disc\-app|disoord/i,
  /steam-?community\.(?:ru|cn|co|tk|ml)/i,
  /free[-.]?(nitro|steam|csgo|robux)[-.\w]*\.(?:com|ru|xyz|site|tk|ml)/i,
  /(?:click\s*here|free\s*nitro|free\s*gift).{0,40}https?:\/\//i,
  /@everyone.{0,120}https?:\/\/(?!(?:discord\.com|cdn\.discordapp\.com|media\.discordapp\.net|github\.com|youtube\.com|twitch\.tv|ldf-devs\.mysellauth\.com))/i,
];

function isScam(content) {
  return SCAM_PATTERNS.some((rx) => rx.test(content));
}

/* ---------- "Bonjour alone" auto-reply (TICKETS ONLY, opener only) ---------- */
const GREETINGS = /^(?:salut|yo|bonjour|bonsoir)[\s!.?]*$/i;

async function handleGreeting(msg) {
  try {
    await msg.reply({
      content:
        `👋 Salut <@${msg.author.id}> ! Pour qu'on te réponde plus vite, ` +
        `**décris directement ta demande** (produit concerné, numéro de commande, message d'erreur, capture d'écran…).`,
      allowedMentions: { users: [msg.author.id] },
    });
  } catch {}
}

/* ---------- Public dispatcher ---------- */
export async function handleMessage(msg, env = {}) {
  if (!msg || msg.author?.bot || !msg.guild) return;
  const content = msg.content ?? '';
  if (!content.trim()) return;

  // 1) Scam
  if (isScam(content)) {
    try { await msg.delete(); } catch {}
    try {
      await msg.channel.send(`⚠️ <@${msg.author.id}> — message supprimé (lien suspect détecté).`);
    } catch {}
    auditRecord('scam_blocked', {
      user: { id: msg.author.id, tag: msg.author.tag },
      channelId: msg.channel.id,
      content: content.slice(0, 300),
    });
    if (env.MOD_LOG_CHANNEL_ID) {
      try {
        const ch = await msg.client.channels.fetch(env.MOD_LOG_CHANNEL_ID);
        await ch.send(`🛡️ Scam bloqué — <@${msg.author.id}> dans <#${msg.channel.id}> : \`${content.slice(0, 180)}\``);
      } catch {}
    }
    return;
  }

  // 2) Spam (duplicates / burst)
  const buf = pushMsg(msg.author.id, content);
  const duplicates = buf.filter((m) => m.content === content).length;
  const bursts = buf.length;
  if (duplicates >= SPAM_DUP_LIMIT || bursts >= SPAM_BURST_LIMIT) {
    try {
      const member = await msg.guild.members.fetch(msg.author.id);
      await member.timeout(TIMEOUT_MS, 'Spam (duplicates/burst)');
    } catch (e) {
      console.warn('[filters] timeout failed', e.message);
    }
    // delete recent messages from this user in this channel
    try {
      const recent = await msg.channel.messages.fetch({ limit: 20 });
      const mine = recent.filter((m) => m.author.id === msg.author.id).first(SPAM_BURST_LIMIT);
      for (const m of mine) {
        m.delete().catch(() => {});
      }
    } catch {}
    try {
      await msg.channel.send(`🔇 <@${msg.author.id}> a été timeout 10min pour spam.`);
    } catch {}
    userBuffers.delete(msg.author.id);
    auditRecord('spam_timeout', {
      user: { id: msg.author.id, tag: msg.author.tag },
      channelId: msg.channel.id,
      duplicates,
      bursts,
    });
    if (env.MOD_LOG_CHANNEL_ID) {
      try {
        const ch = await msg.client.channels.fetch(env.MOD_LOG_CHANNEL_ID);
        await ch.send(`🛡️ Spam — <@${msg.author.id}> timeout 10min (${duplicates} dups / ${bursts} msgs en 10s).`);
      } catch {}
    }
    return;
  }

  // 3) "salut/yo/bonjour/bonsoir" alone — only inside ticket channels, only from opener
  if (GREETINGS.test(content.trim()) && isTicketChannel(msg.channel.id)) {
    const info = getTicketInfo(msg.channel.id);
    if (info && info.userId === msg.author.id) {
      await handleGreeting(msg);
    }
    return;
  }
}
