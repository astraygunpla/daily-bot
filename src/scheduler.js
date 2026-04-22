const cron = require('node-cron');
const { BOT_CONFIG } = require('../config');
const { sendDailyDMs, collectAnswersForDay, missingUsersReport } = require('./standup');
const { postDailyStandup } = require('./clickup');
const { buildDeadlineCron, getDateString } = require('./utils');
const scheduleStore = require('./scheduleStore');

let standupTask = null;
let deadlineTask = null;
let currentClient = null;

function startJobs(standupCron, deadlineMinutes) {
  const deadlineCron = buildDeadlineCron(standupCron, deadlineMinutes);
  const tz = BOT_CONFIG.timezone;

  if (standupTask) standupTask.stop();
  if (deadlineTask) deadlineTask.stop();

  standupTask = cron.schedule(
    standupCron,
    async () => {
      console.log('[Scheduler] ⏰ Stand-up time — sending DMs…');
      try {
        await sendDailyDMs(currentClient);
      } catch (err) {
        console.error('[Scheduler] Error in sendDailyDMs:', err.message);
      }
    },
    { timezone: tz }
  );

  deadlineTask = cron.schedule(
    deadlineCron,
    async () => {
      const date = getDateString();
      console.log(`[Scheduler] ⏰ Deadline reached for ${date} — collecting answers…`);
      try {
        const { complete, missing } = collectAnswersForDay(date);
        missingUsersReport(date);

        await postDailyStandup(date, complete);

        for (const entry of missing) {
          try {
            const user = await currentClient.users.fetch(entry.userId);
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

  console.log(`[Scheduler] Stand-up : ${standupCron} (${tz})`);
  console.log(`[Scheduler] Deadline : ${deadlineCron} (${tz})`);
  console.log('[Scheduler] Jobs registered.');
}

function initScheduler(client) {
  currentClient = client;
  scheduleStore.load();
  const { standupTime, deadlineMinutes } = scheduleStore.get();
  startJobs(standupTime, deadlineMinutes);
}

function reschedule(standupTime, deadlineMinutes) {
  scheduleStore.set(standupTime, deadlineMinutes);
  startJobs(standupTime, deadlineMinutes);
}

module.exports = { initScheduler, reschedule };
