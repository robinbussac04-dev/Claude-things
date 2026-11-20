# GIF Studio — Deploy sur VeryCloud VPS

App totalement séparée de `ldfbot` : nouveau sous-domaine, nouveau systemd service, nouveau nginx vhost. Ça tourne sur **port 3100** en interne.

## 1. Sous-domaine DuckDNS

1. va sur https://www.duckdns.org/
2. Clique "add domain" → mets `gifstudio-ldf` (ou autre dispo)
3. **current ip** → mets la même IP que `ldfbot.duckdns.org` (ton VPS)
4. Save

→ `https://gifstudio-ldf.duckdns.org` pointera vers ton VPS.

## 2. Dépendances système (canvas a besoin de libs)

```bash
sudo apt update
sudo apt install -y build-essential libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev
```

## 3. Clone + install

(fais le repo public, puis privé après le clone)

```bash
cd ~
git clone -b claude/ledoigteurfou-companion-mdceqj https://github.com/robinbussac04-dev/Claude-things.git tmp-gif
mv tmp-gif/gifstudio .
rm -rf tmp-gif
cd ~/gifstudio
npm install --omit=dev
```

## 4. .env

Récupère ton token bot + mdp hash :

```bash
cp .env.example .env
# Génère ton hash de mdp (remplace MOTDEPASSE) :
node -e "console.log(require('bcryptjs').hashSync('MOTDEPASSE', 10))"
# Génère un session secret :
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# Édite .env et colle :
nano .env
```

Les valeurs à mettre :
- `DISCORD_TOKEN=` → ton token LDF BOT (le NOUVEAU après reset)
- `OWNER_ID=1145789677601824849` → ton Discord user ID
- `DASHBOARD_PASSWORD_HASH=` → le hash bcrypt généré au-dessus
- `SESSION_SECRET=` → le hex de 64 chars généré
- `PORT=3100`
- `COOKIE_SECURE=1`

## 5. systemd service

```bash
sudo tee /etc/systemd/system/gifstudio.service > /dev/null <<'EOF'
[Unit]
Description=GIF Studio
After=network.target

[Service]
Type=simple
User=ldf
WorkingDirectory=/home/ldf/gifstudio
EnvironmentFile=/home/ldf/gifstudio/.env
ExecStart=/usr/bin/node src/index.js
Restart=on-failure
RestartSec=5
NoNewPrivileges=yes
PrivateTmp=yes
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths=/home/ldf/gifstudio/data
ProtectKernelTunables=yes
ProtectKernelModules=yes
ProtectControlGroups=yes

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now gifstudio
sudo systemctl status gifstudio --no-pager
```

> ⚠️ Remplace `ldf` par ton user Linux si différent (vérifie avec `whoami`).

## 6. nginx vhost + HTTPS

```bash
sudo tee /etc/nginx/sites-available/gifstudio > /dev/null <<'EOF'
server {
    listen 80;
    server_name gifstudio-ldf.duckdns.org;

    client_max_body_size 25M;

    location / {
        proxy_pass http://127.0.0.1:3100;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
    }
}
EOF

sudo ln -s /etc/nginx/sites-available/gifstudio /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d gifstudio-ldf.duckdns.org --redirect --non-interactive --agree-tos -m ton-email@exemple.com
```

## 7. Test

- Ouvre `https://gifstudio-ldf.duckdns.org` depuis ton tel
- Login avec ton mdp
- Crée un meme, génère, clique "📨 Envoyer en DM"
- Check Discord → le bot t'envoie le .gif en MP

## Mise à jour future

```bash
cd ~
cp ~/gifstudio/.env /tmp/.env.gif.backup
rm -rf ~/gifstudio
git clone -b claude/ledoigteurfou-companion-mdceqj https://github.com/robinbussac04-dev/Claude-things.git tmp-gif
mv tmp-gif/gifstudio .
rm -rf tmp-gif
cp /tmp/.env.gif.backup ~/gifstudio/.env && rm /tmp/.env.gif.backup
cd ~/gifstudio && npm install --omit=dev
sudo systemctl restart gifstudio
```
