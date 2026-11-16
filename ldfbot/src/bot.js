import { Client, GatewayIntentBits, Partials, ChannelType } from 'discord.js';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
  partials: [Partials.Channel],
});

let ready = false;

client.once('clientReady', (c) => {
  ready = true;
  console.log(`[bot] logged in as ${c.user.tag}`);
});

client.on('error', (e) => console.error('[bot] error:', e));

export async function startBot(token) {
  await client.login(token);
}

export function isReady() {
  return ready;
}

export function getClient() {
  return client;
}

export async function listTextChannels(guildId) {
  const guild = await client.guilds.fetch(guildId);
  await guild.channels.fetch();
  const channels = [...guild.channels.cache.values()]
    .filter((ch) =>
      ch.type === ChannelType.GuildText ||
      ch.type === ChannelType.GuildAnnouncement
    )
    .map((ch) => ({
      id: ch.id,
      name: ch.name,
      parentName: ch.parent?.name ?? null,
      position: ch.rawPosition ?? 0,
    }))
    .sort((a, b) => {
      const p = (a.parentName ?? '').localeCompare(b.parentName ?? '');
      return p !== 0 ? p : a.position - b.position;
    });
  return channels;
}

export async function sendToChannel(channelId, payload) {
  const channel = await client.channels.fetch(channelId);
  if (!channel || !channel.isTextBased()) {
    throw new Error('Channel introuvable ou non textuel');
  }
  return channel.send(payload);
}

export async function sendDM(userId, payload) {
  const user = await client.users.fetch(userId);
  const dm = await user.createDM();
  return dm.send(payload);
}
