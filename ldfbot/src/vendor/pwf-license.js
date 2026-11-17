// PWF Auth SDK v2.1  ·  build 0uybzpq  ·  javascript  ·  app 821c69e7-18a0-4148-a13a-a407ea0baefb  ·  generated 2026-11-17 UTC
// Auto-generated — regenerate from the SDK Generator instead of editing by hand.

// Node.js 18+ (built-in fetch + crypto). NOT for browsers — the app
// secret must never reach client-side JavaScript.
const crypto = require('crypto');
const os = require('os');
const { execSync } = require('child_process');

// AES-256-CBC envelope encryption — mirrors the server's PayloadCrypto.
class CryptoEnvelope {
    constructor(appSecret) {
        this.encKey = crypto.createHash('sha256').update('enc:' + appSecret).digest();
        this.macKey = crypto.createHash('sha256').update('mac:' + appSecret).digest();
        this.maxDrift = 300; // keep in sync with the server
    }

    encrypt(data) {
        const json = JSON.stringify(data);
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv('aes-256-cbc', this.encKey, iv);
        const ct = Buffer.concat([cipher.update(json, 'utf8'), cipher.final()]);
        const p = Buffer.concat([iv, ct]).toString('base64');
        const t = Math.floor(Date.now() / 1000);
        const s = crypto.createHmac('sha256', this.macKey).update(p + t).digest('hex');
        return JSON.stringify({ p, t, s });
    }

    decrypt(envelopeJson) {
        const env = JSON.parse(envelopeJson);
        if (!('p' in env) || !('t' in env) || !('s' in env))
            throw new Error('Invalid envelope format');
        const { p, t, s } = env;

        const expected = crypto.createHmac('sha256', this.macKey).update(p + t).digest('hex');
        if (expected.length !== s.length ||
            !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(s)))
            throw new Error('HMAC verification failed');

        if (Math.abs(Math.floor(Date.now() / 1000) - t) > this.maxDrift)
            throw new Error('Request expired (replay protection) - check the system clock');

        const combined = Buffer.from(p, 'base64');
        const iv = combined.subarray(0, 16);
        const ct = combined.subarray(16);
        const decipher = crypto.createDecipheriv('aes-256-cbc', this.encKey, iv);
        const plain = Buffer.concat([decipher.update(ct), decipher.final()]);
        return JSON.parse(plain.toString('utf8'));
    }
}

class PWFLicense {
    constructor() {
        this.baseUrl = 'https://pwfauth.com';
        // The same license server under a second name, used when the first gives no reply at all
        // (some networks block it: Etisalat in the UAE). Fixed here; the client stays on it once used.
        this.backupUrl = 'https://pwfauth.net';
        this.appSecret = process.env.PWF_APP_SECRET;
        this.crypto = new CryptoEnvelope(this.appSecret);
        this.sessionId = null;
        this.licenseKey = null;
    }

    // Stable per-machine id. Windows goes through CIM — wmic was deprecated and is
    // GONE from Windows 11 24H2, so anything built on it silently degrades.
    getHWID() {
        try {
            if (process.platform === 'win32') {
                const out = execSync(
                    'powershell -NoProfile -Command "(Get-CimInstance Win32_BaseBoard).SerialNumber"',
                    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
                return out.trim() || os.hostname();
            }
            return require('fs').readFileSync('/etc/machine-id', 'utf8').trim() || os.hostname();
        } catch (e) {
            return os.hostname();
        }
    }

    _parseReply(raw, res) {
        if (!raw || !raw.trim())
            throw new Error(`License server returned HTTP ${res.status} with an empty body.`);
        let probe;
        try { probe = JSON.parse(raw); }
        catch (e) {
            throw new Error(`License server returned HTTP ${res.status} with a non-JSON body. Check the API base URL.`);
        }
        if (probe && 'p' in probe && 't' in probe && 's' in probe)
            return this.crypto.decrypt(raw);
        if (!res.ok && !(probe && 'success' in probe))
            throw new Error(`License server returned HTTP ${res.status}.`);
        return probe;
    }

    async _fetch(url, init) {
        try {
            return await fetch(url, init);
        } catch (e) {
            await new Promise((r) => setTimeout(r, 300));
        }
        try {
            return await fetch(url, init);
        } catch (e) {
            if (this.baseUrl === this.backupUrl || !url.startsWith(this.baseUrl)) throw e;
            url = this.backupUrl + url.slice(this.baseUrl.length);
            this.baseUrl = this.backupUrl;
            return fetch(url, init);
        }
    }

    async _post(endpoint, body) {
        const encrypted = this.crypto.encrypt(body);
        const res = await this._fetch(this.baseUrl + endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-App-Secret': this.appSecret,
            },
            body: encrypted,
        });
        return this._parseReply(await res.text(), res);
    }

    async login(licenseKey) {
        const result = await this._post('/api/auth/login.php', {
            license_key: licenseKey,
            hwid: this.getHWID(),
        });
        if (result.success) {
            this.sessionId = result.session_id;
            this.licenseKey = licenseKey;
            this.heartbeatInterval = parseInt(result.heartbeat_interval, 10) || 30;
        }
        return result;
    }

    async checkKey(licenseKey) {
        return this._post('/api/auth/check-key.php', { license_key: licenseKey });
    }

    async heartbeat() {
        if (!this.sessionId) return null;
        return this._post('/api/auth/heartbeat.php', {
            session_id: this.sessionId,
            license_key: this.licenseKey,
        });
    }

    async runHeartbeat(onRevoked) {
        const KILL = new Set(['BANNED', 'PAUSED', 'EXPIRED', 'HWID_RESET', 'MAINTENANCE',
            'SESSION_REVOKED', 'SESSION_EXPIRED', 'SESSION_MISMATCH']);
        const MAX_HEARTBEAT_FAILURES = 3;
        const wait = ms => new Promise(r => setTimeout(r, ms));
        let failures = 0;
        while (this.sessionId) {
            await wait((this.heartbeatInterval || 30) * 1000);
            let r = null;
            try { r = await this.heartbeat(); }
            catch (e) { r = null; }
            if (r === null || r === undefined) {
                if (!this.sessionId) return;
                if (++failures >= MAX_HEARTBEAT_FAILURES) {
                    this.sessionId = null;
                    onRevoked('NETWORK_LOST',
                        'Cannot reach the license server. Please check your connection and sign in again');
                    return;
                }
                continue;
            }
            failures = 0;
            if (r.success) continue;
            if (KILL.has(r.error_code)) {
                this.sessionId = null;
                onRevoked(r.error_code, r.message || '');
                return;
            }
        }
    }

    async _get(endpoint, bearerKey) {
        const headers = { 'X-App-Secret': this.appSecret };
        if (bearerKey) headers['Authorization'] = 'Bearer ' + bearerKey;
        const res = await this._fetch(this.baseUrl + endpoint, { headers });
        return this._parseReply(await res.text(), res);
    }

    async _postPlain(endpoint, body) {
        const res = await this._fetch(this.baseUrl + endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-App-Secret': this.appSecret },
            body: JSON.stringify(body),
        });
        return this._parseReply(await res.text(), res);
    }

    async getAppInfo() { return this._get('/api/app/info.php'); }
    async getTexts() { return this._get('/api/app/text.php', this.licenseKey); }
    async getSlides() { return this._post('/api/app/slides.php', { action: 'get_slides' }); }
    async checkUpdate(currentVersion) {
        return this._post('/api/update/check.php', { v: currentVersion, channel: 'stable', hwid: this.getHWID(), license_key: this.licenseKey });
    }
    async trackSocialClick(linkId) { return this._post('/api/app/social-click.php', { link_id: linkId }); }
    async redeemAddon(addonKey) {
        return this._post('/api/auth/redeem-addon.php', { session_id: this.sessionId, addon_key: addonKey });
    }
    async getAddons() { return this._post('/api/auth/addons.php', { session_id: this.sessionId }); }
    async createTrial() { return this._postPlain('/api/auth/trial.php', { hwid: this.getHWID() }); }
    async requestHwidReset(reason) {
        return this._postPlain('/api/auth/request-hwid-reset.php', { license_key: this.licenseKey, reason: reason });
    }
    async registerAccount(username, password, email) {
        return this._postPlain('/api/auth/account-register.php', { username, password, email });
    }
    async loginAccount(username, password) {
        const result = await this._postPlain('/api/auth/account-login.php', { username, password, hwid: this.getHWID() });
        if (result && result.success) {
            this.sessionId = result.session_id;
            this.licenseKey = result.license_key || null;
        }
        return result;
    }
    async changeAccountPassword(username, currentPassword, newPassword) {
        return this._postPlain('/api/auth/change-password.php', { username, current_password: currentPassword, new_password: newPassword });
    }

    async logout() {
        if (!this.sessionId) return null;
        const result = await this._post('/api/auth/logout.php', {
            session_id: this.sessionId,
            license_key: this.licenseKey,
        });
        this.sessionId = null;
        return result;
    }
}

module.exports = PWFLicense;
