const { BOT_CONFIG } = require('../config');
const storage = require('./storage');
const { postDailyStandup } = require('./clickup');
const { getDateString } = require('./utils');

// ─── Questions asked in sequence ─────────────────────────────────────────────

const QUESTIONS = [
  [
    '📌 **Pergunta 1 de 3 — Ontem**',
    'No que você trabalhou ontem?',
    '',
    '_Dica: prefixe cada tarefa com ✅ (concluído), 🟨 (em progresso) ou 🟫 (não trabalhado)._',
    '_Você pode usar múltiplas linhas para listar tarefas separadas._',
  ].join('\n'),

  [
    '🎯 **Pergunta 2 de 3 — Hoje**',
    'Qual seu plano pra hoje?',
    '',
    '_Liste as tarefas, uma por linha se quiser._',
  ].join('\n'),

  [
    '🚧 **Pergunta 3 de 3 — Bloqueios**',
    'Existe algum bloqueio, ou pessoa que precisa acionar?',
    '',
    '_Responda "nenhum" se não houver impedimentos._',
  ].join('\n'),
];

// ─── sendDailyDMs ─────────────────────────────────────────────────────────────
// Fetches all members with the configured role and sends each one the first
// stand-up question. Idempotent: skips users who already received a DM today.

async function sendDailyDMs(client) {
  const date = getDateString();
  console.log(`[Standup] Starting daily stand-up for ${date}`);

  const guild = await client.guilds.fetch(BOT_CONFIG.guildId);
  console.log(`[Standup] Guild: ${guild.name} (${guild.id})`);

  const allMembers = await guild.members.fetch();
  console.log(`[Standup] Total members fetched: ${allMembers.size}`);

  // Roles are not populated after guilds.fetch() — force a full guild fetch
  await guild.roles.fetch();

  const role = guild.roles.cache.get(BOT_CONFIG.roleId);
  if (!role) {
    console.error(`[Standup] Role ID ${BOT_CONFIG.roleId} not found. Available roles:`);
    guild.roles.cache.forEach((r) => console.error(`  ${r.id} — @${r.name}`));
    return;
  }

  console.log(`[Standup] Role found: @${role.name} — ${role.members.size} member(s)`);

  for (const [userId, member] of role.members) {
    if (storage.hasDMSentToday(date, userId)) {
      console.log(`[Standup] Already sent DM to ${member.user.username} today — skipping.`);
      continue;
    }

    try {
      const dmChannel = await member.user.createDM();

      await dmChannel.send(
        [
          `🌅 **Daily Stand-up — ${date}**`,
          '',
          `Olá, ${member.displayName}! Hora do stand-up diário. 👋`,
          'Vou te fazer **3 perguntas rápidas**. Responda uma a uma.',
          '',
          QUESTIONS[0],
        ].join('\n')
      );

      storage.setEntry(date, userId, {
        userId,
        username: member.user.username,
        displayName: member.displayName,
        date,
        state: 'sent',
        yesterday: null,
        today: null,
        blockers: null,
        dmChannelId: dmChannel.id,
        sentAt: new Date().toISOString(),
        completedAt: null,
        lastUpdatedAt: new Date().toISOString(),
      });

      console.log(`[Standup] DM sent → ${member.user.username}`);
    } catch (err) {
      // Common causes: user blocked the bot, or DMs disabled
      console.warn(`[Standup] Could not DM ${member.user.username} (${userId}): ${err.message}`);
    }
  }
}

// ─── handleDMReply ────────────────────────────────────────────────────────────
// Called on every incoming DM. Routes the message to the correct stand-up step.

async function handleDMReply(message) {
  const userId = message.author.id;
  const date = getDateString();
  const entry = storage.getEntry(date, userId);

  if (!entry) return; // User is not part of today's stand-up

  const answer = message.content.trim();
  if (!answer) return;

  // Allow !restart to redo answers (useful before the deadline)
  if (answer.toLowerCase() === '!restart') {
    storage.setEntry(date, userId, {
      state: 'sent',
      yesterday: null,
      today: null,
      blockers: null,
      completedAt: null,
      lastUpdatedAt: new Date().toISOString(),
    });
    await message.channel.send(`🔄 Respostas resetadas. Vamos começar de novo!\n\n${QUESTIONS[0]}`);
    return;
  }

  switch (entry.state) {
    case 'sent': {
      storage.setEntry(date, userId, {
        yesterday: answer,
        state: 'answered_yesterday',
        lastUpdatedAt: new Date().toISOString(),
      });
      await message.channel.send(QUESTIONS[1]);
      break;
    }

    case 'answered_yesterday': {
      storage.setEntry(date, userId, {
        today: answer,
        state: 'answered_today',
        lastUpdatedAt: new Date().toISOString(),
      });
      await message.channel.send(QUESTIONS[2]);
      break;
    }

    case 'answered_today': {
      storage.setEntry(date, userId, {
        blockers: answer,
        state: 'complete',
        completedAt: new Date().toISOString(),
        lastUpdatedAt: new Date().toISOString(),
      });
      const final = storage.getEntry(date, userId);
      await message.channel.send(
        [
          '✅ **Obrigado! Suas respostas foram registradas.**',
          '',
          `**Ontem:** ${final.yesterday}`,
          `**Hoje:** ${final.today}`,
          `**Bloqueios:** ${final.blockers}`,
          '',
          'Bom trabalho! 🚀  _Digite `!restart` se quiser editar antes do prazo._',
        ].join('\n')
      );
      break;
    }

    case 'complete': {
      await message.channel.send(
        '✅ Suas respostas já foram salvas.\n_Digite `!restart` para responder novamente (válido até o prazo de hoje)._'
      );
      break;
    }

    default:
      break;
  }
}

// ─── collectAnswersForDay ─────────────────────────────────────────────────────
// Returns { complete: Entry[], missing: Entry[] } for a given date.

function collectAnswersForDay(date) {
  const entries = storage.getDayEntries(date);
  const complete = [];
  const missing = [];

  for (const entry of Object.values(entries)) {
    if (entry.state === 'complete') {
      complete.push(entry);
    } else {
      missing.push(entry);
    }
  }

  return { complete, missing };
}

// ─── missingUsersReport ───────────────────────────────────────────────────────
// Logs and returns the list of users who haven't completed the stand-up.

function missingUsersReport(date) {
  const { missing } = collectAnswersForDay(date);

  if (missing.length === 0) {
    console.log(`[Standup] All users completed the stand-up for ${date}.`);
    return [];
  }

  console.log(`[Standup] Missing responses for ${date} (${missing.length}):`);
  for (const entry of missing) {
    console.log(`  ✗ ${entry.displayName} (@${entry.username}) — state: ${entry.state}`);
  }

  return missing;
}

// ─── postAnswersToClickUp ─────────────────────────────────────────────────────
// Convenience wrapper: collect completed answers and ship them to ClickUp.

async function postAnswersToClickUp(date) {
  const { complete } = collectAnswersForDay(date);
  return postDailyStandup(date, complete);
}

module.exports = {
  sendDailyDMs,
  handleDMReply,
  collectAnswersForDay,
  postAnswersToClickUp,
  missingUsersReport,
};
