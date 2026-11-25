import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  AttachmentBuilder,
} from 'discord.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.join(__dirname, '..', 'data', 'tickets.json');

export const TICKET_TYPES = {
  support: {
    label: 'Support',
    emoji: '🛠️',
    style: ButtonStyle.Primary,
    color: 0x5865f2,
    description: 'Besoin d\'aide avec un logiciel / bug / question générale.',
    envKey: 'TICKET_CATEGORY_SUPPORT',
  },
  purchase: {
    label: 'Purchase',
    emoji: '🛒',
    style: ButtonStyle.Success,
    color: 0x3ecf8e,
    description: 'Question avant achat, paiement, facture, demande spécifique.',
    envKey: 'TICKET_CATEGORY_PURCHASE',
  },
  media: {
    label: 'Media',
    emoji: '📸',
    style: ButtonStyle.Secondary,
    color: 0xaa55ff,
    description: 'Partenariat, sponsoring, demande presse / content creator.',
    envKey: 'TICKET_CATEGORY_MEDIA',
  },
};

function load() {
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch {
    return { tickets: {} };
  }
}

function save(data) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, FILE);
}

function recordTicket(channelId, info) {
  const data = load();
  data.tickets[channelId] = info;
  save(data);
}

function dropTicket(channelId) {
  const data = load();
  delete data.tickets[channelId];
  save(data);
}

function getTicket(channelId) {
  return load().tickets[channelId] ?? null;
}

export function touchOpenerActivity(channelId, userId) {
  const data = load();
  const t = data.tickets[channelId];
  if (!t || t.userId !== userId) return;
  t.lastOpenerActivityAt = new Date().toISOString();
  save(data);
}

export function listOpenTickets() {
  return Object.entries(load().tickets).map(([channelId, info]) => ({ channelId, ...info }));
}

export function buildPanelPayload() {
  const embed = new EmbedBuilder()
    .setTitle('🎫 LDF Devs — Support')
    .setDescription(
      'Besoin d\'aide ? Ouvre un ticket en cliquant sur le bouton qui correspond à ta demande.\n\n' +
        Object.entries(TICKET_TYPES)
          .map(([, t]) => `**${t.emoji} ${t.label}** — ${t.description}`)
          .join('\n') +
        '\n\n*Un seul ticket ouvert à la fois par personne.*'
    )
    .setColor(0xd9304a);

  const row = new ActionRowBuilder().addComponents(
    ...Object.entries(TICKET_TYPES).map(([key, t]) =>
      new ButtonBuilder()
        .setCustomId(`ticket:open:${key}`)
        .setLabel(t.label)
        .setEmoji(t.emoji)
        .setStyle(t.style)
    )
  );
  return { embeds: [embed], components: [row] };
}

function hasExistingTicket(guild, userId) {
  const data = load();
  for (const [channelId, info] of Object.entries(data.tickets)) {
    if (info.userId !== userId) continue;
    const channel = guild.channels.cache.get(channelId);
    if (channel) return channel;
    // channel was deleted outside the bot — clean up
    dropTicket(channelId);
  }
  return null;
}

export async function openTicket(interaction, type, env) {
  const cfg = TICKET_TYPES[type];
  if (!cfg) {
    return interaction.reply({
      content: 'Type de ticket inconnu.',
      flags: MessageFlags.Ephemeral,
    });
  }

  const categoryId = env[cfg.envKey];
  if (!categoryId) {
    return interaction.reply({
      content: `⚠️ La catégorie **${cfg.label}** n'est pas configurée (${cfg.envKey} manquante).`,
      flags: MessageFlags.Ephemeral,
    });
  }

  const headSupportRoleId = env.HEAD_SUPPORT_ROLE_ID;
  if (!headSupportRoleId) {
    return interaction.reply({
      content: '⚠️ HEAD_SUPPORT_ROLE_ID non configuré.',
      flags: MessageFlags.Ephemeral,
    });
  }

  if (!interaction.guild) {
    return interaction.reply({
      content: 'Commande dispo uniquement sur le serveur.',
      flags: MessageFlags.Ephemeral,
    });
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const existing = hasExistingTicket(interaction.guild, interaction.user.id);
  if (existing) {
    return interaction.editReply({
      content: `⚠️ Tu as déjà un ticket ouvert : ${existing}`,
    });
  }

  const safeName = interaction.user.username
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 20) || 'user';
  const channelName = `${type}-${safeName}`;

  let channel;
  try {
    channel = await interaction.guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: categoryId,
      topic: `Ticket ${cfg.label} ouvert par ${interaction.user.tag} (${interaction.user.id})`,
      permissionOverwrites: [
        {
          id: interaction.guild.roles.everyone.id,
          deny: [PermissionFlagsBits.ViewChannel],
        },
        {
          id: interaction.user.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.AttachFiles,
            PermissionFlagsBits.EmbedLinks,
          ],
        },
        {
          id: headSupportRoleId,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.AttachFiles,
            PermissionFlagsBits.EmbedLinks,
            PermissionFlagsBits.ManageMessages,
          ],
        },
      ],
    });
  } catch (e) {
    console.error('[tickets] create channel failed:', e);
    return interaction.editReply({
      content: '⚠️ Impossible de créer le salon. Vérifie que le bot a `Manage Channels` et que la catégorie est bonne.',
    });
  }

  recordTicket(channel.id, {
    userId: interaction.user.id,
    username: interaction.user.tag,
    type,
    createdAt: new Date().toISOString(),
    lastOpenerActivityAt: new Date().toISOString(),
  });

  const welcome = new EmbedBuilder()
    .setTitle(`${cfg.emoji} Ticket ${cfg.label}`)
    .setDescription(
      `Bienvenue <@${interaction.user.id}>, un membre du support te répondra bientôt.\n\n` +
        `Décris ton problème le plus précisément possible (captures, messages d'erreur, numéro de commande…).\n\n` +
        `Pour fermer ce ticket : bouton **🔒 Close** ci-dessous, ou commande **/close**.`
    )
    .setColor(cfg.color)
    .setTimestamp(new Date());

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('ticket:close')
      .setLabel('Close')
      .setEmoji('🔒')
      .setStyle(ButtonStyle.Danger)
  );

  await channel.send({
    content: `<@${interaction.user.id}> <@&${headSupportRoleId}>`,
    embeds: [welcome],
    components: [row],
    allowedMentions: { users: [interaction.user.id], roles: [headSupportRoleId] },
  });

  return interaction.editReply({
    content: `✅ Ticket ouvert : ${channel}`,
  });
}

export async function closeTicket(interaction, env) {
  const channel = interaction.channel;
  if (!channel) {
    return interaction.reply({ content: 'Salon introuvable.', flags: MessageFlags.Ephemeral });
  }
  const ticket = getTicket(channel.id);
  if (!ticket) {
    return interaction.reply({
      content: '⚠️ Ce salon n\'est pas un ticket géré par le bot.',
      flags: MessageFlags.Ephemeral,
    });
  }

  const headSupportRoleId = env.HEAD_SUPPORT_ROLE_ID;
  const member = interaction.member;
  const isOwner = interaction.user.id === ticket.userId;
  const isStaff = member?.roles?.cache?.has?.(headSupportRoleId);
  if (!isOwner && !isStaff) {
    return interaction.reply({
      content: '❌ Tu n\'as pas la permission de fermer ce ticket.',
      flags: MessageFlags.Ephemeral,
    });
  }

  await interaction.reply({
    content: `🔒 Fermeture du ticket par <@${interaction.user.id}>… génération de la transcript.`,
  });

  let transcript;
  try {
    transcript = await buildTranscript(channel, ticket);
  } catch (e) {
    console.error('[tickets] transcript build failed:', e);
    transcript = null;
  }

  if (transcript) {
    try {
      const user = await interaction.client.users.fetch(ticket.userId);
      const dm = await user.createDM();
      const closedBy = interaction.user.tag;
      await dm.send({
        content:
          `🔒 Ton ticket **${TICKET_TYPES[ticket.type]?.label ?? ticket.type}** sur **${interaction.guild.name}** a été fermé par **${closedBy}**.\n` +
          `Voici la transcript complète du ticket :`,
        files: [
          new AttachmentBuilder(Buffer.from(transcript, 'utf8'), {
            name: `transcript-${channel.name}-${Date.now()}.html`,
          }),
        ],
      });
    } catch (e) {
      console.warn('[tickets] DM transcript failed:', e.message);
      try {
        await channel.send({
          content: `⚠️ Impossible d\'envoyer la transcript en DM à <@${ticket.userId}> (DMs fermés ?).`,
        });
      } catch {}
    }
  }

  dropTicket(channel.id);

  // small delay so users see the "closing" message
  await new Promise((r) => setTimeout(r, 2500));
  try {
    await channel.delete(`Ticket closed by ${interaction.user.tag}`);
  } catch (e) {
    console.error('[tickets] delete channel failed:', e);
  }
}

async function autoCloseTicket(client, channelId, reason = 'inactivity') {
  const ticket = getTicket(channelId);
  if (!ticket) return;
  let channel;
  try {
    channel = await client.channels.fetch(channelId);
  } catch {
    dropTicket(channelId);
    return;
  }
  if (!channel) {
    dropTicket(channelId);
    return;
  }

  try {
    await channel.send({
      content:
        reason === 'inactivity'
          ? `⏳ Ticket fermé automatiquement : **24h sans réponse** du client.\nSi besoin, <@${ticket.userId}> peut rouvrir un ticket.`
          : `🔒 Ticket fermé automatiquement (${reason}).`,
    });
  } catch {}

  let transcript;
  try { transcript = await buildTranscript(channel, ticket); } catch (e) {
    console.warn('[tickets] auto-close transcript failed:', e.message);
  }
  if (transcript) {
    try {
      const user = await client.users.fetch(ticket.userId);
      const dm = await user.createDM();
      await dm.send({
        content:
          `🔒 Ton ticket **${TICKET_TYPES[ticket.type]?.label ?? ticket.type}** a été fermé automatiquement ` +
          `(${reason === 'inactivity' ? '24h d\'inactivité de ta part' : reason}). Transcript ci-dessous :`,
        files: [
          new AttachmentBuilder(Buffer.from(transcript, 'utf8'), {
            name: `transcript-${channel.name}-${Date.now()}.html`,
          }),
        ],
      });
    } catch {}
  }

  dropTicket(channelId);
  try { await channel.delete(`Auto-close: ${reason}`); } catch {}
}

export function startTicketScanner(client, { inactivityHours = 24 } = {}) {
  const check = async () => {
    const now = Date.now();
    const cutoff = inactivityHours * 60 * 60 * 1000;
    for (const t of listOpenTickets()) {
      const last = new Date(t.lastOpenerActivityAt ?? t.createdAt).getTime();
      if (now - last > cutoff) {
        try {
          await autoCloseTicket(client, t.channelId, 'inactivity');
        } catch (e) {
          console.warn('[tickets] auto-close failed:', e.message);
        }
      }
    }
  };
  setInterval(check, 30 * 60 * 1000); // every 30 min
  setTimeout(check, 2 * 60 * 1000);   // first run after 2 min
  console.log(`[tickets] inactivity scanner started (${inactivityHours}h)`);
}

/* ---------- Transcript HTML ---------- */

async function fetchAllMessages(channel, max = 500) {
  const out = [];
  let lastId = null;
  while (out.length < max) {
    const batch = await channel.messages.fetch({ limit: 100, ...(lastId ? { before: lastId } : {}) });
    if (batch.size === 0) break;
    for (const m of batch.values()) out.push(m);
    lastId = batch.last().id;
    if (batch.size < 100) break;
  }
  return out.reverse();
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]));
}

function fmtDate(d) {
  return new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'medium',
    timeStyle: 'medium',
    timeZone: 'Europe/Paris',
  }).format(new Date(d));
}

function fmtTime(d) {
  return new Intl.DateTimeFormat('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Paris',
  }).format(new Date(d));
}

function renderContent(content) {
  if (!content) return '';
  let s = esc(content);
  // code block ```x```
  s = s.replace(/```([a-zA-Z]+)?\n?([\s\S]*?)```/g, (_, _lang, code) =>
    `<pre class="code">${code}</pre>`
  );
  // inline code `x`
  s = s.replace(/`([^`\n]+)`/g, '<code class="ic">$1</code>');
  // bold **x**
  s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  // italic *x* / _x_
  s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  s = s.replace(/(^|[^_])_([^_\n]+)_/g, '$1<em>$2</em>');
  // underline __x__
  s = s.replace(/__([^_\n]+)__/g, '<u>$1</u>');
  // strike ~~x~~
  s = s.replace(/~~([^~\n]+)~~/g, '<s>$1</s>');
  // mentions
  s = s.replace(/&lt;@!?(\d+)&gt;/g, '<span class="mention">@user</span>');
  s = s.replace(/&lt;@&amp;(\d+)&gt;/g, '<span class="mention role">@role</span>');
  s = s.replace(/&lt;#(\d+)&gt;/g, '<span class="mention channel">#channel</span>');
  // URLs
  s = s.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
  // newlines
  s = s.replace(/\n/g, '<br>');
  return s;
}

function renderEmbed(embed) {
  const color = embed.color ? '#' + embed.color.toString(16).padStart(6, '0') : '#4f545c';
  let html = `<div class="embed" style="border-left-color:${color}">`;
  if (embed.author) {
    html += `<div class="embed-author">${esc(embed.author.name ?? '')}</div>`;
  }
  if (embed.title) {
    html += `<div class="embed-title">${esc(embed.title)}</div>`;
  }
  if (embed.description) {
    html += `<div class="embed-desc">${renderContent(embed.description)}</div>`;
  }
  if (Array.isArray(embed.fields) && embed.fields.length) {
    html += '<div class="embed-fields">';
    for (const f of embed.fields) {
      html += `<div class="embed-field${f.inline ? ' inline' : ''}">
        <div class="ef-name">${esc(f.name)}</div>
        <div class="ef-value">${renderContent(f.value)}</div>
      </div>`;
    }
    html += '</div>';
  }
  if (embed.image?.url) {
    html += `<img class="embed-img" src="${esc(embed.image.url)}" alt="">`;
  }
  if (embed.thumbnail?.url) {
    html += `<img class="embed-thumb" src="${esc(embed.thumbnail.url)}" alt="">`;
  }
  if (embed.footer?.text) {
    html += `<div class="embed-footer">${esc(embed.footer.text)}</div>`;
  }
  html += '</div>';
  return html;
}

function renderAttachment(a) {
  const url = a.url ?? a.proxyURL ?? '';
  const name = esc(a.name ?? 'file');
  if ((a.contentType ?? '').startsWith('image/') || /\.(png|jpe?g|gif|webp|avif)$/i.test(name)) {
    return `<a class="att-img-wrap" href="${esc(url)}" target="_blank" rel="noopener"><img class="att-img" src="${esc(url)}" alt="${name}"></a>`;
  }
  return `<a class="att-file" href="${esc(url)}" target="_blank" rel="noopener">📎 ${name}</a>`;
}

export async function buildTranscript(channel, ticket) {
  const messages = await fetchAllMessages(channel);
  const cfg = TICKET_TYPES[ticket.type] ?? { label: ticket.type, color: 0x5865f2, emoji: '🎫' };
  const guild = channel.guild;

  const openedAt = fmtDate(ticket.createdAt);
  const closedAt = fmtDate(new Date());
  const headerColor = '#' + cfg.color.toString(16).padStart(6, '0');

  let messagesHtml = '';
  if (messages.length === 0) {
    messagesHtml = '<div class="empty">Aucun message dans ce ticket.</div>';
  } else {
    let lastAuthor = null;
    let lastTime = 0;
    for (const m of messages) {
      const t = m.createdTimestamp;
      const sameAuthor = m.author.id === lastAuthor && t - lastTime < 5 * 60 * 1000;
      const avatarURL = m.author.displayAvatarURL({ extension: 'png', size: 64 });
      const authorTag = esc(m.member?.displayName ?? m.author.username);
      const isBot = m.author.bot;
      let msgClass = 'msg';
      if (sameAuthor) msgClass += ' same';
      msgClass += isBot ? ' bot' : '';

      messagesHtml += `<div class="${msgClass}">`;
      if (!sameAuthor) {
        messagesHtml += `<img class="avatar" src="${esc(avatarURL)}" alt="">`;
        messagesHtml += `<div class="body">
          <div class="meta">
            <span class="name">${authorTag}</span>${isBot ? '<span class="tag">BOT</span>' : ''}
            <span class="when" title="${esc(fmtDate(t))}">${esc(fmtDate(t))}</span>
          </div>`;
      } else {
        messagesHtml += `<div class="body no-avatar">
          <span class="when inline" title="${esc(fmtDate(t))}">${esc(fmtTime(t))}</span>`;
      }
      if (m.content) {
        messagesHtml += `<div class="content">${renderContent(m.content)}</div>`;
      }
      if (m.attachments?.size) {
        messagesHtml += '<div class="atts">';
        for (const a of m.attachments.values()) messagesHtml += renderAttachment(a);
        messagesHtml += '</div>';
      }
      if (m.embeds?.length) {
        for (const em of m.embeds) {
          const data = em.data ?? em;
          messagesHtml += renderEmbed(data);
        }
      }
      messagesHtml += '</div></div>';
      lastAuthor = m.author.id;
      lastTime = t;
    }
  }

  const title = `Ticket ${cfg.label} — ${esc(ticket.username)}`;

  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>
*{box-sizing:border-box}
html,body{margin:0;padding:0;background:#0f1114;color:#dcddde;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5}
.wrap{max-width:900px;margin:0 auto;padding:0 0 60px}
header.card{background:linear-gradient(135deg,${headerColor}22,${headerColor}08);border-bottom:3px solid ${headerColor};padding:28px 24px}
h1{margin:0 0 6px;font-size:22px;color:#fff}
.sub{color:#b9bbbe;font-size:13px}
.meta-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-top:18px}
.meta-grid .mc{background:rgba(0,0,0,.25);border:1px solid rgba(255,255,255,.05);padding:10px 12px;border-radius:8px}
.meta-grid .label{font-size:11px;color:#8a8d95;text-transform:uppercase;letter-spacing:.6px;margin-bottom:3px}
.meta-grid .val{color:#fff;font-size:14px;word-break:break-word}
.messages{padding:20px 16px}
.msg{display:grid;grid-template-columns:48px 1fr;gap:14px;padding:6px 10px;border-radius:6px}
.msg:hover{background:rgba(255,255,255,.02)}
.msg.same{padding-top:2px;padding-bottom:2px}
.msg .avatar{width:40px;height:40px;border-radius:50%;object-fit:cover;background:#23232c;grid-row:span 1}
.msg .body{min-width:0}
.msg .body.no-avatar{grid-column:2}
.msg.same .avatar{visibility:hidden;height:0}
.meta{display:flex;align-items:baseline;gap:8px;margin-bottom:2px;flex-wrap:wrap}
.name{color:#fff;font-weight:600;font-size:15px}
.tag{background:#5865f2;color:#fff;font-size:10px;font-weight:700;padding:2px 5px;border-radius:3px;letter-spacing:.3px}
.when{color:#72767d;font-size:12px}
.when.inline{margin-right:4px;font-size:11px;color:#5f6368;float:left;width:40px;text-align:right;padding-right:6px;opacity:0}
.msg.same:hover .when.inline{opacity:1}
.content{color:#dcddde;white-space:pre-wrap;word-wrap:break-word}
.content code.ic{background:#1e1f24;padding:1px 5px;border-radius:3px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:13px;color:#eaeaea}
.content pre.code{background:#1e1f24;padding:10px 12px;border-radius:5px;overflow:auto;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:13px;color:#eaeaea;margin:4px 0;border:1px solid #2a2c33}
.content a{color:#7ea8ff;text-decoration:none}
.content a:hover{text-decoration:underline}
.mention{background:rgba(88,101,242,.3);color:#c9cdfb;padding:0 3px;border-radius:3px;font-weight:500}
.mention.role{background:rgba(255,200,90,.2);color:#ffd27d}
.mention.channel{background:rgba(88,101,242,.2)}
.atts{display:flex;flex-direction:column;gap:6px;margin-top:6px}
.att-img-wrap{display:inline-block;max-width:400px}
.att-img{max-width:100%;max-height:300px;border-radius:5px;display:block}
.att-file{display:inline-block;background:#1e1f24;padding:8px 12px;border-radius:6px;color:#dcddde;text-decoration:none;border:1px solid #2a2c33}
.att-file:hover{background:#23242b}
.embed{background:#1e1f24;border-left:4px solid #4f545c;border-radius:4px;padding:10px 12px;margin-top:6px;max-width:520px}
.embed-author{color:#dcddde;font-size:13px;margin-bottom:4px}
.embed-title{color:#fff;font-weight:600;font-size:15px;margin-bottom:6px}
.embed-desc{color:#dcddde;font-size:14px}
.embed-fields{margin-top:8px;display:grid;grid-template-columns:1fr;gap:8px}
.embed-field.inline{display:inline-block;min-width:150px;margin-right:12px}
.ef-name{color:#fff;font-weight:600;font-size:13px}
.ef-value{color:#dcddde;font-size:13px}
.embed-img{max-width:100%;border-radius:4px;margin-top:8px}
.embed-thumb{max-width:80px;max-height:80px;border-radius:4px;float:right;margin-left:10px}
.embed-footer{color:#8a8d95;font-size:11px;margin-top:8px}
.empty{color:#72767d;text-align:center;padding:40px;font-style:italic}
footer{text-align:center;padding:24px;color:#555;font-size:12px;border-top:1px solid #1a1c20}
</style>
</head>
<body>
<div class="wrap">
<header class="card">
  <h1>${cfg.emoji} ${esc(title)}</h1>
  <div class="sub">Transcript générée automatiquement par LDF BOT</div>
  <div class="meta-grid">
    <div class="mc"><div class="label">Serveur</div><div class="val">${esc(guild.name)}</div></div>
    <div class="mc"><div class="label">Catégorie</div><div class="val">${cfg.emoji} ${esc(cfg.label)}</div></div>
    <div class="mc"><div class="label">Ouvert par</div><div class="val">${esc(ticket.username)}</div></div>
    <div class="mc"><div class="label">Ouvert le</div><div class="val">${esc(openedAt)}</div></div>
    <div class="mc"><div class="label">Fermé le</div><div class="val">${esc(closedAt)}</div></div>
    <div class="mc"><div class="label">Messages</div><div class="val">${messages.length}</div></div>
  </div>
</header>
<section class="messages">
${messagesHtml}
</section>
<footer>
LDF Devs — Ticket System • ${esc(closedAt)}
</footer>
</div>
</body>
</html>`;
}
