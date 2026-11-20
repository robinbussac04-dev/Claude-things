import crypto from 'node:crypto';

function createRequire(pkg) {
  // tiny helper to lazy-import bcryptjs (CJS module)
  return import(pkg);
}

const COOKIE_NAME = 'gifstudio_session';

export function createAuth({ passwordHash, sessionSecret, cookieSecure }) {
  function sign(value) {
    const h = crypto.createHmac('sha256', sessionSecret).update(value).digest('base64url');
    return `${value}.${h}`;
  }
  function verify(signed) {
    if (!signed) return null;
    const i = signed.lastIndexOf('.');
    if (i < 0) return null;
    const value = signed.slice(0, i);
    const expected = sign(value);
    if (
      expected.length !== signed.length ||
      !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signed))
    )
      return null;
    try {
      const data = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
      if (data.exp && data.exp < Date.now()) return null;
      return data;
    } catch {
      return null;
    }
  }
  function makeToken() {
    const payload = Buffer.from(
      JSON.stringify({ ok: true, exp: Date.now() + 7 * 24 * 60 * 60 * 1000 })
    ).toString('base64url');
    return sign(payload);
  }

  function parseCookies(req) {
    const h = req.headers.cookie || '';
    const out = {};
    for (const part of h.split(';')) {
      const [k, ...v] = part.trim().split('=');
      if (!k) continue;
      out[k] = decodeURIComponent(v.join('='));
    }
    return out;
  }

  return {
    requireAuth(req, res, next) {
      const c = parseCookies(req);
      const data = verify(c[COOKIE_NAME]);
      if (!data) {
        if (req.accepts('html') && !req.path.startsWith('/api/')) {
          return res.redirect('/login');
        }
        return res.status(401).json({ error: 'auth required' });
      }
      next();
    },
    loginPage() {
      return `<!doctype html><html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>GIF Studio — Login</title>
<style>
*{box-sizing:border-box}
body{margin:0;background:#0b0b0e;color:#fff;font-family:-apple-system,system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh}
.card{background:#15151b;padding:32px;border-radius:16px;width:92%;max-width:360px;border:1px solid #2a2a33}
h1{margin:0 0 20px;font-size:22px}
input{width:100%;padding:14px;background:#0b0b0e;border:1px solid #2a2a33;color:#fff;border-radius:10px;font-size:16px;margin-bottom:12px}
button{width:100%;padding:14px;background:#d9304a;color:#fff;border:0;border-radius:10px;font-size:16px;font-weight:600}
.err{color:#ff6b6b;font-size:14px;margin-bottom:10px;min-height:18px}
</style></head><body>
<form class="card" method="post" action="/login">
<h1>🎞️ GIF Studio</h1>
<div class="err" id="err"></div>
<input type="password" name="password" placeholder="Mot de passe" autofocus>
<button type="submit">Entrer</button>
</form>
<script>
const p=new URLSearchParams(location.search);
if(p.get('err'))document.getElementById('err').textContent='Mot de passe incorrect';
</script>
</body></html>`;
    },
    async loginHandler(req, res) {
      const body = req.body || {};
      const pw = body.password || '';
      const bcrypt = (await createRequire('bcryptjs')).default;
      const ok = bcrypt.compareSync(pw, passwordHash);
      if (!ok) return res.redirect('/login?err=1');
      const token = makeToken();
      res.setHeader(
        'Set-Cookie',
        `${COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${7 * 24 * 60 * 60}${cookieSecure ? '; Secure' : ''}`
      );
      res.redirect('/');
    },
    logoutHandler(req, res) {
      res.setHeader(
        'Set-Cookie',
        `${COOKIE_NAME}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${cookieSecure ? '; Secure' : ''}`
      );
      res.redirect('/login');
    },
  };
}
