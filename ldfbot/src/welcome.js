import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.join(__dirname, '..', 'data', 'welcome.json');

let cache = null;

function load() {
  if (cache) return cache;
  try {
    cache = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch {
    cache = { enabled: false, config: defaultConfig() };
  }
  if (!cache.config) cache.config = defaultConfig();
  return cache;
}

function save() {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(cache, null, 2));
  fs.renameSync(tmp, FILE);
}

function defaultConfig() {
  return {
    content: 'Hey {username} 👋 bienvenue sur **{server}** !',
    embed: {
      title: 'Welcome to LDF • Devs',
      description: 'Glad to have you, {username}.\n\nCheck out our products and jump on Discord to get started.',
      color: 0xe01f1f,
      footer: { text: 'LDF • Devs' },
    },
    buttons: [],
  };
}

export function getConfig() { return load(); }

export function setConfig({ enabled, config }) {
  const data = load();
  if (typeof enabled === 'boolean') data.enabled = enabled;
  if (config && typeof config === 'object') data.config = config;
  save();
  return data;
}

function interpolate(str, ctx) {
  if (!str) return str;
  return String(str)
    .replaceAll('{username}', ctx.username ?? '')
    .replaceAll('{server}', ctx.serverName ?? '')
    .replaceAll('{member_count}', String(ctx.memberCount ?? ''));
}

function deepInterpolate(obj, ctx) {
  if (!obj) return obj;
  if (typeof obj === 'string') return interpolate(obj, ctx);
  if (Array.isArray(obj)) return obj.map((v) => deepInterpolate(v, ctx));
  if (typeof obj === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(obj)) out[k] = deepInterpolate(v, ctx);
    return out;
  }
  return obj;
}

export async function sendWelcome(member) {
  const { enabled, config } = load();
  if (!enabled) return { skipped: 'disabled' };
  if (!config) return { skipped: 'no_config' };

  const ctx = {
    username: member.user?.username ?? member.user?.globalName ?? 'there',
    serverName: member.guild?.name ?? 'the server',
    memberCount: member.guild?.memberCount ?? 0,
  };

  const payload = {};
  if (config.content) payload.content = interpolate(config.content, ctx);
  if (config.embed) {
    const e = deepInterpolate(config.embed, ctx);
    const embed = new EmbedBuilder();
    if (e.title) embed.setTitle(String(e.title).slice(0, 256));
    if (e.description) embed.setDescription(String(e.description).slice(0, 4000));
    if (typeof e.color === 'number') embed.setColor(e.color);
    if (e.thumbnail?.url) embed.setThumbnail(e.thumbnail.url);
    if (e.image?.url) embed.setImage(e.image.url);
    if (e.footer?.text) embed.setFooter({ text: e.footer.text, iconURL: e.footer.icon_url });
    if (e.author?.name) embed.setAuthor({ name: e.author.name, iconURL: e.author.icon_url });
    payload.embeds = [embed];
  }
  if (Array.isArray(config.buttons) && config.buttons.length) {
    const row = new ActionRowBuilder();
    for (const b of config.buttons.slice(0, 5)) {
      if (!b.label || !/^https?:\/\//.test(b.url ?? '')) continue;
      const btn = new ButtonBuilder()
        .setLabel(String(interpolate(b.label, ctx)).slice(0, 80))
        .setStyle(ButtonStyle.Link)
        .setURL(b.url);
      if (b.emoji) {
        try { btn.setEmoji(b.emoji); } catch {}
      }
      row.addComponents(btn);
    }
    if (row.components.length) payload.components = [row];
  }

  try {
    const dm = await member.createDM();
    await dm.send(payload);
    return { ok: true };
  } catch (e) {
    console.warn('[welcome] DM failed for', member.user?.tag, '-', e.message);
    return { ok: false, error: e.message };
  }
}
