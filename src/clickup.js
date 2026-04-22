const { CLICKUP_CONFIG } = require('../config');
const formatStore = require('./formatStore');

// ─── Format helpers ──────────────────────────────────────────────────────────

function formatUserBlock(entry) {
  const labels = formatStore.getLabels();
  const yesterdayLines = splitLines(entry.yesterday);
  const todayLines = splitLines(entry.today);
  const blockersText = normalizeBlockers(entry.blockers, labels.none);

  const EMOJI_PREFIX = /^[✅🟨🟫]\s*/u;

  const yesterdaySection = yesterdayLines
    .map((line) => (EMOJI_PREFIX.test(line) ? `${line};` : `🟨 ${line};`))
    .join('\n');

  const todaySection = todayLines.map((line) => `* ${line};`).join('\n');

  return [
    `## 👤 ${entry.displayName} (@${entry.username})`,
    '',
    labels.yesterday,
    '',
    yesterdaySection,
    '',
    labels.today,
    '',
    todaySection,
    '',
    labels.blockers,
    '',
    blockersText,
    '',
  ].join('\n');
}

function formatPageContent(date, answers) {
  const { legend, header } = formatStore.get();
  const labels = formatStore.getLabels();

  const parts = [];

  if (header) {
    parts.push(`> ${labels.autoHeader}`, '', '---', '');
  }

  parts.push(answers.map(formatUserBlock).join('\n---\n\n'));

  if (legend) {
    parts.push(`\n---\n${labels.legend}`);
  }

  return parts.join('\n');
}

// ─── ClickUp Docs API (v3) ────────────────────────────────────────────────────

async function postDailyStandup(date, answers) {
  const { apiKey, workspaceId, docId, baseUrl } = CLICKUP_CONFIG;

  if (!apiKey || !workspaceId || !docId) {
    console.warn('[ClickUp] CLICKUP_API_KEY, CLICKUP_WORKSPACE_ID or CLICKUP_DOC_ID not set — skipping.');
    return null;
  }

  if (answers.length === 0) {
    console.log('[ClickUp] No completed answers to post for', date);
    return null;
  }

  const { titlePrefix } = formatStore.get();
  const [year, month, day] = date.split('-');
  const pageTitle = `${titlePrefix} ${day}/${month}/${year}`;
  const content = formatPageContent(date, answers);

  const url = `${baseUrl}/workspaces/${workspaceId}/docs/${docId}/pages`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: pageTitle,
      content,
      content_format: 'text/md',
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`ClickUp API ${response.status}: ${text}`);
  }

  const result = await response.json();
  console.log(`[ClickUp] Page "${pageTitle}" created. ID: ${result.id ?? result.page?.id}`);
  return result;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function splitLines(text) {
  if (!text) return ['(sem resposta)'];
  return text
    .split('\n')
    .map((l) => l.replace(/^[-*•]\s*/, '').trim())
    .filter(Boolean);
}

function normalizeBlockers(text, noneLabel = 'Nenhum.') {
  if (!text) return noneLabel;
  const lower = text.toLowerCase().trim();
  if (['nenhum', 'none', 'n/a', 'não', 'nao'].includes(lower)) return noneLabel;
  return text;
}

module.exports = { postDailyStandup, formatPageContent };
