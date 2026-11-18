import { Client, GatewayIntentBits, Partials, ChannelType, MessageFlags } from 'discord.js';
import { registerCommands, handleInteraction } from './commands.js';
import { sendWelcome } from './welcome.js';
import { record as recordMemberEvent } from './memberlog.js';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildPresences,
  ],
  partials: [Partials.Channel, Partials.GuildMember, Partials.User],
});

let ready = false;

client.on('error', (e) => console.error('[bot] error:', e));

export async function startBot(token, { guildId, commandEnv, onReady } = {}) {
  client.once('clientReady', async (c) => {
    ready = true;
    console.log(`[bot] logged in as ${c.user.tag}`);
    if (guildId) {
      try {
        await registerCommands(c, guildId);
      } catch (e) {
        console.error('[commands] registration failed:', e);
      }
    }
    if (onReady) {
      try {
        await onReady();
      } catch (e) {
        console.error('[bot] onReady hook failed:', e);
      }
    }
  });

  client.on('interactionCreate', async (interaction) => {
    try {
      await handleInteraction(interaction, commandEnv ?? {});
    } catch (e) {
      console.error('[interaction] error:', e);
      if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
        try {
          await interaction.reply({ content: 'Internal error', flags: MessageFlags.Ephemeral });
        } catch {}
      }
    }
  });

  client.on('guildMemberAdd', async (member) => {
    if (guildId && member.guild.id !== guildId) return;
    recordMemberEvent('join', member.user);
    sendWelcome(member).catch((e) => console.warn('[welcome] send error:', e.message));
  });

  client.on('guildMemberRemove', (member) => {
    if (guildId && member.guild.id !== guildId) return;
    recordMemberEvent('leave', member.user);
  });

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
