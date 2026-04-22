const { BOT_CONFIG } = require('../config');
const { sendDailyDMs, collectAnswersForDay, missingUsersReport } = require('./standup');
const { postDailyStandup } = require('./clickup');
const { getDateString, chunkMessage, buildDeadlineCron } = require('./utils');
const scheduleStore = require('./scheduleStore');
const { reschedule } = require('./scheduler');
const formatStore = require('./formatStore');
const { formatPageContent } = require('./clickup');

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

    // ── !set-time HH:MM ────────────────────────────────────────────────────
    case '!set-time': {
      const timeArg = args[0];
      if (!timeArg || !/^\d{1,2}:\d{2}$/.test(timeArg)) {
        await message.reply('❌ Formato inválido. Use: `!set-time HH:MM` (ex: `!set-time 09:30`)');
        return;
      }
      const [hh, mm] = timeArg.split(':').map(Number);
      if (hh > 23 || mm > 59) {
        await message.reply('❌ Horário inválido. Use valores entre 00:00 e 23:59.');
        return;
      }
      const newStandupCron = `${mm} ${hh} * * 1-5`;
      const { deadlineMinutes } = scheduleStore.get();
      reschedule(newStandupCron, deadlineMinutes);
      const deadlineCron = buildDeadlineCron(newStandupCron, deadlineMinutes);
      const [dMm, dHh] = deadlineCron.split(' ');
      await message.reply(
        `✅ Horário do stand-up atualizado!\n` +
        `⏰ **Stand-up:** ${timeArg} (seg–sex)\n` +
        `📤 **Envio ao ClickUp:** ${String(dHh).padStart(2, '0')}:${String(dMm).padStart(2, '0')} (${deadlineMinutes} min depois)`
      );
      break;
    }

    // ── !set-deadline N ─────────────────────────────────────────────────────
    case '!set-deadline': {
      const minutesArg = parseInt(args[0], 10);
      if (isNaN(minutesArg) || minutesArg < 1 || minutesArg > 1440) {
        await message.reply('❌ Formato inválido. Use: `!set-deadline N` com N em minutos (ex: `!set-deadline 30`)');
        return;
      }
      const { standupTime } = scheduleStore.get();
      reschedule(standupTime, minutesArg);
      const deadlineCron = buildDeadlineCron(standupTime, minutesArg);
      const [dMm, dHh] = deadlineCron.split(' ');
      await message.reply(
        `✅ Prazo para envio ao ClickUp atualizado!\n` +
        `📤 **Envio automático ao ClickUp:** ${String(dHh).padStart(2, '0')}:${String(dMm).padStart(2, '0')} (${minutesArg} min após o stand-up)`
      );
      break;
    }

    // ── !set-format <option> <value> ────────────────────────────────────────
    case '!set-format': {
      const [option, ...rest] = args;
      const value = rest.join(' ');

      if (!option) {
        await message.reply(
          '❌ Especifique uma opção. Use `!help` para ver as opções disponíveis.'
        );
        return;
      }

      switch (option.toLowerCase()) {
        case 'language': {
          if (!['pt', 'en'].includes(value)) {
            await message.reply('❌ Idioma inválido. Use: `!set-format language pt` ou `!set-format language en`');
            return;
          }
          formatStore.set({ language: value });
          await message.reply(`✅ Idioma do formato ClickUp definido para **${value === 'pt' ? 'Português 🇧🇷' : 'English 🇺🇸'}**.`);
          break;
        }
        case 'legend': {
          if (!['on', 'off'].includes(value)) {
            await message.reply('❌ Use: `!set-format legend on` ou `!set-format legend off`');
            return;
          }
          formatStore.set({ legend: value === 'on' });
          await message.reply(`✅ Legenda de emojis **${value === 'on' ? 'ativada' : 'desativada'}**.`);
          break;
        }
        case 'header': {
          if (!['on', 'off'].includes(value)) {
            await message.reply('❌ Use: `!set-format header on` ou `!set-format header off`');
            return;
          }
          formatStore.set({ header: value === 'on' });
          await message.reply(`✅ Cabeçalho automático **${value === 'on' ? 'ativado' : 'desativado'}**.`);
          break;
        }
        case 'title': {
          if (!value.trim()) {
            await message.reply('❌ Informe o prefixo. Ex: `!set-format title Daily`');
            return;
          }
          formatStore.set({ titlePrefix: value.trim() });
          const today = getDateString();
          const [y, m, d] = today.split('-');
          await message.reply(`✅ Prefixo do título atualizado. Exemplo: **${value.trim()} ${d}/${m}/${y}**`);
          break;
        }
        default:
          await message.reply(
            '❌ Opção desconhecida. Opções disponíveis: `language`, `legend`, `header`, `title`'
          );
      }
      break;
    }

    // ── !show-format ────────────────────────────────────────────────────────
    case '!show-format': {
      const fmt = formatStore.get();
      const today = getDateString();
      const [y, m, d] = today.split('-');
      const exampleTitle = `${fmt.titlePrefix} ${d}/${m}/${y}`;

      const summary =
        `**⚙️ Formato atual do ClickUp:**\n\n` +
        `🌐 **Idioma:** ${fmt.language === 'pt' ? 'Português 🇧🇷' : 'English 🇺🇸'}\n` +
        `📋 **Legenda de emojis:** ${fmt.legend ? 'Ativada' : 'Desativada'}\n` +
        `📝 **Cabeçalho automático:** ${fmt.header ? 'Ativado' : 'Desativado'}\n` +
        `🏷️ **Título da página:** ${exampleTitle}\n\n` +
        `Use \`!preview-format\` para ver um exemplo do conteúdo gerado.`;

      await message.reply(summary);
      break;
    }

    // ── !preview-format ─────────────────────────────────────────────────────
    case '!preview-format': {
      const fakeEntry = {
        displayName: 'Paulo',
        username: 'astraygunpla',
        yesterday: '✅ Tarefa A\n🟨 Tarefa B',
        today: 'Finalizar feature X\nRevisar PRs',
        blockers: 'nenhum',
      };
      const today = getDateString();
      const preview = formatPageContent(today, [fakeEntry]);
      const fmt = formatStore.get();
      const [y, m, d] = today.split('-');
      const title = `${fmt.titlePrefix} ${d}/${m}/${y}`;

      await message.reply(`**Pré-visualização — página "${title}":**`);
      for (const chunk of chunkMessage(`\`\`\`markdown\n${preview}\n\`\`\``)) {
        await message.channel.send(chunk);
      }
      break;
    }

    // ── !show-config ────────────────────────────────────────────────────────
    case '!show-config': {
      const { standupTime, deadlineMinutes } = scheduleStore.get();
      const deadlineCron = buildDeadlineCron(standupTime, deadlineMinutes);
      const [sMm, sHh] = standupTime.split(' ');
      const [dMm, dHh] = deadlineCron.split(' ');
      await message.reply(
        `**⚙️ Configuração atual do Stand-up Bot:**\n\n` +
        `⏰ **Disparo do stand-up:** ${String(sHh).padStart(2, '0')}:${String(sMm).padStart(2, '0')} (seg–sex)\n` +
        `📤 **Envio automático ao ClickUp:** ${String(dHh).padStart(2, '0')}:${String(dMm).padStart(2, '0')} (${deadlineMinutes} min depois)\n` +
        `🌎 **Timezone:** ${BOT_CONFIG.timezone}`
      );
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
          '`!post-clickup [YYYY-MM-DD]` — Envia respostas ao ClickUp\n\n' +
          '**Configuração de horário:**\n' +
          '`!set-time HH:MM` — Define o horário do disparo automático (ex: `!set-time 09:30`)\n' +
          '`!set-deadline N` — Define quantos minutos após o stand-up o ClickUp é atualizado (ex: `!set-deadline 30`)\n' +
          '`!show-config` — Exibe a configuração atual de horários\n\n' +
          '**Formato do ClickUp:**\n' +
          '`!set-format language pt|en` — Idioma das seções (Português ou English)\n' +
          '`!set-format legend on|off` — Ativa/desativa a legenda de emojis\n' +
          '`!set-format header on|off` — Ativa/desativa o cabeçalho automático\n' +
          '`!set-format title <prefixo>` — Define o prefixo do título da página (ex: `!set-format title Daily`)\n' +
          '`!show-format` — Exibe as configurações atuais de formato\n' +
          '`!preview-format` — Mostra uma pré-visualização do formato gerado\n\n' +
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
