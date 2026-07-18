import { Currency } from '../../../common/types/money';
import { Listing } from '../../listings/entities/listing.entity';
import { ListingDetail, SellerType } from '../../sources/ports/listing-source.port';
import { Opportunity } from '../../valuation/entities/opportunity.entity';
import { ValuationResult } from '../../valuation/valuation.service';

/** Human-readable Ukrainian labels for red-flag codes. */
export const FLAG_LABELS: Record<string, string> = {
  suspicious_discount: 'підозріло дешево',
  damaged: 'була в ДТП',
  salvage: 'на запчастини',
  confiscated: 'конфіскат',
  under_credit: 'під кредитом',
  unclear_customs: 'нерозмитнена',
  abroad: 'за кордоном',
  no_vin_report: 'немає VIN-звіту',
  desc_after_accident: 'опис: після ДТП',
  desc_not_running: 'опис: не на ходу / на запчастини',
  desc_needs_repair: 'опис: потребує ремонту',
  desc_mechanical_issue: 'опис: проблеми з двигуном/КПП',
  suspicious_low_mileage: 'підозріло малий пробіг для віку',
  unverified_bargain: 'завелика знижка без VIN-перевірки',
};

function risksLabel(redFlags: Record<string, boolean>): string {
  const fired = Object.entries(redFlags)
    .filter(([, on]) => on)
    .map(([code]) => FLAG_LABELS[code] ?? code);
  return fired.length > 0 ? fired.join(', ') : 'не виявлено';
}

function sellerLabel(sellerType: SellerType): string {
  return sellerType === 'dealer' ? 'дилер' : sellerType === 'private' ? 'приватний' : 'невідомо';
}

function mileageLabel(mileage?: number | null): string {
  return mileage != null ? `${mileage} тис. км` : 'пробіг н/д';
}

function scoreEmoji(score: number): string {
  return score >= 0.6 ? '🔥' : '👍';
}

/**
 * Opportunity alert — leads with the deal score, explains the reasoning, ends with the AUTO.RIA
 * backlink (ToS + FR-007). US3.
 */
export function formatOpportunity(op: Opportunity, listing: Listing): string {
  return [
    `${scoreEmoji(op.score)} ${listing.make} ${listing.model}, ${listing.year}, ${mileageLabel(listing.mileage)}`,
    `💰 Вигідність: ${signed(op.score)} (−1…+1)`,
    `Ціна: ${fmt(op.askingValue)} ${op.currency}  ·  Ринкова: ${fmt(op.fairValue)} ${op.currency}  ·  −${op.discountPct}%`,
    `Впевненість: ${op.confidence}`,
    `Продавець: ${sellerLabel(listing.sellerType)}`,
    `⚠️ Ризики: ${risksLabel(op.redFlags)}`,
    `🔗 ${listing.url}`,
  ].join('\n');
}

/** Price-drop alert: a previously-seen listing got cheaper and is now a good deal (FR-009). */
export function formatPriceDrop(op: Opportunity, listing: Listing, oldAmount: number): string {
  const dropPct = oldAmount > 0 ? Math.round(((oldAmount - op.askingValue) / oldAmount) * 100) : 0;
  return [
    `📉 Ціна знижена: ${listing.make} ${listing.model}, ${listing.year}`,
    `Було ${fmt(oldAmount)} → стало ${fmt(op.askingValue)} ${op.currency} (−${dropPct}%)`,
    `💰 Вигідність: ${signed(op.score)}  ·  від ринку −${op.discountPct}%`,
    `🔗 ${listing.url}`,
  ].join('\n');
}

/** On-demand `/check` reply — assessment of a single listing the user asked about. */
export function formatAssessment(
  detail: ListingDetail,
  result: ValuationResult,
  fairValue: number,
  currency: Currency,
): string {
  const verdict = result.isOpportunity ? '✅ Вигідна пропозиція' : `ℹ️ ${result.reason}`;
  return [
    `${scoreEmoji(result.score)} ${detail.make} ${detail.model}, ${detail.year}, ${mileageLabel(detail.mileage)}`,
    `💰 Вигідність: ${signed(result.score)} (−1…+1)`,
    `Ціна: ${fmt(detail.price.amount)} ${currency}  ·  Ринкова: ${fmt(fairValue)} ${currency}  ·  −${result.discountPct}%`,
    `Впевненість: ${result.confidence}`,
    `Продавець: ${sellerLabel(detail.sellerType)}`,
    `⚠️ Ризики: ${risksLabel(result.redFlags)}`,
    verdict,
    `🔗 ${detail.url}`,
  ].join('\n');
}

function signed(n: number): string {
  return n > 0 ? `+${n}` : `${n}`;
}

function fmt(n: number): string {
  return n.toLocaleString('uk-UA');
}
