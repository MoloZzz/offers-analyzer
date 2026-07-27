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
  return sellerType === 'dealer'
    ? 'дилер'
    : sellerType === 'private'
      ? 'приватний'
      : 'невідомо';
}

function mileageLabel(mileage?: number | null): string {
  return mileage != null ? `${mileage} тис. км` : 'пробіг н/д';
}

function regionLabel(listing: Listing): string {
  if (listing.stateId == null) return 'н/д';
  return listing.cityId != null ? `${listing.stateId}/${listing.cityId}` : `${listing.stateId}`;
}

function scoreEmoji(score: number): string {
  return score >= 0.6 ? '🚗' : '📌';
}

/**
 * Opportunity alert includes the contract-required region and sample-size count, and ends
 * with the AUTO.RIA backlink (ToS + FR-007). US3.
 */
export function formatOpportunity(op: Opportunity, listing: Listing): string {
  return [
    `🚗 ${listing.make} ${listing.model}, ${listing.year}, ${mileageLabel(listing.mileage)} — ${regionLabel(listing)}`,
    `Ціна: ${fmt(op.askingValue)} ${op.currency}   |   Ринкова (сер.): ${fmt(op.fairValue)} ${op.currency}`,
    `Знижка: ${op.discountPct}%   |   Впевненість: ${op.confidence} (${op.sampleSize} оголошень)`,
    `Рейтинг: ${scoreEmoji(op.score)} ${signed(op.score)} (-1...+1)`,
    `Перевірки: ${risksLabel(op.redFlags)}`,
    `Продавець: ${sellerLabel(listing.sellerType)}`,
    `🔗 ${listing.url}`,
  ].join('\n');
}

/** Price-drop alert: a previously-seen listing got cheaper and is now a good deal (FR-009). */
export function formatPriceDrop(op: Opportunity, listing: Listing, oldAmount: number): string {
  const dropPct = oldAmount > 0 ? Math.round(((oldAmount - op.askingValue) / oldAmount) * 100) : 0;
  return [
    `📉 Ціна знижена: ${listing.make} ${listing.model}, ${listing.year}`,
    `Було ${fmt(oldAmount)} → стало ${fmt(op.askingValue)} ${op.currency} (-${dropPct}%)`,
    `💰 Вигідність: ${signed(op.score)}  ·  від ринку -${op.discountPct}%`,
    `🔗 ${listing.url}`,
  ].join('\n');
}

/** On-demand `/check` reply: assessment of a single listing the user asked about. */
export function formatAssessment(
  detail: ListingDetail,
  result: ValuationResult,
  fairValue: number,
  currency: Currency,
): string {
  const verdict = result.isOpportunity ? '✅ Вигідна пропозиція' : `ℹ️ ${result.reason}`;
  return [
    `${scoreEmoji(result.score)} ${detail.make} ${detail.model}, ${detail.year}, ${mileageLabel(detail.mileage)}`,
    `📊 Загальний бал: ${result.total100}/100`,
    `💰 Вигідність: ${signed(result.score)} (-1...+1)`,
    `Ціна: ${fmt(detail.price.amount)} ${currency}  ·  Ринкова: ${fmt(fairValue)} ${currency}  ·  -${result.discountPct}%`,
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
