import 'dotenv/config';
import { startBot, getClient } from './bot.js';
import { createWebApp } from './web.js';
import { initPWF } from './pwf.js';
import { restoreTimers } from './giveaways.js';
import { startScheduler } from './scheduler.js';
import { startPwfExpiryScanner } from './pwfExpiry.js';
import { startBackupJob } from './backup.js';
import { startMemberCounter } from './memberCounter.js';
import { startTicketScanner } from './tickets.js';

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
  HEAD_SUPPORT_ROLE_ID,
  TICKET_CATEGORY_SUPPORT,
  TICKET_CATEGORY_PURCHASE,
  TICKET_CATEGORY_MEDIA,
  OWNER_ROLE_ID,
  MOD_LOG_CHANNEL_ID,
  MEMBER_COUNTER_CHANNEL_ID,
  MEMBER_COUNTER_TEMPLATE,
  EXPIRY_LOG_CHANNEL_ID,
  RENEW_URL,
  TICKET_INACTIVITY_HOURS,
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
  commandEnv: {
    CUSTOMER_ROLE_ID,
    REDEEM_LOG_CHANNEL_ID,
    HEAD_SUPPORT_ROLE_ID,
    TICKET_CATEGORY_SUPPORT,
    TICKET_CATEGORY_PURCHASE,
    TICKET_CATEGORY_MEDIA,
    OWNER_ROLE_ID,
    MOD_LOG_CHANNEL_ID,
  },
  onReady: () => {
    restoreTimers({ logChannelId: GIVEAWAY_LOG_CHANNEL_ID });
    startScheduler();
    startPwfExpiryScanner({
      guildId: GUILD_ID,
      customerRoleId: CUSTOMER_ROLE_ID,
      unverifiedRoleId: verifyRemoveRoleIds[0] ?? null,
      logChannelId: EXPIRY_LOG_CHANNEL_ID,
      renewUrl: RENEW_URL,
    });
    startBackupJob({ ownerId: OWNER_ID, guildId: GUILD_ID });
    startMemberCounter({
      guildId: GUILD_ID,
      channelId: MEMBER_COUNTER_CHANNEL_ID,
      template: MEMBER_COUNTER_TEMPLATE,
    });
    startTicketScanner(getClient(), {
      inactivityHours: Number(TICKET_INACTIVITY_HOURS) || 24,
    });
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
