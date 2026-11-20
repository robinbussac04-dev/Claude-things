import { createCanvas, loadImage } from 'canvas';
import GIFEncoder from 'gif-encoder-2';
import fs from 'node:fs';

export async function renderGif(scene, outPath) {
  const width = clampInt(scene.width, 32, 2000, 400);
  const height = clampInt(scene.height, 32, 2000, 400);
  const frames = clampInt(scene.frames, 1, 60, 20);
  const delay = clampInt(scene.delay, 20, 1000, 60);
  const bgColor = scene.bgColor || '#000000';
  const bgImage = scene.bgImage || null;
  const layers = Array.isArray(scene.layers) ? scene.layers : [];
  const globalEffect = scene.effect || 'none';

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Load bg image once if provided (data URL supported)
  let bgImg = null;
  if (bgImage) {
    try {
      bgImg = await loadImage(bgImage);
    } catch (e) {
      console.warn('[render] bg image failed:', e.message);
    }
  }

  // Preload any layer images
  for (const layer of layers) {
    if (layer.type === 'image' && layer.src) {
      try {
        layer._img = await loadImage(layer.src);
      } catch (e) {
        console.warn('[render] layer image failed:', e.message);
      }
    }
  }

  const totalFrames = globalEffect === 'none' && !hasLayerEffect(layers) ? 1 : frames;

  const encoder = new GIFEncoder(width, height, 'neuquant', true);
  encoder.setDelay(delay);
  encoder.setRepeat(0);
  encoder.setQuality(10);
  encoder.start();

  for (let f = 0; f < totalFrames; f++) {
    const t = totalFrames === 1 ? 0 : f / totalFrames;

    ctx.save();
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, width, height);
    if (bgImg) {
      drawCover(ctx, bgImg, 0, 0, width, height);
    }
    ctx.restore();

    for (const layer of layers) {
      drawLayer(ctx, layer, t, globalEffect, width, height);
    }

    encoder.addFrame(ctx);
  }

  encoder.finish();
  fs.writeFileSync(outPath, encoder.out.getData());
}

function hasLayerEffect(layers) {
  return layers.some((l) => l.effect && l.effect !== 'none');
}

function clampInt(v, min, max, def) {
  const n = Number.parseInt(v, 10);
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, n));
}

function drawCover(ctx, img, dx, dy, dw, dh) {
  const sr = img.width / img.height;
  const dr = dw / dh;
  let sw, sh, sx, sy;
  if (sr > dr) {
    sh = img.height;
    sw = img.height * dr;
    sx = (img.width - sw) / 2;
    sy = 0;
  } else {
    sw = img.width;
    sh = img.width / dr;
    sx = 0;
    sy = (img.height - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
}

function drawLayer(ctx, layer, t, globalEffect, W, H) {
  const effect = layer.effect && layer.effect !== 'inherit' ? layer.effect : globalEffect;

  ctx.save();

  if (layer.type === 'rect') {
    ctx.fillStyle = layer.color || '#ffffff';
    ctx.globalAlpha = clamp01(layer.opacity ?? 1);
    ctx.fillRect(
      Math.round(layer.x ?? 0),
      Math.round(layer.y ?? 0),
      Math.round(layer.w ?? W),
      Math.round(layer.h ?? 40)
    );
  } else if (layer.type === 'image' && layer._img) {
    ctx.globalAlpha = clamp01(layer.opacity ?? 1);
    const w = Math.round(layer.w ?? layer._img.width);
    const h = Math.round(layer.h ?? layer._img.height);
    const x = Math.round(layer.x ?? 0);
    const y = Math.round(layer.y ?? 0);
    ctx.drawImage(layer._img, x, y, w, h);
  } else if (layer.type === 'text') {
    const fontSize = Number(layer.fontSize) || 48;
    const font = layer.font || 'Impact';
    const weight = layer.bold ? 'bold' : 'normal';
    const italic = layer.italic ? 'italic ' : '';
    ctx.font = `${italic}${weight} ${fontSize}px ${font}`;
    ctx.textAlign = layer.align || 'center';
    ctx.textBaseline = layer.baseline || 'middle';

    let x = Number(layer.x) || W / 2;
    let y = Number(layer.y) || H / 2;
    let color = layer.color || '#ffffff';

    applyEffect(ctx, effect, t, { x, y, color, fontSize });
    const eff = computeEffect(effect, t, { x, y, color });
    x = eff.x;
    y = eff.y;
    color = eff.color;

    ctx.globalAlpha = clamp01(layer.opacity ?? 1);

    if (layer.stroke) {
      ctx.strokeStyle = layer.strokeColor || '#000000';
      ctx.lineWidth = Number(layer.strokeWidth) || 4;
      ctx.lineJoin = 'round';
      ctx.strokeText(String(layer.text ?? ''), x, y);
    }
    ctx.fillStyle = color;
    ctx.fillText(String(layer.text ?? ''), x, y);
  }

  ctx.restore();
}

function computeEffect(effect, t, { x, y, color }) {
  let nx = x;
  let ny = y;
  let nc = color;
  if (effect === 'shake') {
    nx += (Math.random() - 0.5) * 10;
    ny += (Math.random() - 0.5) * 10;
  } else if (effect === 'rainbow') {
    const hue = Math.floor(t * 360);
    nc = `hsl(${hue}, 100%, 55%)`;
  } else if (effect === 'glitch') {
    nx += (Math.random() - 0.5) * 8;
  } else if (effect === 'bounce') {
    ny += Math.sin(t * Math.PI * 2) * 12;
  }
  return { x: nx, y: ny, color: nc };
}

function applyEffect(ctx, effect, t, { x, y, fontSize }) {
  if (effect === 'pulse') {
    const scale = 1 + 0.12 * Math.sin(t * Math.PI * 2);
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.translate(-x, -y);
  } else if (effect === 'rotate') {
    const angle = t * Math.PI * 2;
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.translate(-x, -y);
  }
}

function clamp01(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 1;
  return Math.min(1, Math.max(0, n));
}
