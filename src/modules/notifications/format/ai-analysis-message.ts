import { RepairRiskContradiction } from '../../analysis/analysis-contradiction';
import { AnalysisOutput, AnalysisWarningSeverity } from '../../analysis/analysis.types';

/**
 * SPEC-017 T024 — the advisory-analysis reply (FR-010, FR-011, ADR-0019 §8).
 *
 * Deliberately **not** part of the SPEC-016 breakdown builder. That renderer exists to present the
 * deterministic evaluation as one coherent thing; the model's opinion must stay visibly outside it.
 * Sharing a renderer would erode the separation one small edit at a time, which is exactly how an
 * advisory number acquires de-facto authority.
 *
 * Order is a requirement, not a style choice: warnings → checklist → questions → score. What the
 * operator can act on comes first, and the number they might over-trust comes last, in its own
 * labelled section that says what it is not.
 */
export interface AiAnalysisView {
  make: string;
  model: string;
  year: number;
  url: string;
  modelId: string;
  promptVersion: string;
  capturedAt: Date;
  output: AnalysisOutput;
  /** Set when the answer is served from a stored record rather than a fresh call (FR-005). */
  cached?: boolean;
  /** A disagreement with a curated repair-risk entry, shown side by side and never resolved. */
  contradiction?: RepairRiskContradiction | null;
}

const TIER_LABELS: Record<RepairRiskContradiction['curatedTier'], string> = {
  LOW: 'низький ризик ремонту',
  MEDIUM: 'середній ризик ремонту',
  HIGH: 'високий ризик ремонту',
};

const VIA_LABELS: Record<RepairRiskContradiction['curatedVia'], string> = {
  model: 'моделлю авто',
  make: 'маркою',
  pattern: 'патерном',
};

const SEVERITY_LABELS: Record<AnalysisWarningSeverity, string> = {
  high: '🔴 висока',
  medium: '🟠 середня',
  low: '🟡 низька',
};

export function formatAiAnalysis(view: AiAnalysisView): string {
  const { output } = view;
  const lines: string[] = [
    `🤖 AI-аналіз (дорадчий) — ${view.make} ${view.model}, ${view.year}`,
    view.url,
    '',
    'Це думка мовної моделі, а не оцінка бота. Вона не впливає на бал, поріг чи відбір оголошень.',
  ];

  lines.push('', '⚠️ Ризики:');
  if (output.warnings.length === 0) {
    lines.push('• модель не назвала жодного ризику');
  } else {
    for (const warning of output.warnings) {
      const cost = warning.estimatedCostUsd != null ? ` · ~$${Math.round(warning.estimatedCostUsd)}` : '';
      lines.push(`• [${SEVERITY_LABELS[warning.severity]}] ${warning.code}${cost}`, `  ${warning.rationale}`);
    }
  }

  if (output.inspectionChecklist.length) {
    lines.push('', '🔍 Що перевірити на огляді:');
    lines.push(...output.inspectionChecklist.map((item) => `• ${item}`));
  }

  if (output.sellerQuestions.length) {
    lines.push('', '❓ Що запитати в продавця:');
    lines.push(...output.sellerQuestions.map((item) => `• ${item}`));
  }

  if (output.reliabilityNotes.length) {
    // FR-011: these are model claims about typical failures. They are labelled unverified here and
    // are never written into the curated repair-risk tables by any automatic path.
    lines.push('', '📚 Твердження моделі про надійність — не перевірені, не з наших таблиць:');
    lines.push(...output.reliabilityNotes.map((item) => `• ${item}`));
  }

  if (view.contradiction) lines.push('', ...contradictionLines(view.contradiction));

  lines.push(
    '',
    '— — —',
    `Суб'єктивна оцінка моделі: ${formatScore(output.advisoryScore)} з 10.`,
    `Це не «Бал угоди» і не порівнюється з ним. ${output.advisoryScoreRationale}`,
  );

  lines.push(
    '',
    view.cached
      ? `Збережена відповідь від ${view.capturedAt.toLocaleString('uk-UA')} (без нового запиту).`
      : `Отримано ${view.capturedAt.toLocaleString('uk-UA')}.`,
    `Модель: ${view.modelId} · промпт: ${view.promptVersion}`,
  );

  return lines.join('\n');
}

/**
 * T033 — both sides, side by side, with the conflict named and nothing reconciled (FR-011).
 *
 * The operator is the only party with standing to judge here: the curated table is a human-edited,
 * versioned artefact, and the model's claim is unverified opinion. So this renders the disagreement
 * and stops. No automatic path writes the model's claim into the curated table, and none exists.
 */
function contradictionLines(c: RepairRiskContradiction): string[] {
  const curated =
    `• Наша таблиця (${c.tableVersion}, за ${VIA_LABELS[c.curatedVia]}): ` +
    `${TIER_LABELS[c.curatedTier]} — ${c.curatedReason}`;
  const model =
    c.modelWarnings.length > 0
      ? c.modelWarnings.map((w) => `• Модель: ${w.code} (${SEVERITY_LABELS[w.severity]}) — ${w.rationale}`)
      : ['• Модель: жодного ризику не назвала'];

  return [
    c.kind === 'model_more_severe'
      ? '⚡ Розбіжність: модель бачить серйозніший ризик, ніж наша таблиця'
      : '⚡ Розбіжність: наша таблиця бачить серйозніший ризик, ніж модель',
    curated,
    ...model,
    'Нічого не звірено автоматично: таблицю змінює тільки людина, а твердження моделі не перевірене.',
  ];
}

/** 0–10, at most one decimal — a scale that cannot be mistaken for the 0–100 Total Deal Score. */
function formatScore(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
