require('dotenv').config();

// ─── Bot configuration ───────────────────────────────────────────────────────
// Replace the placeholder values in .env (never commit real tokens to git)
const BOT_CONFIG = {
  token: process.env.DISCORD_TOKEN,
  guildId: process.env.DISCORD_GUILD_ID,       // Server ID
  roleId: process.env.DISCORD_ROLE_ID,          // @dev-team role ID
  ownerId: process.env.DISCORD_OWNER_ID,         // Your Discord user ID (for !commands)
  standupTime: process.env.STANDUP_TIME || '30 9 * * 1-5',
  deadlineMinutes: parseInt(process.env.DEADLINE_MINUTES || '30', 10),
  timezone: process.env.TIMEZONE || 'America/Sao_Paulo',
  dataDir: process.env.DATA_DIR || './data',
};

// ─── ClickUp configuration ───────────────────────────────────────────────────
// API key:      ClickUp → avatar → Settings → Apps → API Token
// Workspace ID: visible in the URL → app.clickup.com/{WORKSPACE_ID}/...
// Doc ID:       open the doc → URL → app.clickup.com/{ws}/docs/{DOC_ID}-...
const CLICKUP_CONFIG = {
  apiKey: process.env.CLICKUP_API_KEY,
  workspaceId: process.env.CLICKUP_WORKSPACE_ID,
  docId: process.env.CLICKUP_DOC_ID,
  baseUrl: 'https://api.clickup.com/api/v3',
};

function validate() {
  const required = ['token', 'guildId', 'roleId', 'ownerId'];
  const missing = required.filter((k) => !BOT_CONFIG[k]);
  if (missing.length) {
    throw new Error(`[Config] Missing required env vars: ${missing.map((k) => k.toUpperCase()).join(', ')}`);
  }
}

module.exports = { BOT_CONFIG, CLICKUP_CONFIG, validate };
