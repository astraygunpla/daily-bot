require('dotenv').config();

const { validate } = require('../config');
const { initBot, client } = require('./bot');
const { initScheduler } = require('./scheduler');

async function main() {
  // Fail fast if required env vars are missing
  validate();

  console.log('[Main] Starting Discord Stand-up Bot…');

  await initBot();
  initScheduler(client);

  console.log('[Main] Bot is running. Press Ctrl+C to stop.');
}

main().catch((err) => {
  console.error('[Main] Fatal startup error:', err.message);
  process.exit(1);
});
