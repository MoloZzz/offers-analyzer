import { Currency } from '../../../common/types/money';
import { ListingDetail } from '../../sources/ports/listing-source.port';
import { EvaluationExplanation } from '../../valuation/evaluation-explanation';
import { ValuationResult } from '../../valuation/valuation.service';

import { FLAG_LABELS } from './opportunity-message';

export interface WhyContext {
  fairValue: number;
  currency: Currency;
  sampleSize: number;
  benchmarkBase: number;
  mileageAware: boolean;
}

/** Ukrainian breakdown of how the deal score was derived — the /why command (B22). */
export function formatWhy(detail: ListingDetail, result: ValuationResult, ctx: WhyContext): string {
  const firedFromData: string[] = [];
  const firedFromDesc: string[] = [];
  for (const [code, on] of Object.entries(result.redFlags)) {
    if (!on) continue;
    const label = FLAG_LABELS[code] ?? code;
    (code.startsWith('desc_') ? firedFromDesc : firedFromData).push(label);
  }
  const mileageAdj = Math.round(ctx.fairValue - ctx.benchmarkBase);
  const verdict = result.isOpportunity
    ? '✅ Вигідно'
    : result.disqualified
      ? '⛔ Пастка (дискваліфіковано ризиком)'
      : 'ℹ️ Не дотягує до порогу / мало даних';
  const lines = [
    `🔍 Чому такий бал — ${detail.make} ${detail.model}, ${detail.year}`,
    `📊 Загальний бал: ${result.total100}/100`,
    `Ціна: ${detail.price.amount} vs Ринкова: ${ctx.fairValue} ${ctx.currency} → знижка ${result.discountPct}%`,
    `Ринкова база: ${ctx.benchmarkBase} ${ctx.currency} (${ctx.mileageAware ? 'когорта з урахуванням пробігу' : 'когорта без пробігу'}, вибірка ${ctx.sampleSize})`,
  ];
  if (!ctx.mileageAware && mileageAdj !== 0) {
    lines.push(`Поправка на пробіг: ${mileageAdj > 0 ? '+' : ''}${mileageAdj} ${ctx.currency}`);
  }
  lines.push(
    `Розклад балу: знижка → raw ${result.raw} × впевненість ${result.confidence} × штраф ${result.penalty} = ${result.score}`,
  );
  // Per-factor composite breakdown (spec 003). Empty until factors ship (Phase F).
  for (const f of result.factors) {
    lines.push(`• ${f.factor}: ${f.subScore100}/100 — ${f.reasons.join(', ')}`);
  }
  const risks = [
    ...(firedFromData.length ? [`дані AUTO.RIA: ${firedFromData.join(', ')}`] : []),
    ...(firedFromDesc.length ? [`опис: ${firedFromDesc.join(', ')}`] : []),
  ];
  lines.push(`⚠️ Ризики: ${risks.length ? risks.join(' · ') : 'не виявлено'}`);
  lines.push(`Вердикт: ${verdict}`);
  lines.push(`🔗 ${detail.url}`);
  return lines.join('\n');
}

/** Render a persisted B23 explanation snapshot without re-fetching or re-scoring the listing. */
export function formatStoredWhy(explanation: EvaluationExplanation): string {
  const firedFromData: string[] = [];
  const firedFromDesc: string[] = [];
  const firedDerived: string[] = [];
  for (const flag of explanation.firedFlags) {
    const label = FLAG_LABELS[flag.code] ?? flag.code;
    if (flag.source === 'description') firedFromDesc.push(label);
    else if (flag.source === 'derived') firedDerived.push(label);
    else firedFromData.push(label);
  }

  const verdict = explanation.isOpportunity
    ? '✅ Вигідно'
    : explanation.disqualified
      ? '⛔ Пастка (дискваліфіковано ризиком)'
      : 'ℹ️ Не дотягує до порогу / мало даних';

  const lines = [
    `🔍 Чому такий бал — ${explanation.listing.make} ${explanation.listing.model}, ${explanation.listing.year}`,
    `📊 Загальний бал: ${explanation.total100}/100`,
    `Ціна: ${explanation.listing.askingAmount} vs Ринкова: ${explanation.fairValueAdjusted} ${explanation.listing.currency} → знижка ${explanation.discountPct}%`,
    `Ринкова база: ${explanation.fairValueBase} ${explanation.listing.currency} (${explanation.cohort.mileageAware ? 'когорта з урахуванням пробігу' : 'когорта без пробігу'}, вибірка ${explanation.cohort.sampleSize})`,
    `Параметри: ParameterSet v${explanation.parameterSetVersion}, поріг ${explanation.thresholdUsed}, ${new Date(explanation.evaluatedAt).toLocaleString('uk-UA')}`,
  ];
  if (!explanation.cohort.mileageAware && explanation.mileageAdjustment !== 0) {
    lines.push(
      `Поправка на пробіг: ${explanation.mileageAdjustment > 0 ? '+' : ''}${explanation.mileageAdjustment} ${explanation.listing.currency}`,
    );
  }
  lines.push(
    `Розклад балу: знижка → raw ${explanation.raw} × впевненість ${explanation.confidence} × штраф ${explanation.penalty} = ${explanation.score}`,
  );
  for (const f of explanation.factors) {
    lines.push(`• ${f.factor}: ${f.subScore100}/100 — ${f.reasons.join(', ')}`);
  }
  const risks = [
    ...(firedFromData.length ? [`дані AUTO.RIA: ${firedFromData.join(', ')}`] : []),
    ...(firedFromDesc.length ? [`опис: ${firedFromDesc.join(', ')}`] : []),
    ...(firedDerived.length ? [`оцінка: ${firedDerived.join(', ')}`] : []),
  ];
  lines.push(`⚠️ Ризики: ${risks.length ? risks.join(' · ') : 'не виявлено'}`);
  lines.push(`Вердикт: ${verdict}`);
  lines.push(`🔗 ${explanation.listing.url}`);
  return lines.join('\n');
}
