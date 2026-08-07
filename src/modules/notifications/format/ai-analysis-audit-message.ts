import { AiAnalysisAuditDigest } from '../../analysis/ai-analysis-audit';

/**
 * SPEC-017 T031 — the `/ai_audit` reply.
 *
 * Aggregate counts only. Stored model text never appears here: an audit answers "what did this
 * feature do and what did it cost", and one listing's advisory opinion belongs in `/analyze_ai`,
 * where it arrives with its warnings, its labels, and its capture time attached.
 */
export function formatAiAnalysisAudit(digest: AiAnalysisAuditDigest): string {
  if (!digest.hasData) {
    return (
      '🤖 Аудит AI-аналізу\n' +
      `За останні ${digest.windowDays} дн. записів немає. Функція вимкнена за замовчуванням — ` +
      'це очікуваний стан, поки не пройдені операторські гейти.'
    );
  }

  const lines = [
    `🤖 Аудит AI-аналізу за ${digest.windowDays} дн.`,
    `Записів: ${digest.total} · запитів до провайдера: ${digest.providerAttempts} · ` +
      `з кешу: ${digest.cacheHits} · відмов: ${digest.refusals}`,
    `Влучань у кеш: ${formatRate(digest.cacheHitRate)}`,
    `Стани: ${formatCounts(digest.statusCounts)}`,
    `Причини: ${formatCounts(digest.reasonCounts)}`,
    `Моделі: ${formatCounts(digest.modelCounts)} · промпти: ${formatCounts(digest.promptVersionCounts)}`,
    `За адміністратором: ${formatCounts(digest.actorCounts)}`,
  ];

  if (digest.budget) {
    lines.push(
      `Бюджет ai_analysis: ${digest.budget.used}/${digest.budget.allocation || '—'} за місяць ` +
        '(окрема алокація, не з пулу AUTO.RIA)',
    );
  } else {
    lines.push('Бюджет ai_analysis: алокація цього місяця ще не створена.');
  }

  if (digest.lastCapturedAt) {
    lines.push(`Останній запис: ${digest.lastCapturedAt.toLocaleString('uk-UA')}`);
  }

  lines.push(
    'Записи незмінні: повторний аналіз створює новий рядок, старі не редагуються. Жоден із них ' +
      'не впливає на бал, поріг чи набір сповіщень.',
  );
  return lines.join('\n');
}

function formatRate(rate: number | null): string {
  return rate === null ? 'немає викликів' : `${Math.round(rate * 100)}%`;
}

function formatCounts(counts: Record<string, number>): string {
  const items = Object.entries(counts)
    .filter(([, count]) => count > 0)
    .sort(([left], [right]) => left.localeCompare(right));
  return items.length > 0 ? items.map(([name, count]) => `${name}: ${count}`).join(', ') : 'немає';
}
