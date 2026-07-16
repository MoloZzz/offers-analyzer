import { Listing } from '../../listings/entities/listing.entity';
import { Opportunity } from '../../valuation/entities/opportunity.entity';

/** Human-readable Ukrainian labels for red-flag codes. */
const FLAG_LABELS: Record<string, string> = {
  suspicious_discount: 'підозріло дешево',
  damaged: 'була в ДТП',
  salvage: 'на запчастини',
  confiscated: 'конфіскат',
  under_credit: 'під кредитом',
  unclear_customs: 'нерозмитнена',
  abroad: 'за кордоном',
  no_vin_report: 'немає VIN-звіту',
};

/**
 * Builds the Telegram alert. Leads with the deal score, explains the reasoning
 * (asking vs market, discount, confidence, risks), and always ends with the AUTO.RIA
 * backlink (ToS + FR-007). US3.
 */
export function formatOpportunity(op: Opportunity, listing: Listing): string {
  const firedFlags = Object.entries(op.redFlags)
    .filter(([, fired]) => fired)
    .map(([code]) => FLAG_LABELS[code] ?? code);
  const risks = firedFlags.length > 0 ? firedFlags.join(', ') : 'не виявлено';

  const seller =
    listing.sellerType === 'dealer'
      ? 'дилер'
      : listing.sellerType === 'private'
        ? 'приватний'
        : 'невідомо';
  const mileage = listing.mileage != null ? `${listing.mileage} тис. км` : 'пробіг н/д';
  const emoji = op.score >= 0.6 ? '🔥' : '👍';

  return [
    `${emoji} ${listing.make} ${listing.model}, ${listing.year}, ${mileage}`,
    `💰 Вигідність: ${signed(op.score)} (−1…+1)`,
    `Ціна: ${fmt(op.askingValue)} ${op.currency}  ·  Ринкова: ${fmt(op.fairValue)} ${op.currency}  ·  −${op.discountPct}%`,
    `Впевненість: ${op.confidence}`,
    `Продавець: ${seller}`,
    `⚠️ Ризики: ${risks}`,
    `🔗 ${listing.url}`,
  ].join('\n');
}

function signed(n: number): string {
  return n > 0 ? `+${n}` : `${n}`;
}

function fmt(n: number): string {
  return n.toLocaleString('uk-UA');
}
