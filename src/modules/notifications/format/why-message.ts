import { Currency } from '../../../common/types/money';
import { ListingDetail } from '../../sources/ports/listing-source.port';
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
    `Ціна: ${detail.price.amount} vs Ринкова: ${ctx.fairValue} ${ctx.currency} → знижка ${result.discountPct}%`,
    `Ринкова база: ${ctx.benchmarkBase} ${ctx.currency} (${ctx.mileageAware ? 'когорта з урахуванням пробігу' : 'когорта без пробігу'}, вибірка ${ctx.sampleSize})`,
  ];
  if (!ctx.mileageAware && mileageAdj !== 0) {
    lines.push(`Поправка на пробіг: ${mileageAdj > 0 ? '+' : ''}${mileageAdj} ${ctx.currency}`);
  }
  lines.push(
    `Розклад балу: знижка → raw ${result.raw} × впевненість ${result.confidence} × штраф ${result.penalty} = ${result.score}`,
  );
  const risks = [
    ...(firedFromData.length ? [`дані AUTO.RIA: ${firedFromData.join(', ')}`] : []),
    ...(firedFromDesc.length ? [`опис: ${firedFromDesc.join(', ')}`] : []),
  ];
  lines.push(`⚠️ Ризики: ${risks.length ? risks.join(' · ') : 'не виявлено'}`);
  lines.push(`Вердикт: ${verdict}`);
  lines.push(`🔗 ${detail.url}`);
  return lines.join('\n');
}
