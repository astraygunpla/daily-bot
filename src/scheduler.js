const cron = require('node-cron');
const { BOT_CONFIG } = require('../config');
const { sendDailyDMs, collectAnswersForDay, missingUsersReport } = require('./standup');
const { postDailyStandup } = require('./clickup');
const { buildDeadlineCron, getDateString } = require('./utils');

function initScheduler(client) {
  const standupCron = BOT_CONFIG.standupTime;
  const deadlineCron = buildDeadlineCron(standupCron, BOT_CONFIG.deadlineMinutes);
  const tz = BOT_CONFIG.timezone;

  console.log(`[Scheduler] Stand-up : ${standupCron} (${tz})`);
  console.log(`[Scheduler] Deadline : ${deadlineCron} (${tz})`);

  // ── Daily stand-up trigger ─────────────────────────────────────────────────
  cron.schedule(
    standupCron,
    async () => {
      console.log('[Scheduler] ⏰ Stand-up time — sending DMs…');
      try {
        await sendDailyDMs(client);
      } catch (err) {
        console.error('[Scheduler] Error in sendDailyDMs:', err.message);
      }
    },
    { timezone: tz }
  );

  // ── Deadline trigger ───────────────────────────────────────────────────────
  cron.schedule(
    deadlineCron,
    async () => {
      const date = getDateString();
      console.log(`[Scheduler] ⏰ Deadline reached for ${date} — collecting answers…`);

      try {
        const { complete, missing } = collectAnswersForDay(date);
        missingUsersReport(date);

        // Post completed answers to ClickUp
        await postDailyStandup(date, complete);

        // Notify users who missed the deadline
        for (const entry of missing) {
          try {
            const user = await client.users.fetch(entry.userId);
            const dm = await user.createDM();
            await dm.send(
              '⏰ O prazo do stand-up de hoje encerrou e suas respostas não foram registradas a tempo.\n' +
                'Entre em contato com o gestor se necessário.'
            );
          } catch (dmErr) {
            console.warn(`[Scheduler] Could not notify ${entry.username}: ${dmErr.message}`);
          }
        }

        console.log(
          `[Scheduler] Done. Complete: ${complete.length}, Missing: ${missing.length}`
        );
      } catch (err) {
        console.error('[Scheduler] Error during deadline processing:', err.message);
      }
    },
    { timezone: tz }
  );

  console.log('[Scheduler] Jobs registered.');
}

module.exports = { initScheduler };
