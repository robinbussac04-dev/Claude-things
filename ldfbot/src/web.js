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
