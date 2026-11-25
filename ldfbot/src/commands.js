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
import { findByKey, findByUser, record } from './redemptions.js';
import { enterGiveaway } from './giveaways.js';
import { buildPanelPayload, openTicket, closeTicket, listOpenTickets } from './tickets.js';
import { getRank, leaderboard } from './levels.js';

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
  new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Vider tout le contenu d\'un salon (Owner uniquement)')
    .addChannelOption((o) =>
      o.setName('salon').setDescription('Salon à vider (défaut: salon courant)').setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels.toString())
    .toJSON(),
  new SlashCommandBuilder()
    .setName('mykey')
    .setDescription('Voir le statut de ta clé de licence (DM)')
    .toJSON(),
  new SlashCommandBuilder()
    .setName('userinfo')
    .setDescription('Info complète sur un utilisateur (Discord + tickets + licences)')
    .addUserOption((o) =>
      o.setName('user').setDescription('Utilisateur à inspecter (défaut: toi)').setRequired(false)
    )
    .toJSON(),
  new SlashCommandBuilder()
    .setName('rank')
    .setDescription('Voir ton rang / XP sur le serveur')
    .addUserOption((o) =>
      o.setName('user').setDescription('Utilisateur (défaut: toi)').setRequired(false)
    )
    .toJSON(),
  new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Top 10 des membres les plus actifs')
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

async function handleClear(interaction, env) {
  const ownerRoleId = env.OWNER_ROLE_ID;
  if (!ownerRoleId) {
    return interaction.reply({
      content: '⚠️ OWNER_ROLE_ID n\'est pas configuré sur le bot.',
      flags: MessageFlags.Ephemeral,
    });
  }
  const member = interaction.member;
  const isOwner = member?.roles?.cache?.has?.(ownerRoleId);
  if (!isOwner) {
    return interaction.reply({
      content: '❌ Cette commande est réservée aux Owners.',
      flags: MessageFlags.Ephemeral,
    });
  }
  const target = interaction.options.getChannel('salon') ?? interaction.channel;
  if (!target || !target.isTextBased?.()) {
    return interaction.reply({
      content: '❌ Salon invalide.',
      flags: MessageFlags.Ephemeral,
    });
  }

  await interaction.reply({
    content: `🧹 Vidage de ${target}… (clone + delete, quelques secondes)`,
    flags: MessageFlags.Ephemeral,
  });

  try {
    const position = target.position;
    const clone = await target.clone({
      reason: `/clear par ${interaction.user.tag}`,
    });
    try { await clone.setPosition(position); } catch {}
    await target.delete(`/clear par ${interaction.user.tag}`);
    try {
      await clone.send({
        content: `🧹 Salon vidé par <@${interaction.user.id}>.`,
        allowedMentions: { users: [interaction.user.id] },
      });
    } catch {}
    try {
      await interaction.editReply({ content: `✅ Salon vidé. Nouveau : ${clone}` });
    } catch {}
  } catch (e) {
    console.error('[clear] error:', e);
    try {
      await interaction.editReply({
        content: '⚠️ Erreur : ' + e.message + '\n(Vérifie que LDF BOT a `Manage Channels` et un rôle au-dessus.)',
      });
    } catch {}
  }
}

async function handleRedeemPanel(interaction) {
  if (!interaction.guild) {
    return interaction.reply({ content: 'Commande dispo uniquement sur le serveur.', flags: MessageFlags.Ephemeral });
  }
  await interaction.reply({ content: '✅ Panel redeem posté.', flags: MessageFlags.Ephemeral });
  await interaction.channel.send(buildRedeemPanelPayload());
}

async function handleMyKey(interaction, env) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const keys = findByUser(interaction.user.id);
  if (!keys.length) {
    return interaction.editReply({
      content: '❌ Aucune clé enregistrée sur ton compte. Utilise le panel Redeem pour en activer une.',
    });
  }
  const lines = await Promise.all(
    keys.map(async (k) => {
      const masked = k.license_key.length > 8
        ? k.license_key.slice(0, 4) + '…' + k.license_key.slice(-4)
        : k.license_key;
      let status = k.status ?? 'ACTIVE';
      let expires = k.expires_at ?? '—';
      let daysLeft = k.days_remaining;
      if (getPWF()) {
        try {
          const res = await checkKey(k.license_key);
          if (res) {
            status = res.status ?? status;
            expires = res.expires_at ?? expires;
            daysLeft = res.days_remaining ?? daysLeft;
          }
        } catch {}
      }
      const em = status && String(status).toLowerCase() === 'active' ? '🟢' : '🔴';
      return `${em} \`${masked}\` — statut: **${status}** · expire: **${expires}**${daysLeft != null ? ` (${daysLeft}j restants)` : ''}`;
    })
  );
  const embed = new EmbedBuilder()
    .setTitle('🔑 Tes clés de licence')
    .setColor(0xd9304a)
    .setDescription(lines.join('\n'))
    .setFooter({ text: 'Besoin de renouveler ? Ouvre un ticket Purchase.' });
  return interaction.editReply({ embeds: [embed] });
}

async function handleUserInfo(interaction, env) {
  const target = interaction.options.getUser('user') ?? interaction.user;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const member = await interaction.guild?.members.fetch(target.id).catch(() => null);
  const keys = findByUser(target.id);
  const openTk = listOpenTickets().filter((t) => t.userId === target.id);
  const rankInfo = getRank(target.id);

  const embed = new EmbedBuilder()
    .setTitle(`👤 ${target.tag}`)
    .setThumbnail(target.displayAvatarURL({ size: 128 }))
    .setColor(0x5865f2)
    .addFields(
      { name: 'ID', value: `\`${target.id}\``, inline: true },
      { name: 'Compte créé', value: `<t:${Math.floor(target.createdTimestamp / 1000)}:R>`, inline: true }
    );
  if (member) {
    embed.addFields(
      { name: 'Rejoint le', value: member.joinedTimestamp ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>` : '—', inline: true },
      { name: 'Rôles', value: member.roles.cache.filter((r) => r.id !== member.guild.id).map((r) => `<@&${r.id}>`).join(' ') || '—' }
    );
  }
  embed.addFields(
    { name: 'Clés PWF', value: keys.length ? keys.map((k) => `\`${k.license_key.slice(0, 4)}…${k.license_key.slice(-4)}\` (${k.status ?? 'ACTIVE'})`).join('\n') : '—' },
    { name: 'Tickets ouverts', value: openTk.length ? openTk.map((t) => `<#${t.channelId}> (${t.type})`).join('\n') : '—' },
    { name: 'XP / Niveau', value: rankInfo ? `Niveau **${rankInfo.level}** · ${rankInfo.xp} XP · Rang **#${rankInfo.rank}**` : '—' }
  );
  return interaction.editReply({ embeds: [embed] });
}

async function handleRank(interaction) {
  const target = interaction.options.getUser('user') ?? interaction.user;
  const r = getRank(target.id);
  if (!r) {
    return interaction.reply({ content: `❌ Pas encore de XP pour ${target.tag}.`, flags: MessageFlags.Ephemeral });
  }
  const pct = Math.min(100, Math.floor((r.xp / r.nextLevelAt) * 100));
  const bar = '█'.repeat(Math.round(pct / 5)).padEnd(20, '░');
  const embed = new EmbedBuilder()
    .setTitle(`📈 Rang de ${target.tag}`)
    .setColor(0xf1c40f)
    .setThumbnail(target.displayAvatarURL({ size: 128 }))
    .setDescription(
      `**Niveau** : ${r.level}\n` +
      `**XP** : ${r.xp} / ${r.nextLevelAt}\n` +
      `**Rang** : #${r.rank} / ${r.total}\n\n` +
      `\`${bar}\` ${pct}%`
    );
  return interaction.reply({ embeds: [embed] });
}

async function handleLeaderboard(interaction) {
  const top = leaderboard(10);
  if (!top.length) {
    return interaction.reply({ content: 'Pas encore de leaderboard — personne n\'a d\'XP pour l\'instant.', flags: MessageFlags.Ephemeral });
  }
  const medals = ['🥇', '🥈', '🥉'];
  const lines = top.map((u, i) => {
    const prefix = medals[i] ?? `**${i + 1}.**`;
    return `${prefix} <@${u.userId}> — Niveau **${u.level}** (${u.xp} XP)`;
  });
  const embed = new EmbedBuilder()
    .setTitle('🏆 Leaderboard LDF Devs')
    .setColor(0xf1c40f)
    .setDescription(lines.join('\n'));
  return interaction.reply({ embeds: [embed], allowedMentions: { users: [] } });
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
    case 'clear':
      return handleClear(interaction, env);
    case 'mykey':
      return handleMyKey(interaction, env);
    case 'userinfo':
      return handleUserInfo(interaction, env);
    case 'rank':
      return handleRank(interaction);
    case 'leaderboard':
      return handleLeaderboard(interaction);
  }
}

export async function registerCommands(client, guildId) {
  const guild = await client.guilds.fetch(guildId);
  await guild.commands.set(commandDefs);
  console.log(`[commands] registered ${commandDefs.length} command(s) in guild ${guild.name}`);
}
