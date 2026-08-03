/**
 * Renders the spec-018 accident-clamp rollout report for administrators.
 *
 * FR-007: this report authorizes a **review**, never a flip. The wording says so explicitly and
 * states the outcome that argues against flipping, so a reader skimming the numbers cannot mistake
 * a large suppressed count for a mandate.
 */
import type {
  AccidentBucketStats,
  AccidentOutcomeStats,
  AccidentShadowDigest,
} from '../../query/accident-shadow-report';

const BUCKET_LABELS: Record<string, string> = {
  cosmetic: 'косметичні',
  moderate: 'помірні',
  unknown: 'невстановлено',
  severe: 'важкі',
};

export function formatAccidentShadow(digest: AccidentShadowDigest | null): string {
  const header = '🧪 Тіньовий звіт: градація ДТП (spec 018, фаза 2)';
  if (!digest || !digest.hasData) {
    return (
      `${header}\n` +
      'Записів із вердиктом ще немає. Класифікатор працює в тіньовому режимі й нічого не змінює; ' +
      'звіт наповниться після кількох циклів опитування.'
    );
  }

  const lines = [
    header,
    `Оцінок із вердиктом: ${digest.total}.`,
    `Заблоковано поточним відсіканням (без «важких»): ${digest.suppressedTotal}; ` +
      `з них подолали б поріг: ${digest.wouldHaveAlertedTotal}.`,
    '',
    'За рівнями:',
  ];

  for (const stats of digest.bucketStats) {
    if (stats.total === 0) continue;
    lines.push(`• ${bucketLine(stats)}`);
  }

  lines.push('', `Що сталося з ${digest.wouldHaveAlertedTotal} заблокованими кандидатами:`);
  lines.push(`  ${outcomeLine(digest.outcomesTotal)}`);

  if (Object.keys(digest.reasonCounts).length > 0) {
    lines.push('', `Підстави вердикту: ${formatCounts(digest.reasonCounts)}.`);
  }

  if (digest.factorsActive) {
    lines.push(
      '',
      '⚠️ Композитні фактори активні, тому «подолали б поріг» рахується за ціновим ядром до ' +
        'відсікання й може занижувати підсумковий бал.',
    );
  }

  lines.push(
    '',
    'Цей звіт дає підставу для *перегляду*, а не для перемикання. Бал, поріг, ParameterSet і набір ' +
      'сповіщень не змінені.',
    'Якщо заблоковані оголошення виявились стабільно поганими угодами (часті перевиставлення, ' +
      'зниження ціни, довгий час експозиції) — правильний висновок саме НЕ перемикати: відсікання ' +
      'було заслуженим.',
  );
  return lines.join('\n');
}

function bucketLine(stats: AccidentBucketStats): string {
  const label = BUCKET_LABELS[stats.bucket] ?? stats.bucket;
  const parts = [
    `${label}: ${stats.total}`,
    `підтверджено VIN: ${stats.corroborated}`,
    `заблоковано: ${stats.suppressed}`,
    `подолали б поріг: ${stats.wouldHaveAlerted}`,
  ];
  return parts.join('; ');
}

function outcomeLine(outcomes: AccidentOutcomeStats): string {
  if (outcomes.observed === 0) {
    return 'жодне ще не зникло з ринку — результати з’являться пізніше.';
  }
  return (
    `зникло з ринку ${outcomes.observed}; перевиставлено ${outcomes.relisted}; ` +
    `зі зниженням ціни ${outcomes.hadPriceCut}; медіанний час експозиції ` +
    `${outcomes.medianDomDays ?? '—'} дн.`
  );
}

function formatCounts(counts: Record<string, number>): string {
  const items = Object.entries(counts)
    .filter(([, count]) => count > 0)
    .sort(([left], [right]) => left.localeCompare(right));
  return items.length > 0 ? items.map(([name, count]) => `${name}: ${count}`).join(', ') : 'немає';
}
