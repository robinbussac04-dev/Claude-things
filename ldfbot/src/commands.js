import {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { checkKey, getPWF } from './pwf.js';
import { findByKey, record } from './redemptions.js';
import { enterGiveaway } from './giveaways.js';
import { buildPanelPayload, openTicket, closeTicket } from './tickets.js';

export const commandDefs = [
  new SlashCommandBuilder()
    .setName('ticket-panel')
    .setDescription('Poster le panel de tickets dans ce salon (admin)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild.toString())
    .toJSON(),
  new SlashCommandBuilder()
    .setName('close')
    .setDescription('Fermer le ticket en cours (opener ou head support)')
    .toJSON(),
  new SlashCommandBuilder()
    .setName('redeem-panel')
    .setDescription('Poster le panel de redeem dans ce salon (admin)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild.toString())
    .toJSON(),
];

export function buildRedeemPanelPayload() {
  const embed = new EmbedBuilder()
    .setTitle('🔑 Redeem ta clé de licence')
    .setDescription(
      'Clique sur le bouton ci-dessous pour entrer ta clé de licence.\n' +
        'Si elle est valide, tu recevras le rôle **Customer** automatiquement.'
    )
    .setColor(0xd9304a)
    .setFooter({ text: 'LDF Devs • PWF Auth' });
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('redeem:open')
      .setLabel('Redeem')
      .setEmoji('🔑')
      .setStyle(ButtonStyle.Primary)
  );
  return { embeds: [embed], components: [row] };
}

async function showRedeemModal(interaction) {
  const modal = new ModalBuilder()
    .setCustomId('redeem:submit')
    .setTitle('Redeem ta clé');
  const input = new TextInputBuilder()
    .setCustomId('key')
    .setLabel('Clé de licence')
    .setPlaceholder('XXXX-XXXX-XXXX-XXXX')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMinLength(4)
    .setMaxLength(200);
  modal.addComponents(new ActionRowBuilder().addComponents(input));
  await interaction.showModal(modal);
}

function maskKey(k) {
  if (!k) return '***';
  if (k.length <= 8) return k[0] + '***' + k[k.length - 1];
  return k.slice(0, 4) + '…' + k.slice(-4);
}

async function processRedeem(interaction, env, rawKey) {
  const key = String(rawKey ?? '').trim();

  if (!getPWF()) {
    return interaction.editReply({
      content: '⚠️ PWF Auth n\'est pas configuré sur ce bot.',
    });
  }

  const existing = findByKey(key);
  if (existing) {
    if (existing.discord_user_id === interaction.user.id) {
      return interaction.editReply({
        content: '✅ Tu as déjà validé cette clé. Rôle déjà attribué.',
      });
    }
    return interaction.editReply({
      content: '❌ Cette clé a déjà été utilisée par un autre compte Discord. Contacte le support si c\'est une erreur.',
    });
  }

  let result;
  try {
    result = await checkKey(key);
  } catch (e) {
    console.error('[redeem] pwf error:', e);
    return interaction.editReply({
      content: '⚠️ Impossible de contacter le serveur de licence. Réessaie dans quelques minutes.',
    });
  }

  if (!result || !result.success) {
    const code = result?.error_code ?? 'UNKNOWN';
    const msg = result?.message ? ` — ${result.message}` : '';
    return interaction.editReply({
      content: `❌ Clé refusée (\`${code}\`)${msg}`,
    });
  }

  const roleId = env.CUSTOMER_ROLE_ID;
  if (!roleId) {
    return interaction.editReply({
      content: '⚠️ Le rôle Customer n\'est pas configuré sur le bot. Contacte l\'admin.',
    });
  }

  if (!interaction.guild) {
    return interaction.editReply({
      content: '⚠️ Cette commande doit être utilisée dans le serveur, pas en DM.',
    });
  }

  try {
    const member = await interaction.guild.members.fetch(interaction.user.id);
    await member.roles.add(roleId, `PWF redeem: ${maskKey(key)}`);
  } catch (e) {
    console.error('[redeem] role error:', e);
    return interaction.editReply({
      content: '⚠️ Impossible d\'attribuer le rôle. Vérifie que le bot a `Manage Roles` et que son rôle est au-dessus de Customer dans la hiérarchie.',
    });
  }

  record(key, interaction.user.id, {
    username: interaction.user.tag,
    status: result.status ?? null,
    expires_at: result.expires_at ?? null,
    days_remaining: result.days_remaining ?? null,
  });

  if (env.REDEEM_LOG_CHANNEL_ID) {
    try {
      const ch = await interaction.client.channels.fetch(env.REDEEM_LOG_CHANNEL_ID);
      const embed = new EmbedBuilder()
        .setTitle('✓ New redeem')
        .setColor(0x3ecf8e)
        .addFields(
          { name: 'User', value: `<@${interaction.user.id}>\n\`${interaction.user.tag}\``, inline: true },
          { name: 'Key', value: '`' + maskKey(key) + '`', inline: true },
          { name: 'Status', value: String(result.status ?? 'ACTIVE'), inline: true },
        )
        .setTimestamp(new Date());
      if (result.expires_at) embed.addFields({ name: 'Expires', value: String(result.expires_at), inline: true });
      if (result.days_remaining != null) embed.addFields({ name: 'Days left', value: String(result.days_remaining), inline: true });
      await ch.send({ embeds: [embed] });
    } catch (e) {
      console.error('[redeem] log channel error:', e);
    }
  }

  const expiry = result.expires_at
    ? `\n⏰ Expire : **${result.expires_at}**${result.days_remaining != null ? ` (${result.days_remaining}j restants)` : ''}`
    : '';
  await interaction.editReply({
    content: `🎉 Clé validée. Le rôle Customer t'a été attribué.${expiry}`,
  });
}

async function handleGiveawayButton(interaction) {
  const parts = interaction.customId.split(':');
  if (parts[0] !== 'giveaway' || parts[1] !== 'enter') return;
  const giveawayId = parts[2];

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  try {
    const res = await enterGiveaway(giveawayId, interaction.user.id);
    if (!res.ok) {
      const messages = {
        not_found: '❌ Ce giveaway n\'existe plus.',
        ended: '❌ Ce giveaway est terminé.',
        already_entered: 'ℹ️ Tu participes déjà à ce giveaway, bonne chance !',
      };
      return interaction.editReply({ content: messages[res.reason] ?? '❌ Erreur inconnue' });
    }
    return interaction.editReply({ content: `🎉 Participation confirmée ! Tu es le participant **#${res.entrantsCount}**. Bonne chance.` });
  } catch (e) {
    console.error('[giveaway] enter error:', e);
    return interaction.editReply({ content: '⚠️ Erreur serveur. Réessaie plus tard.' });
  }
}

async function handleTicketPanel(interaction, env) {
  if (!interaction.guild) {
    return interaction.reply({ content: 'Commande dispo uniquement sur le serveur.', flags: MessageFlags.Ephemeral });
  }
  await interaction.reply({ content: '✅ Panel posté.', flags: MessageFlags.Ephemeral });
  await interaction.channel.send(buildPanelPayload());
}

async function handleRedeemPanel(interaction) {
  if (!interaction.guild) {
    return interaction.reply({ content: 'Commande dispo uniquement sur le serveur.', flags: MessageFlags.Ephemeral });
  }
  await interaction.reply({ content: '✅ Panel redeem posté.', flags: MessageFlags.Ephemeral });
  await interaction.channel.send(buildRedeemPanelPayload());
}

async function handleRedeemSubmit(interaction, env) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const key = interaction.fields.getTextInputValue('key');
  return processRedeem(interaction, env, key);
}

export async function handleInteraction(interaction, env) {
  if (interaction.isButton()) {
    if (interaction.customId.startsWith('giveaway:')) {
      return handleGiveawayButton(interaction);
    }
    if (interaction.customId.startsWith('ticket:open:')) {
      const type = interaction.customId.split(':')[2];
      return openTicket(interaction, type, env);
    }
    if (interaction.customId === 'ticket:close') {
      return closeTicket(interaction, env);
    }
    if (interaction.customId === 'redeem:open') {
      return showRedeemModal(interaction);
    }
    return;
  }
  if (interaction.isModalSubmit()) {
    if (interaction.customId === 'redeem:submit') {
      return handleRedeemSubmit(interaction, env);
    }
    return;
  }
  if (!interaction.isChatInputCommand()) return;
  switch (interaction.commandName) {
    case 'ticket-panel':
      return handleTicketPanel(interaction, env);
    case 'close':
      return closeTicket(interaction, env);
    case 'redeem-panel':
      return handleRedeemPanel(interaction);
  }
}

export async function registerCommands(client, guildId) {
  const guild = await client.guilds.fetch(guildId);
  await guild.commands.set(commandDefs);
  console.log(`[commands] registered ${commandDefs.length} command(s) in guild ${guild.name}`);
}
