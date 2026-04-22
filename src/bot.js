const { Client, GatewayIntentBits, Partials } = require('discord.js');
const { BOT_CONFIG } = require('../config');
const storage = require('./storage');
const { handleDMReply } = require('./standup');
const { handleCommand } = require('./commands');

// Privileged intents (GuildMembers, MessageContent) must also be enabled in the
// Discord Developer Portal: Application → Bot → Privileged Gateway Intents
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,    // required to fetch role members
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,  // required to receive DM replies
    GatewayIntentBits.MessageContent,  // required to read message text
  ],
  // Partials allow the bot to receive events for DM channels it hasn't cached yet
  partials: [Partials.Channel, Partials.Message],
});

async function initBot() {
  storage.load();

  client.once('clientReady', () => {
    console.log(`[Bot] Logged in as ${client.user.tag} (ID: ${client.user.id})`);
  });

  client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    if (message.channel.isDMBased()) {
      // All DMs go through the stand-up reply handler
      await handleDMReply(message);
      return;
    }

    // Guild messages: only handle commands starting with !
    if (message.content.startsWith('!')) {
      await handleCommand(message, client);
    }
  });

  client.on('error', (err) => {
    console.error('[Bot] Client error:', err.message);
  });

  await client.login(BOT_CONFIG.token);
  return client;
}

module.exports = { client, initBot };
