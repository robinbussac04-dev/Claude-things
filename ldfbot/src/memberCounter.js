import { getClient } from './bot.js';

let cfg = {};
let pending = null;
let lastUpdate = 0;
const MIN_INTERVAL = 6 * 60 * 1000; // Discord rate-limits channel-name updates (~2/10min)

export function startMemberCounter(opts = {}) {
  cfg = opts;
  if (!cfg.channelId || !cfg.guildId) {
    console.log('[counter] disabled (no channel or guild)');
    return;
  }
  const client = getClient();
  client.on('guildMemberAdd', (m) => {
    if (m.guild.id === cfg.guildId) queueUpdate();
  });
  client.on('guildMemberRemove', (m) => {
    if (m.guild.id === cfg.guildId) queueUpdate();
  });
  // initial + hourly refresh
  queueUpdate();
  setInterval(queueUpdate, 60 * 60 * 1000);
  console.log('[counter] started on channel', cfg.channelId);
}

function queueUpdate() {
  if (pending) return;
  const now = Date.now();
  const wait = Math.max(0, MIN_INTERVAL - (now - lastUpdate));
  pending = setTimeout(async () => {
    pending = null;
    lastUpdate = Date.now();
    try {
      const client = getClient();
      const guild = await client.guilds.fetch(cfg.guildId);
      const count = guild.memberCount;
      const channel = await client.channels.fetch(cfg.channelId);
      const template = cfg.template || '📊 ・ {count} membres';
      const newName = template.replace('{count}', count);
      if (channel.name !== newName) {
        await channel.setName(newName, 'Member count update');
      }
    } catch (e) {
      console.warn('[counter] update failed', e.message);
    }
  }, wait);
}
