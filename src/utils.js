const { BOT_CONFIG } = require('../config');

// Returns "YYYY-MM-DD" in the configured timezone
function getDateString(date = new Date()) {
  return date.toLocaleDateString('en-CA', {
    timeZone: BOT_CONFIG.timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

// Parses the cron expression "MM HH * * DOW" and returns { hour, minute }
function parseCronTime(cronExpr) {
  const parts = cronExpr.trim().split(/\s+/);
  return {
    minute: parseInt(parts[0], 10),
    hour: parseInt(parts[1], 10),
  };
}

// Computes the deadline cron by adding offsetMinutes to the standup cron
function buildDeadlineCron(standupCron, offsetMinutes) {
  const parts = standupCron.trim().split(/\s+/);
  let minute = parseInt(parts[0], 10) + offsetMinutes;
  let hour = parseInt(parts[1], 10) + Math.floor(minute / 60);
  minute = minute % 60;
  hour = hour % 24;
  return `${minute} ${hour} ${parts[2]} ${parts[3]} ${parts[4]}`;
}

// Splits a long string into chunks ≤ maxLen (Discord has a 2000-char limit)
function chunkMessage(text, maxLen = 1900) {
  const chunks = [];
  while (text.length > maxLen) {
    let cutAt = text.lastIndexOf('\n', maxLen);
    if (cutAt < 0) cutAt = maxLen;
    chunks.push(text.slice(0, cutAt));
    text = text.slice(cutAt).trimStart();
  }
  if (text) chunks.push(text);
  return chunks;
}

module.exports = { getDateString, parseCronTime, buildDeadlineCron, chunkMessage };
