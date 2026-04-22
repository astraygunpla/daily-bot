/**
 * Lightweight JSON-file storage for stand-up answers.
 *
 * Schema (data/standup.json):
 * {
 *   "YYYY-MM-DD": {
 *     "<userId>": {
 *       userId:       string,
 *       username:     string,   // Discord username
 *       displayName:  string,   // Guild display name
 *       date:         string,   // "YYYY-MM-DD"
 *       state:        "sent" | "answered_yesterday" | "answered_today" | "complete",
 *       yesterday:    string | null,
 *       today:        string | null,
 *       blockers:     string | null,
 *       dmChannelId:  string,
 *       sentAt:       ISO8601,
 *       completedAt:  ISO8601 | null,
 *       lastUpdatedAt: ISO8601
 *     }
 *   }
 * }
 */

const fs = require('fs');
const path = require('path');
const { BOT_CONFIG } = require('../config');

const STORAGE_FILE = path.join(BOT_CONFIG.dataDir, 'standup.json');

let store = {};

function load() {
  try {
    if (fs.existsSync(STORAGE_FILE)) {
      store = JSON.parse(fs.readFileSync(STORAGE_FILE, 'utf-8'));
      console.log('[Storage] Loaded persisted store from disk.');
    } else {
      console.log('[Storage] No existing store found — starting fresh.');
    }
  } catch (err) {
    console.error('[Storage] Failed to load store, starting empty:', err.message);
    store = {};
  }
}

function save() {
  try {
    fs.mkdirSync(path.dirname(STORAGE_FILE), { recursive: true });
    fs.writeFileSync(STORAGE_FILE, JSON.stringify(store, null, 2), 'utf-8');
  } catch (err) {
    console.error('[Storage] Failed to persist store:', err.message);
  }
}

function getEntry(date, userId) {
  return store[date]?.[userId] ?? null;
}

function setEntry(date, userId, data) {
  if (!store[date]) store[date] = {};
  store[date][userId] = { ...(store[date][userId] ?? {}), ...data };
  save();
}

function getDayEntries(date) {
  return store[date] ?? {};
}

function hasAnsweredToday(date, userId) {
  return getEntry(date, userId)?.state === 'complete';
}

// Returns true if a DM was already sent today (idempotency guard)
function hasDMSentToday(date, userId) {
  const entry = getEntry(date, userId);
  return entry !== null;
}

module.exports = { load, save, getEntry, setEntry, getDayEntries, hasAnsweredToday, hasDMSentToday };
