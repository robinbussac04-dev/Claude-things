import 'dotenv/config';
import { startBot } from './bot.js';
import { createWebApp } from './web.js';
import { initPWF } from './pwf.js';
import { restoreTimers } from './giveaways.js';
import { startScheduler } from './scheduler.js';

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
  DISCORD_CLIENT_ID,
  DISCORD_CLIENT_SECRET,
  PUBLIC_URL,
  VERIFY_ROLE_ID,
  VERIFY_REMOVE_ROLE_IDS,
} = process.env;

const verifyRemoveRoleIds = String(VERIFY_REMOVE_ROLE_IDS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

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
  discordClientId: DISCORD_CLIENT_ID,
  discordClientSecret: DISCORD_CLIENT_SECRET,
  discordToken: DISCORD_TOKEN,
  publicUrl: PUBLIC_URL,
  verifyRoleId: VERIFY_ROLE_ID,
  verifyRemoveRoleIds,
});

const port = Number(PORT);
app.listen(port, '127.0.0.1', () => {
  console.log(`[web] listening on http://127.0.0.1:${port}`);
});

initPWF();

startBot(DISCORD_TOKEN, {
  guildId: GUILD_ID,
  commandEnv: { CUSTOMER_ROLE_ID, REDEEM_LOG_CHANNEL_ID },
  onReady: () => {
    restoreTimers({ logChannelId: GIVEAWAY_LOG_CHANNEL_ID });
    startScheduler();
  },
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
