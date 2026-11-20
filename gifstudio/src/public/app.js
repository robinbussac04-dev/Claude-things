// GIF Studio editor
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const state = {
  width: 400,
  height: 400,
  bgColor: '#000000',
  bgImage: null, // data URL
  layers: [],    // { id, type, ... }
  effect: 'none',
  frames: 20,
  delay: 60,
  selectedId: null,
};

let bgImgEl = null;
const layerImgCache = new Map();

// ---------- Tabs ----------
$$('.tab').forEach((t) => {
  t.addEventListener('click', () => {
    $$('.tab').forEach((x) => x.classList.toggle('active', x === t));
    const name = t.dataset.tab;
    $$('.tab-panel').forEach((p) => p.classList.toggle('active', p.dataset.panel === name));
  });
});

// ---------- Canvas size ----------
$('#preset').addEventListener('change', (e) => {
  const v = e.target.value;
  if (v === 'custom') {
    $('#customSize').hidden = false;
    return;
  }
  $('#customSize').hidden = true;
  const [w, h] = v.split('x').map(Number);
  state.width = w;
  state.height = h;
  $('#width').value = w;
  $('#height').value = h;
  resizeCanvas();
});
['width', 'height'].forEach((id) => {
  $('#' + id).addEventListener('input', () => {
    state.width = Number($('#width').value) || 400;
    state.height = Number($('#height').value) || 400;
    resizeCanvas();
  });
});
$('#bgColor').addEventListener('input', (e) => {
  state.bgColor = e.target.value;
  draw();
});
$('#bgImage').addEventListener('change', async (e) => {
  const f = e.target.files?.[0];
  if (!f) return;
  const dataUrl = await readFileAsDataURL(f);
  state.bgImage = dataUrl;
  bgImgEl = await loadImg(dataUrl);
  draw();
});
$('#clearBg').addEventListener('click', () => {
  state.bgImage = null;
  bgImgEl = null;
  $('#bgImage').value = '';
  draw();
});

// ---------- Layers ----------
$$('.add').forEach((b) => {
  b.addEventListener('click', () => addLayer(b.dataset.add));
});

function addLayer(kind) {
  const id = randomId();
  let layer;
  if (kind === 'text') {
    layer = {
      id, type: 'text',
      text: 'TON TEXTE',
      x: state.width / 2,
      y: state.height / 2,
      fontSize: Math.round(state.width / 10),
      font: 'Impact',
      color: '#ffffff',
      bold: false,
      italic: false,
      align: 'center',
      stroke: true,
      strokeColor: '#000000',
      strokeWidth: Math.max(2, Math.round(state.width / 120)),
      opacity: 1,
    };
  } else if (kind === 'topBand') {
    const h = Math.max(40, Math.round(state.height * 0.18));
    layer = { id, type: 'rect', x: 0, y: 0, w: state.width, h, color: '#ffffff', opacity: 1 };
  } else if (kind === 'bottomBand') {
    const h = Math.max(40, Math.round(state.height * 0.18));
    layer = { id, type: 'rect', x: 0, y: state.height - h, w: state.width, h, color: '#ffffff', opacity: 1 };
  } else if (kind === 'rect') {
    const w = Math.round(state.width * 0.5);
    const h = Math.round(state.height * 0.2);
    layer = {
      id, type: 'rect',
      x: Math.round((state.width - w) / 2),
      y: Math.round((state.height - h) / 2),
      w, h, color: '#ff3a52', opacity: 1,
    };
  } else if (kind === 'image') {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return;
      const dataUrl = await readFileAsDataURL(f);
      const img = await loadImg(dataUrl);
      const maxW = state.width * 0.7;
      const ratio = img.width / img.height;
      const w = Math.min(img.width, maxW);
      const h = w / ratio;
      const imgLayer = {
        id: randomId(), type: 'image',
        src: dataUrl,
        x: Math.round((state.width - w) / 2),
        y: Math.round((state.height - h) / 2),
        w: Math.round(w), h: Math.round(h),
        opacity: 1,
      };
      layerImgCache.set(imgLayer.id, img);
      state.layers.push(imgLayer);
      state.selectedId = imgLayer.id;
      renderLayers();
      draw();
    };
    input.click();
    return;
  }
  state.layers.push(layer);
  state.selectedId = id;
  renderLayers();
  draw();
}

function renderLayers() {
  const list = $('#layerList');
  if (state.layers.length === 0) {
    list.innerHTML = '<div class="empty">Aucun calque — ajoute du texte ou un bandeau 👆</div>';
    $('#layerEditor').hidden = true;
    return;
  }
  list.innerHTML = '';
  // top-down: last layer drawn last = visually on top → show first
  [...state.layers].reverse().forEach((l) => {
    const tpl = $('#tmpl-layer-row').content.cloneNode(true);
    const row = tpl.querySelector('.layer-row');
    row.dataset.id = l.id;
    if (l.id === state.selectedId) row.classList.add('active');
    row.querySelector('.layer-name').textContent = labelFor(l);
    row.querySelector('.edit').addEventListener('click', () => {
      state.selectedId = l.id;
      renderLayers();
    });
    row.querySelector('.del').addEventListener('click', () => {
      state.layers = state.layers.filter((x) => x.id !== l.id);
      if (state.selectedId === l.id) state.selectedId = null;
      renderLayers();
      draw();
    });
    const [up, down] = row.querySelectorAll('.handle');
    up.addEventListener('click', () => moveLayer(l.id, +1));
    down.addEventListener('click', () => moveLayer(l.id, -1));
    list.appendChild(row);
  });
  renderLayerEditor();
}

function labelFor(l) {
  if (l.type === 'text') return `Texte: "${(l.text || '').slice(0, 20)}"`;
  if (l.type === 'rect') return `Rect ${l.w}×${l.h} (${l.color})`;
  if (l.type === 'image') return `Image ${l.w}×${l.h}`;
  return l.type;
}

function moveLayer(id, dir) {
  const i = state.layers.findIndex((x) => x.id === id);
  if (i < 0) return;
  const j = i + dir;
  if (j < 0 || j >= state.layers.length) return;
  const arr = state.layers;
  [arr[i], arr[j]] = [arr[j], arr[i]];
  renderLayers();
  draw();
}

function renderLayerEditor() {
  const ed = $('#layerEditor');
  const l = state.layers.find((x) => x.id === state.selectedId);
  if (!l) {
    ed.hidden = true;
    return;
  }
  ed.hidden = false;

  let html = `<h3>${labelFor(l)}</h3>`;

  if (l.type === 'text') {
    html += field('Texte', `<textarea data-k="text" rows="2">${esc(l.text)}</textarea>`);
    html += two(
      field('X', `<input type="number" data-k="x" value="${l.x}">`),
      field('Y', `<input type="number" data-k="y" value="${l.y}">`)
    );
    html += field('Taille', `<input type="number" data-k="fontSize" min="8" max="400" value="${l.fontSize}">`);
    html += field(
      'Police',
      `<select data-k="font">${fontOptions(l.font)}</select>`
    );
    html += field('Alignement',
      `<select data-k="align"><option ${sel(l.align, 'left')}>left</option><option ${sel(l.align, 'center')}>center</option><option ${sel(l.align, 'right')}>right</option></select>`);
    html += two(
      field('Couleur', `<input type="color" data-k="color" value="${l.color}">`),
      field('Opacité', `<input type="range" data-k="opacity" min="0" max="1" step="0.05" value="${l.opacity}">`)
    );
    html += two(
      `<label><input type="checkbox" data-k="bold" ${l.bold ? 'checked' : ''}> Gras</label>`,
      `<label><input type="checkbox" data-k="italic" ${l.italic ? 'checked' : ''}> Italique</label>`
    );
    html += `<label><input type="checkbox" data-k="stroke" ${l.stroke ? 'checked' : ''}> Contour</label>`;
    html += two(
      field('Couleur contour', `<input type="color" data-k="strokeColor" value="${l.strokeColor}">`),
      field('Épaisseur', `<input type="number" data-k="strokeWidth" min="0" max="30" value="${l.strokeWidth}">`)
    );
  } else if (l.type === 'rect') {
    html += two(
      field('X', `<input type="number" data-k="x" value="${l.x}">`),
      field('Y', `<input type="number" data-k="y" value="${l.y}">`)
    );
    html += two(
      field('Largeur', `<input type="number" data-k="w" value="${l.w}">`),
      field('Hauteur', `<input type="number" data-k="h" value="${l.h}">`)
    );
    html += two(
      field('Couleur', `<input type="color" data-k="color" value="${l.color}">`),
      field('Opacité', `<input type="range" data-k="opacity" min="0" max="1" step="0.05" value="${l.opacity}">`)
    );
  } else if (l.type === 'image') {
    html += two(
      field('X', `<input type="number" data-k="x" value="${l.x}">`),
      field('Y', `<input type="number" data-k="y" value="${l.y}">`)
    );
    html += two(
      field('Largeur', `<input type="number" data-k="w" value="${l.w}">`),
      field('Hauteur', `<input type="number" data-k="h" value="${l.h}">`)
    );
    html += field('Opacité', `<input type="range" data-k="opacity" min="0" max="1" step="0.05" value="${l.opacity}">`);
  }

  ed.innerHTML = html;

  ed.querySelectorAll('[data-k]').forEach((input) => {
    const k = input.dataset.k;
    const handler = (e) => {
      let v;
      if (input.type === 'checkbox') v = input.checked;
      else if (input.type === 'number' || input.type === 'range') v = Number(input.value);
      else v = input.value;
      l[k] = v;
      // refresh layer label if text changed
      const row = document.querySelector(`.layer-row[data-id="${l.id}"] .layer-name`);
      if (row) row.textContent = labelFor(l);
      draw();
    };
    input.addEventListener('input', handler);
    input.addEventListener('change', handler);
  });
}

function field(label, control) {
  return `<label class="field"><span>${label}</span>${control}</label>`;
}
function two(a, b) {
  return `<div class="two">${a}${b}</div>`;
}
function sel(cur, v) { return cur === v ? 'selected' : ''; }
function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
function fontOptions(cur) {
  const fonts = ['Impact', 'Arial', 'Helvetica', 'Georgia', 'Times', 'Courier New', 'Comic Sans MS', 'Verdana', 'Trebuchet MS'];
  return fonts.map((f) => `<option ${sel(cur, f)}>${f}</option>`).join('');
}

// ---------- Effect ----------
$('#effect').addEventListener('change', (e) => { state.effect = e.target.value; draw(); });
$('#frames').addEventListener('input', (e) => { state.frames = Number(e.target.value) || 20; });
$('#delay').addEventListener('input', (e) => { state.delay = Number(e.target.value) || 60; });

// ---------- Canvas ----------
const canvas = $('#stage');
const ctx = canvas.getContext('2d');

function resizeCanvas() {
  canvas.width = state.width;
  canvas.height = state.height;
  $('#sizeInfo').textContent = `${state.width}×${state.height}`;
  draw();
}

let previewFrame = 0;
let previewTimer = null;
function startPreview() {
  if (previewTimer) clearInterval(previewTimer);
  previewFrame = 0;
  if (state.effect === 'none') { draw(); return; }
  previewTimer = setInterval(() => {
    previewFrame = (previewFrame + 1) % state.frames;
    draw();
  }, state.delay);
}

function draw() {
  const t = state.effect === 'none' ? 0 : previewFrame / state.frames;
  ctx.clearRect(0, 0, state.width, state.height);
  ctx.fillStyle = state.bgColor;
  ctx.fillRect(0, 0, state.width, state.height);
  if (bgImgEl) drawCover(ctx, bgImgEl, 0, 0, state.width, state.height);

  for (const layer of state.layers) {
    drawLayer(ctx, layer, t, state.effect);
  }
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

function drawLayer(ctx, l, t, globalEffect) {
  const effect = l.effect && l.effect !== 'inherit' ? l.effect : globalEffect;
  ctx.save();
  if (l.type === 'rect') {
    ctx.globalAlpha = l.opacity ?? 1;
    ctx.fillStyle = l.color;
    ctx.fillRect(l.x, l.y, l.w, l.h);
  } else if (l.type === 'image') {
    const img = layerImgCache.get(l.id);
    if (img) {
      ctx.globalAlpha = l.opacity ?? 1;
      ctx.drawImage(img, l.x, l.y, l.w, l.h);
    }
  } else if (l.type === 'text') {
    ctx.font = `${l.italic ? 'italic ' : ''}${l.bold ? 'bold ' : ''}${l.fontSize}px ${l.font}`;
    ctx.textAlign = l.align;
    ctx.textBaseline = 'middle';
    ctx.globalAlpha = l.opacity ?? 1;

    let x = l.x, y = l.y, color = l.color;
    if (effect === 'pulse') {
      const s = 1 + 0.12 * Math.sin(t * Math.PI * 2);
      ctx.translate(x, y); ctx.scale(s, s); ctx.translate(-x, -y);
    } else if (effect === 'rotate') {
      ctx.translate(x, y); ctx.rotate(t * Math.PI * 2); ctx.translate(-x, -y);
    } else if (effect === 'shake') {
      x += (Math.random() - 0.5) * 10;
      y += (Math.random() - 0.5) * 10;
    } else if (effect === 'rainbow') {
      color = `hsl(${Math.floor(t * 360)},100%,55%)`;
    } else if (effect === 'glitch') {
      x += (Math.random() - 0.5) * 8;
    } else if (effect === 'bounce') {
      y += Math.sin(t * Math.PI * 2) * 12;
    }

    if (l.stroke) {
      ctx.strokeStyle = l.strokeColor;
      ctx.lineWidth = l.strokeWidth;
      ctx.lineJoin = 'round';
      ctx.strokeText(l.text, x, y);
    }
    ctx.fillStyle = color;
    ctx.fillText(l.text, x, y);
  }
  ctx.restore();
}

// ---------- Generate & DM ----------
$('#generate').addEventListener('click', generate);
$('#sendDm').addEventListener('click', sendToDm);

let lastGifId = null;

async function generate() {
  const status = $('#status');
  status.hidden = false;
  status.className = 'status loading';
  status.textContent = 'Génération en cours…';
  $('#result').hidden = true;

  const payload = {
    width: state.width,
    height: state.height,
    bgColor: state.bgColor,
    bgImage: state.bgImage,
    layers: state.layers.map(stripImgCache),
    effect: state.effect,
    frames: state.frames,
    delay: state.delay,
  };

  try {
    const res = await fetch('/api/render', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error((await res.json()).error || res.statusText);
    const data = await res.json();
    lastGifId = data.id;
    status.className = 'status ok';
    status.textContent = `GIF prêt (${data.sizeKB} KB)`;
    $('#resultImg').src = data.url + '?t=' + Date.now();
    $('#resultSize').textContent = `${state.width}×${state.height} · ${data.sizeKB} KB · ${state.effect === 'none' ? 'statique' : state.frames + ' frames'}`;
    $('#downloadLink').href = data.url;
    $('#result').hidden = false;
    $('#dmStatus').hidden = true;
  } catch (e) {
    status.className = 'status err';
    status.textContent = 'Erreur : ' + e.message;
  }
}

async function sendToDm() {
  if (!lastGifId) return;
  const s = $('#dmStatus');
  s.hidden = false;
  s.className = 'status loading';
  s.textContent = 'Envoi en DM…';
  try {
    const res = await fetch('/api/dm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: lastGifId }),
    });
    if (!res.ok) throw new Error((await res.json()).error || res.statusText);
    s.className = 'status ok';
    s.textContent = '✅ Envoyé en DM ! Check Discord.';
  } catch (e) {
    s.className = 'status err';
    s.textContent = 'Erreur DM : ' + e.message;
  }
}

function stripImgCache(l) {
  const copy = { ...l };
  delete copy._img;
  return copy;
}

// ---------- Utils ----------
function randomId() { return Math.random().toString(36).slice(2, 10); }
function readFileAsDataURL(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}
function loadImg(src) {
  return new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = src;
  });
}

// ---------- Init ----------
resizeCanvas();
renderLayers();
// Loop preview when any effect selected
setInterval(() => {
  if (state.effect !== 'none') {
    previewFrame = (previewFrame + 1) % state.frames;
    draw();
  }
}, 80);
