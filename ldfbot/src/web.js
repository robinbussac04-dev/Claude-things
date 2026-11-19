import express from 'express';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { listTextChannels, sendToChannel, sendDM, isReady } from './bot.js';
import {
  createGiveaway,
  listPublic as listGiveaways,
  getPublic as getGiveaway,
  endGiveaway,
  rerollWinner,
  cancelGiveaway,
  previewInDM as previewGiveawayInDM,
} from './giveaways.js';
import {
  listTemplates,
  getTemplate,
  saveTemplate,
  deleteTemplate,
} from './templates.js';
import {
  listPublic as listScheduled,
  createJob as createScheduled,
  updateJob as updateScheduled,
  deleteJob as deleteScheduled,
} from './scheduler.js';
import { getConfig as getWelcomeConfig, setConfig as setWelcomeConfig } from './welcome.js';
import { listEvents as listMemberEvents, counts as memberCounts, liveMemberCount } from './memberlog.js';
import {
  exchangeCode,
  recordUser,
  listPublic as listVerified,
  count as verifiedCount,
  remove as removeVerified,
  pullAll as pullAllVerified,
  pullOne as pullOneVerified,
  getMe as getDiscordMe,
  newState as newVerifyState,
  consumeState as consumeVerifyState,
} from './verify.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const COOKIE_NAME = 'ldf_session';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

function sign(value, secret) {
  const hmac = crypto.createHmac('sha256', secret).update(value).digest('base64url');
  return `${value}.${hmac}`;
}
function verify(signed, secret) {
  if (!signed) return null;
  const idx = signed.lastIndexOf('.');
  if (idx < 0) return null;
  const value = signed.slice(0, idx);
  const sig = signed.slice(idx + 1);
  const expected = crypto.createHmac('sha256', secret).update(value).digest('base64url');
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    if (parsed.exp && parsed.exp < Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function createWebApp({
  passwordHash,
  sessionSecret,
  guildId,
  ownerId,
  cookieSecure,
  discordClientId,
  discordClientSecret,
  discordToken,
  publicUrl,
  verifyRoleId,
}) {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  app.use(express.static(path.join(__dirname, 'public'), { index: false }));

  const requireAuth = (req, res, next) => {
    const session = verify(req.cookies[COOKIE_NAME], sessionSecret);
    if (!session) return res.status(401).json({ error: 'auth required' });
    req.session = session;
    next();
  };

  app.get('/', (_req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });

  /* =============== Public OAuth2 verify flow (no auth) =============== */
  const redirectUri = publicUrl ? `${publicUrl.replace(/\/+$/, '')}/verify/callback` : null;

  app.get('/verify', (_req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'verify.html'));
  });

  app.get('/verify/start', (_req, res) => {
    if (!discordClientId || !redirectUri) {
      return res.status(503).send('Verify not configured.');
    }
    const state = newVerifyState();
    const params = new URLSearchParams({
      client_id: discordClientId,
      response_type: 'code',
      scope: 'identify guilds.join',
      redirect_uri: redirectUri,
      state,
      prompt: 'consent',
    });
    res.redirect(`https://discord.com/api/oauth2/authorize?${params}`);
  });

  app.get('/verify/callback', async (req, res) => {
    const { code, state, error } = req.query;
    if (error) {
      return res.redirect('/verify?err=' + encodeURIComponent(String(error)));
    }
    if (!code || !state || !consumeVerifyState(String(state))) {
      return res.redirect('/verify?err=invalid_state');
    }
    if (!discordClientId || !discordClientSecret || !redirectUri) {
      return res.redirect('/verify?err=not_configured');
    }
    try {
      const tokens = await exchangeCode({
        code: String(code),
        clientId: discordClientId,
        clientSecret: discordClientSecret,
        redirectUri,
      });
      const user = await getDiscordMe(tokens.access_token);
      recordUser({ user, tokens });
      // Also add them to the current guild straight away (gives them the role if set)
      if (guildId) {
        try {
          const roles = verifyRoleId ? [verifyRoleId] : [];
          await pullOneVerified({
            userId: user.id,
            guildId,
            botToken: discordToken,
            clientId: discordClientId,
            clientSecret: discordClientSecret,
            roleIds: roles,
          });
        } catch (e) {
          console.warn('[verify] auto-join failed (probably already in guild):', e.message);
        }
      }
      res.redirect('/verify/ok?u=' + encodeURIComponent(user.username ?? ''));
    } catch (e) {
      console.error('[verify] callback error:', e);
      res.redirect('/verify?err=' + encodeURIComponent(e.message.slice(0, 80)));
    }
  });

  app.get('/verify/ok', (_req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'verified.html'));
  });

  /* =============== Admin verify endpoints =============== */
  app.get('/api/verify', requireAuth, (_req, res) => {
    res.json({
      configured: !!(discordClientId && discordClientSecret && redirectUri),
      redirectUri,
      count: verifiedCount(),
      verifyUrl: publicUrl ? `${publicUrl.replace(/\/+$/, '')}/verify` : null,
      users: listVerified(),
    });
  });

  app.delete('/api/verify/:userId', requireAuth, (req, res) => {
    const ok = removeVerified(req.params.userId);
    if (!ok) return res.status(404).json({ error: 'not found' });
    res.json({ ok: true });
  });

  app.post('/api/verify/pull', requireAuth, async (req, res) => {
    if (!discordClientId || !discordClientSecret) {
      return res.status(503).json({ error: 'verify not configured' });
    }
    const targetGuildId = (req.body?.guildId ?? guildId ?? '').toString().trim();
    const roleIds = Array.isArray(req.body?.roleIds) ? req.body.roleIds.map(String).filter(Boolean) : [];
    if (!targetGuildId) return res.status(400).json({ error: 'guildId requis' });
    try {
      const results = await pullAllVerified({
        guildId: targetGuildId,
        botToken: discordToken,
        clientId: discordClientId,
        clientSecret: discordClientSecret,
        roleIds,
      });
      res.json({ results });
    } catch (e) {
      res.status(500).json({ error: String(e.message ?? e) });
    }
  });

  app.get('/api/status', (req, res) => {
    const session = verify(req.cookies[COOKIE_NAME], sessionSecret);
    res.json({ auth: !!session, botReady: isReady() });
  });

  app.post('/api/login', async (req, res) => {
    const { password } = req.body ?? {};
    if (typeof password !== 'string' || !password) {
      return res.status(400).json({ error: 'password requis' });
    }
    const ok = await bcrypt.compare(password, passwordHash);
    if (!ok) {
      await new Promise((r) => setTimeout(r, 600));
      return res.status(401).json({ error: 'mauvais mot de passe' });
    }
    const payload = { iat: Date.now(), exp: Date.now() + SESSION_TTL_MS };
    const token = sign(Buffer.from(JSON.stringify(payload)).toString('base64url'), sessionSecret);
    res.cookie(COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: cookieSecure,
      maxAge: SESSION_TTL_MS,
      path: '/',
    });
    res.json({ ok: true });
  });

  app.post('/api/logout', (_req, res) => {
    res.clearCookie(COOKIE_NAME, { path: '/' });
    res.json({ ok: true });
  });

  app.get('/api/channels', requireAuth, async (_req, res) => {
    if (!isReady()) return res.status(503).json({ error: 'bot pas pret' });
    try {
      const channels = await listTextChannels(guildId);
      res.json({ channels });
    } catch (e) {
      console.error('[web] channels error:', e);
      res.status(500).json({ error: String(e.message ?? e) });
    }
  });

  app.get('/api/templates', requireAuth, (_req, res) => {
    res.json({ templates: listTemplates() });
  });

  app.post('/api/templates', requireAuth, (req, res) => {
    const { id, name, fields } = req.body ?? {};
    if (!name || !String(name).trim()) return res.status(400).json({ error: 'nom requis' });
    try {
      const t = saveTemplate({ id, name, fields });
      res.json({ template: t });
    } catch (e) {
      res.status(400).json({ error: String(e.message ?? e) });
    }
  });

  app.delete('/api/templates/:id', requireAuth, (req, res) => {
    const ok = deleteTemplate(req.params.id);
    if (!ok) return res.status(404).json({ error: 'not found' });
    res.json({ ok: true });
  });

  app.get('/api/giveaways', requireAuth, (_req, res) => {
    res.json({ giveaways: listGiveaways() });
  });

  app.post('/api/giveaways', requireAuth, async (req, res) => {
    if (!isReady()) return res.status(503).json({ error: 'bot pas pret' });
    const { title, productName, keys, winnersCount, durationHours, channelId } = req.body ?? {};
    try {
      const g = await createGiveaway({
        title,
        productName,
        keys: Array.isArray(keys) ? keys : String(keys ?? '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean),
        winnersCount: Number(winnersCount),
        durationHours: Number(durationHours),
        channelId,
        createdBy: ownerId,
      });
      res.json({ giveaway: g });
    } catch (e) {
      console.error('[web] giveaway create error:', e);
      res.status(400).json({ error: String(e.message ?? e) });
    }
  });

  app.post('/api/giveaways/preview-dm', requireAuth, async (req, res) => {
    if (!isReady()) return res.status(503).json({ error: 'bot pas pret' });
    const { title, productName, winnersCount, durationHours } = req.body ?? {};
    try {
      await previewGiveawayInDM(ownerId, { title, productName, winnersCount, durationHours });
      res.json({ ok: true });
    } catch (e) {
      console.error('[web] giveaway preview error:', e);
      res.status(500).json({ error: String(e.message ?? e) });
    }
  });

  app.post('/api/giveaways/:id/end', requireAuth, async (req, res) => {
    try {
      const g = await endGiveaway(req.params.id, { force: true });
      res.json({ giveaway: g });
    } catch (e) {
      res.status(400).json({ error: String(e.message ?? e) });
    }
  });

  app.post('/api/giveaways/:id/reroll', requireAuth, async (req, res) => {
    const winnerIndex = Number(req.body?.winnerIndex ?? 0);
    try {
      const g = await rerollWinner(req.params.id, winnerIndex);
      res.json({ giveaway: g });
    } catch (e) {
      res.status(400).json({ error: String(e.message ?? e) });
    }
  });

  app.post('/api/giveaways/:id/cancel', requireAuth, async (req, res) => {
    try {
      const g = await cancelGiveaway(req.params.id);
      res.json({ giveaway: g });
    } catch (e) {
      res.status(400).json({ error: String(e.message ?? e) });
    }
  });

  /* ---------- Scheduled daily announcements ---------- */
  app.get('/api/scheduled', requireAuth, (_req, res) => {
    res.json({ jobs: listScheduled() });
  });

  app.post('/api/scheduled', requireAuth, (req, res) => {
    const { name, hour, minute, channelId, payload } = req.body ?? {};
    try {
      const j = createScheduled({
        name,
        hour: Number(hour),
        minute: Number(minute),
        channelId,
        payload,
      });
      res.json({ job: j });
    } catch (e) {
      res.status(400).json({ error: String(e.message ?? e) });
    }
  });

  app.patch('/api/scheduled/:id', requireAuth, (req, res) => {
    try {
      const patch = req.body ?? {};
      if (patch.hour !== undefined) patch.hour = Number(patch.hour);
      if (patch.minute !== undefined) patch.minute = Number(patch.minute);
      const j = updateScheduled(req.params.id, patch);
      res.json({ job: j });
    } catch (e) {
      res.status(400).json({ error: String(e.message ?? e) });
    }
  });

  app.delete('/api/scheduled/:id', requireAuth, (req, res) => {
    const ok = deleteScheduled(req.params.id);
    if (!ok) return res.status(404).json({ error: 'not found' });
    res.json({ ok: true });
  });

  /* ---------- Welcome DM ---------- */
  app.get('/api/welcome', requireAuth, (_req, res) => {
    res.json(getWelcomeConfig());
  });

  app.post('/api/welcome', requireAuth, (req, res) => {
    const { enabled, config } = req.body ?? {};
    try {
      const out = setWelcomeConfig({ enabled, config });
      res.json(out);
    } catch (e) {
      res.status(400).json({ error: String(e.message ?? e) });
    }
  });

  /* ---------- Members log + live counter ---------- */
  app.get('/api/members', requireAuth, async (req, res) => {
    const limit = Math.min(500, Number(req.query.limit) || 100);
    const events = listMemberEvents({ limit });
    const live = await liveMemberCount(guildId);
    res.json({ events, counts: memberCounts(), live });
  });

  app.post('/api/send', requireAuth, async (req, res) => {
    if (!isReady()) return res.status(503).json({ error: 'bot pas pret' });
    const { mode, channelId, content, embed, pingEveryone, buttons } = req.body ?? {};

    const payload = { allowedMentions: { parse: pingEveryone ? ['everyone'] : [] } };
    if (content) payload.content = pingEveryone ? `@everyone\n${content}` : content;
    else if (pingEveryone) payload.content = '@everyone';
    if (embed) payload.embeds = [embed];

    if (Array.isArray(buttons) && buttons.length > 0) {
      const row = new ActionRowBuilder();
      for (const b of buttons.slice(0, 5)) {
        const label = String(b.label ?? '').trim();
        const url = String(b.url ?? '').trim();
        if (!label || !/^https?:\/\//.test(url)) continue;
        const btn = new ButtonBuilder()
          .setLabel(label.slice(0, 80))
          .setStyle(ButtonStyle.Link)
          .setURL(url);
        const emoji = String(b.emoji ?? '').trim();
        if (emoji) {
          try { btn.setEmoji(emoji); } catch {}
        }
        row.addComponents(btn);
      }
      if (row.components.length > 0) payload.components = [row];
    }

    if (!payload.content && !payload.embeds) {
      return res.status(400).json({ error: 'rien a envoyer' });
    }

    try {
      let msg;
      if (mode === 'dm') {
        msg = await sendDM(ownerId, payload);
      } else if (mode === 'channel' && channelId) {
        msg = await sendToChannel(channelId, payload);
      } else {
        return res.status(400).json({ error: 'mode invalide' });
      }
      res.json({ ok: true, messageId: msg.id, channelId: msg.channelId });
    } catch (e) {
      console.error('[web] send error:', e);
      res.status(500).json({ error: String(e.message ?? e) });
    }
  });

  return app;
}
