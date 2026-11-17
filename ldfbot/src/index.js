import 'dotenv/config';
import { startBot } from './bot.js';
import { createWebApp } from './web.js';
import { initPWF } from './pwf.js';
import { restoreTimers } from './giveaways.js';

const {
  DISCORD_TOKEN,
  GUILD_ID,
  OWNER_ID,
  PORT = '3000',
  DASHBOARD_PASSWORD_HASH,
  SESSION_SECRET,
  COOKIE_SECURE = '0',
  CUSTOMER_ROLE_ID,
  REDEEM_LOG_CHANNEL_ID,
  GIVEAWAY_LOG_CHANNEL_ID,
} = process.env;

const required = { DISCORD_TOKEN, GUILD_ID, OWNER_ID, DASHBOARD_PASSWORD_HASH, SESSION_SECRET };
for (const [k, v] of Object.entries(required)) {
  if (!v) {
    console.error(`[fatal] missing env var: ${k}`);
    process.exit(1);
  }
}

const app = createWebApp({
  passwordHash: DASHBOARD_PASSWORD_HASH,
  sessionSecret: SESSION_SECRET,
  guildId: GUILD_ID,
  ownerId: OWNER_ID,
  cookieSecure: COOKIE_SECURE === '1',
});

const port = Number(PORT);
app.listen(port, '127.0.0.1', () => {
  console.log(`[web] listening on http://127.0.0.1:${port}`);
});

initPWF();

startBot(DISCORD_TOKEN, {
  guildId: GUILD_ID,
  commandEnv: { CUSTOMER_ROLE_ID, REDEEM_LOG_CHANNEL_ID },
  onReady: () => restoreTimers({ logChannelId: GIVEAWAY_LOG_CHANNEL_ID }),
}).catch((e) => {
  console.error('[fatal] bot login failed:', e);
  process.exit(1);
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    console.log(`[app] ${sig} received, shutting down`);
    process.exit(0);
  });
}
