import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

let client = null;

export function initPWF() {
  if (!process.env.PWF_APP_SECRET) {
    console.warn('[pwf] PWF_APP_SECRET not set — /redeem disabled');
    return null;
  }
  const PWFLicense = require('./vendor/pwf-license.js');
  client = new PWFLicense();
  console.log('[pwf] client initialized');
  return client;
}

export function getPWF() {
  return client;
}

export async function checkKey(key) {
  if (!client) throw new Error('PWF not initialized');
  return client.checkKey(key);
}
