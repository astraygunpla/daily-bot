const { BOT_CONFIG } = require('../config');
const { sendDailyDMs, collectAnswersForDay, missingUsersReport } = require('./standup');
const { postDailyStandup } = require('./clickup');
const { getDateString, chunkMessage } = require('./utils');

// Only the configured owner can run these commands.
// Set DISCORD_OWNER_ID in .env to your Discord user ID.

async function handleCommand(message, client) {
  if (message.author.id !== BOT_CONFIG.ownerId) {
    await message.reply('❌ Apenas o dono do bot pode usar estes comandos.');
    return;
  }

  const [cmd, ...args] = message.content.trim().split(/\s+/);

  switch (cmd.toLowerCase()) {
    // ── !start-standup ──────────────────────────────────────────────────────
    case '!start-standup': {
      await message.reply('🚀 Iniciando stand-up manualmente…');
      try {
        await sendDailyDMs(client);
        await message.reply('✅ DMs enviadas com sucesso.');
      } catch (err) {
        await message.reply(`❌ Erro ao enviar DMs: ${err.message}`);
      }
      break;
    }

    // ── !show-answers [date] ────────────────────────────────────────────────
    case '!show-answers': {
      const date = args[0] || getDateString();
      const { complete, missing } = collectAnswersForDay(date);

      if (complete.length === 0 && missing.length === 0) {
        await message.reply(`📭 Nenhuma entrada registrada para ${date}.`);
        return;
      }

      let report = `📊 **Stand-up ${date}**\n\n`;

      if (complete.length > 0) {
        report += `✅ **Responderam (${complete.length}):**\n`;
        for (const e of complete) {
          report += `\n👤 **${e.displayName}** (@${e.username})\n`;
          report += `> **Ontem:** ${e.yesterday}\n`;
          report += `> **Hoje:** ${e.today}\n`;
          report += `> **Bloqueios:** ${e.blockers}\n`;
        }
      }

      if (missing.length > 0) {
        report += `\n❌ **Pendentes (${missing.length}):**\n`;
        for (const e of missing) {
          report += `- ${e.displayName} (@${e.username}) — estado: \`${e.state}\`\n`;
        }
      }

      for (const chunk of chunkMessage(report)) {
        await message.channel.send(chunk);
      }
      break;
    }

    // ── !missing [date] ─────────────────────────────────────────────────────
    case '!missing': {
      const date = args[0] || getDateString();
      const missing = missingUsersReport(date);

      if (missing.length === 0) {
        await message.reply(`✅ Todos responderam para ${date}!`);
        return;
      }

      const list = missing.map((e) => `- ${e.displayName} (@${e.username})`).join('\n');
      await message.reply(`❌ **Pendentes para ${date} (${missing.length}):**\n${list}`);
      break;
    }

    // ── !post-clickup [date] ─────────────────────────────────────────────────
    case '!post-clickup': {
      const date = args[0] || getDateString();
      const { complete } = collectAnswersForDay(date);

      if (complete.length === 0) {
        await message.reply(`📭 Nenhuma resposta completa para ${date}.`);
        return;
      }

      await message.reply(`📤 Enviando ${complete.length} resposta(s) para o ClickUp…`);
      try {
        await postDailyStandup(date, complete);
        await message.reply('✅ Postado no ClickUp com sucesso!');
      } catch (err) {
        await message.reply(`❌ Erro no ClickUp: ${err.message}`);
      }
      break;
    }

    // ── !help ───────────────────────────────────────────────────────────────
    // ── !debug ──────────────────────────────────────────────────────────────
    case '!debug': {
      try {
        const guild = await client.guilds.fetch(BOT_CONFIG.guildId);
        await guild.members.fetch();
        await guild.roles.fetch();

        const role = guild.roles.cache.get(BOT_CONFIG.roleId);
        const roleInfo = role
          ? `✅ @${role.name} — ${role.members.size} member(s)\n` +
            role.members.map((m) => `  • ${m.displayName} (${m.id})`).join('\n')
          : `❌ Role ID \`${BOT_CONFIG.roleId}\` not found.\nAvailable roles:\n` +
            [...guild.roles.cache.values()].map((r) => `  ${r.id} — @${r.name}`).join('\n');

        await message.reply(
          `**Debug Info**\n` +
          `Guild: ${guild.name} (\`${guild.id}\`)\n` +
          `Owner ID: \`${BOT_CONFIG.ownerId}\`\n` +
          `Your ID:  \`${message.author.id}\`\n\n` +
          `Role check:\n${roleInfo}`
        );
      } catch (err) {
        await message.reply(`❌ Debug error: ${err.message}`);
      }
      break;
    }

    case '!help': {
      await message.reply(
        '**Comandos do Stand-up Bot:**\n\n' +
          '`!start-standup` — Dispara o stand-up manualmente\n' +
          '`!show-answers [YYYY-MM-DD]` — Exibe respostas do dia\n' +
          '`!missing [YYYY-MM-DD]` — Lista quem não respondeu\n' +
          '`!post-clickup [YYYY-MM-DD]` — Envia respostas ao ClickUp\n' +
          '`!help` — Esta mensagem\n\n' +
          '_Data padrão: hoje. Exemplo: `!show-answers 2024-01-15`_'
      );
      break;
    }

    default:
      // Silently ignore unknown commands to avoid noise
      break;
  }
}

module.exports = { handleCommand };
