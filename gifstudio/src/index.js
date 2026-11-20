import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { renderGif } from './render.js';
import { sendDm } from './dm.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const {
  DISCORD_TOKEN,
  OWNER_ID,
  PORT = '3100',
} = process.env;

const required = { DISCORD_TOKEN, OWNER_ID };
for (const [k, v] of Object.entries(required)) {
  if (!v) {
    console.error(`[fatal] missing env var: ${k}`);
    process.exit(1);
  }
}

const GIFS_DIR = path.join(__dirname, '..', 'data', 'gifs');
fs.mkdirSync(GIFS_DIR, { recursive: true });

const app = express();
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

app.use(express.static(path.join(__dirname, 'public')));
app.use('/gifs', express.static(GIFS_DIR, { maxAge: '1h' }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

app.post('/api/upload', upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'no file' });
  const dataUrl = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
  res.json({ dataUrl });
});

app.post('/api/render', async (req, res) => {
  try {
    const scene = req.body;
    const id = crypto.randomBytes(8).toString('hex');
    const filepath = path.join(GIFS_DIR, `${id}.gif`);
    await renderGif(scene, filepath);
    const stat = fs.statSync(filepath);
    res.json({ id, url: `/gifs/${id}.gif`, sizeKB: Math.round(stat.size / 1024) });
  } catch (e) {
    console.error('[render] error:', e);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/dm', async (req, res) => {
  try {
    const { id } = req.body || {};
    if (!id || !/^[a-f0-9]{16}$/.test(id)) {
      return res.status(400).json({ error: 'bad id' });
    }
    const filepath = path.join(GIFS_DIR, `${id}.gif`);
    if (!fs.existsSync(filepath)) return res.status(404).json({ error: 'gif not found' });
    await sendDm({
      token: DISCORD_TOKEN,
      userId: OWNER_ID,
      filepath,
      filename: `gifstudio-${id}.gif`,
    });
    res.json({ ok: true });
  } catch (e) {
    console.error('[dm] error:', e);
    res.status(500).json({ error: e.message });
  }
});

// Cleanup gifs older than 24h
setInterval(() => {
  const now = Date.now();
  try {
    for (const f of fs.readdirSync(GIFS_DIR)) {
      const p = path.join(GIFS_DIR, f);
      try {
        const st = fs.statSync(p);
        if (now - st.mtimeMs > 24 * 60 * 60 * 1000) fs.unlinkSync(p);
      } catch {}
    }
  } catch {}
}, 60 * 60 * 1000);

const port = Number(PORT);
app.listen(port, '127.0.0.1', () => {
  console.log(`[gifstudio] listening on http://127.0.0.1:${port}`);
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    console.log(`[gifstudio] ${sig} received, shutting down`);
    process.exit(0);
  });
}
