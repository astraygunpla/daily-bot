const { CLICKUP_CONFIG } = require('../config');

// ─── Format helpers ──────────────────────────────────────────────────────────

function formatUserBlock(entry) {
  const yesterdayLines = splitLines(entry.yesterday);
  const todayLines = splitLines(entry.today);
  const blockersText = normalizeBlockers(entry.blockers);

  const EMOJI_PREFIX = /^[✅🟨🟫]\s*/u;

  const yesterdaySection = yesterdayLines
    .map((line) => (EMOJI_PREFIX.test(line) ? `${line};` : `🟨 ${line};`))
    .join('\n');

  const todaySection = todayLines.map((line) => `* ${line};`).join('\n');

  return [
    `## 👤 ${entry.displayName} (@${entry.username})`,
    '',
    `Ontem eu fiz:`,
    '',
    yesterdaySection,
    '',
    `Hoje vou focar em:`,
    '',
    todaySection,
    '',
    `Bloqueios:`,
    '',
    blockersText,
    '',
  ].join('\n');
}

function formatPageContent(date, answers) {
  const header = [
    `> Gerado automaticamente pelo bot de stand-up.`,
    '',
    `---`,
    '',
  ].join('\n');

  const body = answers.map(formatUserBlock).join('\n---\n\n');
  const legend = `\n---\n[✅=Feito][🟨=Fazendo][🟫=Não trabalhado]`;

  return header + body + legend;
}

// ─── ClickUp Docs API (v3) ────────────────────────────────────────────────────
// Creates a new page inside the configured document for each daily stand-up.
// Endpoint: POST /api/v3/workspaces/{workspaceId}/docs/{docId}/pages

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

  const [year, month, day] = date.split('-');
  const pageTitle = `Stand-up ${day}/${month}/${year}`;
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

function normalizeBlockers(text) {
  if (!text) return 'Nenhum.';
  const lower = text.toLowerCase().trim();
  if (['nenhum', 'none', 'n/a', 'não', 'nao'].includes(lower)) return 'Nenhum.';
  return text;
}

module.exports = { postDailyStandup, formatPageContent };
