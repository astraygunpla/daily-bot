# Discord Daily Stand-up Bot

Automated daily scrum bot for Discord. At a configured time (default 9:30 AM Mon–Fri) the bot DMs every member of a specified role three stand-up questions, waits for replies, then posts a formatted summary to a ClickUp task as a comment.

---

## File structure

```
discord-standup-bot/
├── src/
│   ├── index.js        Entry point
│   ├── bot.js          Discord client + event wiring
│   ├── standup.js      Core logic (sendDailyDMs, handleDMReply, …)
│   ├── storage.js      JSON-file persistence
│   ├── clickup.js      ClickUp REST API integration
│   ├── scheduler.js    node-cron jobs
│   ├── commands.js     Guild commands (!start-standup, !show-answers, …)
│   └── utils.js        Date helpers, message chunking
├── data/
│   └── standup.json    Created at runtime — answers stored here
├── config.js           Loads env vars into BOT_CONFIG / CLICKUP_CONFIG
├── .env.example        Template — copy to .env and fill in
└── package.json
```

---

## Storage schema

`data/standup.json` is keyed by date, then by user ID:

```json
{
  "2024-01-15": {
    "123456789": {
      "userId": "123456789",
      "username": "john",
      "displayName": "John Doe",
      "date": "2024-01-15",
      "state": "complete",
      "yesterday": "Finalizei o módulo de pagamento",
      "today": "Vou fazer o code review do PR #42",
      "blockers": "Nenhum",
      "dmChannelId": "987654321",
      "sentAt": "2024-01-15T12:30:00.000Z",
      "completedAt": "2024-01-15T12:35:00.000Z",
      "lastUpdatedAt": "2024-01-15T12:35:00.000Z"
    }
  }
}
```

**State machine:**
`sent` → `answered_yesterday` → `answered_today` → `complete`

---

## Setup

### 1. Create the Discord bot

1. Go to <https://discord.com/developers/applications> and click **New Application**.
2. Open the **Bot** tab → click **Add Bot**.
3. Copy the **Token** → this becomes `DISCORD_TOKEN`.
4. Scroll down to **Privileged Gateway Intents** and enable:
   - **Server Members Intent** (needed to fetch role members)
   - **Message Content Intent** (needed to read DM text)
5. Go to **OAuth2 → URL Generator**, select scopes:
   - `bot` with permissions: **Send Messages**, **Read Message History**, **Use Slash Commands**
6. Open the generated URL and invite the bot to your server.

### 2. Gather IDs

Enable **Developer Mode** in Discord (User Settings → Advanced → Developer Mode), then:

| Value | How to get |
|---|---|
| `DISCORD_GUILD_ID` | Right-click your server icon → Copy Server ID |
| `DISCORD_ROLE_ID` | Server Settings → Roles → right-click @dev-team → Copy Role ID |
| `DISCORD_OWNER_ID` | Right-click your own name → Copy User ID |

### 3. Configure ClickUp

1. In ClickUp: click your **avatar** → **Settings** → **Apps** → **API Token** → copy it.
2. Open the task where you want stand-up comments posted.
   The URL looks like `app.clickup.com/t/{TASK_ID}` — copy the task ID.

### 4. Create `.env`

```bash
cp .env.example .env
# then edit .env with your real values
```

### 5. Install and run

```bash
npm install
npm start
```

---

## Commands (send in any guild channel)

Only the user whose ID matches `DISCORD_OWNER_ID` can use these.

| Command | Description |
|---|---|
| `!start-standup` | Manually trigger the stand-up DMs |
| `!show-answers [YYYY-MM-DD]` | Display all answers for a day |
| `!missing [YYYY-MM-DD]` | List users who haven't answered |
| `!post-clickup [YYYY-MM-DD]` | Manually ship answers to ClickUp |
| `!help` | Show the command list |

Date defaults to today if omitted.

## User DM commands

Any stand-up participant can type these in the bot's DM:

| Command | Description |
|---|---|
| `!restart` | Clear today's answers and start over (valid before the deadline) |

---

## Schedule configuration

`STANDUP_TIME` uses standard cron syntax: `MINUTE HOUR * * DAYS`

```
30 9 * * 1-5   →  9:30 AM, Monday–Friday  (default)
0 10 * * 1-5   →  10:00 AM, Monday–Friday
0 9 * * *      →  9:00 AM, every day
```

The deadline fires `DEADLINE_MINUTES` after `STANDUP_TIME`. Default: 30 min → closes at 10:00 AM.

---

## ClickUp comment format

```
# Daily Stand-up — 2024-01-15

## 👤 John Doe (@john)

---
Atualizações para: 2024-01-15

Ontem eu fiz:

🟨 Módulo de pagamento;
✅ Testes de integração;

Hoje vou focar em:

* Code review do PR #42;
* Reunião com o designer;

Bloqueios:

Nenhum.

---
[✅=Feito][🟨=Fazendo][🟫=Não trabalhado]
```

**Tip:** Users can prefix task lines with `✅`, `🟨`, or `🟫` in their DM answers and the bot will preserve them in the ClickUp comment.

---

## Deployment

### Option A — VPS with PM2 (recommended)

```bash
# On your server
npm install -g pm2
git clone <your-repo> discord-standup-bot
cd discord-standup-bot
cp .env.example .env && nano .env   # fill in values
npm install
pm2 start src/index.js --name standup-bot
pm2 save
pm2 startup   # follow the printed command to auto-start on reboot
```

### Option B — Render (free tier)

1. Push the project to a GitHub repo (make sure `.env` is in `.gitignore`).
2. Create a new **Web Service** on <https://render.com>.
3. Build command: `npm install`
4. Start command: `npm start`
5. Add all env vars in **Environment → Add Environment Variable**.

> Render free tier spins down after inactivity. Use the paid tier or a VPS for a bot that needs to be always-on.

---

## Local testing

```bash
# 1. Set STANDUP_TIME to 2 minutes from now so you don't wait
#    e.g. if it's 14:23, set:  STANDUP_TIME=25 14 * * *
#    and:                       DEADLINE_MINUTES=2

# 2. Start the bot
npm start

# 3. In Discord, send to a guild channel (as the owner):
!start-standup

# 4. The bot will DM every @dev-team member. Reply to the 3 questions.

# 5. Check collected answers:
!show-answers

# 6. Manually push to ClickUp (or wait for the deadline cron):
!post-clickup
```

---

## Extending

- **SQLite storage:** replace `src/storage.js` with `better-sqlite3` queries using the same interface (`getEntry`, `setEntry`, `getDayEntries`).
- **Per-user deadline DM reminders:** add a cron halfway between `standupTime` and `deadlineCron` that calls `missingUsersReport` and DMs stragglers.
- **Multi-server support:** parameterise `guildId` / `roleId` per server in a config map.
