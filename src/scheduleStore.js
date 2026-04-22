const fs = require('fs');
const path = require('path');
const { BOT_CONFIG } = require('../config');

const storePath = path.join(BOT_CONFIG.dataDir, 'schedule.json');

let store = null;

function load() {
  try {
    store = JSON.parse(fs.readFileSync(storePath, 'utf8'));
  } catch {
    store = {
      standupTime: BOT_CONFIG.standupTime,
      deadlineMinutes: BOT_CONFIG.deadlineMinutes,
    };
  }
  return store;
}

function save() {
  fs.writeFileSync(storePath, JSON.stringify(store, null, 2));
}

function get() {
  if (!store) load();
  return { ...store };
}

function set(standupTime, deadlineMinutes) {
  if (!store) load();
  store.standupTime = standupTime;
  store.deadlineMinutes = deadlineMinutes;
  save();
}

module.exports = { load, get, set };
