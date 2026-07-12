import { Listing } from '../../listings/entities/listing.entity';
import { Opportunity } from '../../valuation/entities/opportunity.entity';

/** Builds the Telegram alert text. Always ends with the AUTO.RIA backlink (ToS + FR-007). */
export function formatOpportunity(op: Opportunity, listing: Listing): string {
  const firedFlags = Object.entries(op.redFlags)
    .filter(([, fired]) => fired)
    .map(([code]) => code);
  const flags = firedFlags.length > 0 ? firedFlags.join(', ') : 'немає';
  const seller =
    listing.sellerType === 'dealer'
      ? 'дилер'
      : listing.sellerType === 'private'
        ? 'приватний'
        : 'невідомо';
  const mileage = listing.mileage != null ? `${listing.mileage} тис. км` : 'пробіг н/д';

  return [
    `🚗 ${listing.make} ${listing.model}, ${listing.year}, ${mileage}`,
    `Ціна: ${fmt(op.askingValue)} ${op.currency}  |  Ринкова (сер.): ${fmt(op.fairValue)} ${op.currency}`,
    `Знижка: ${op.discountPct}%  |  Впевненість: ${op.confidence}`,
    `Прапорці ризику: ${flags}`,
    `Продавець: ${seller}`,
    `🔗 ${listing.url}`,
  ].join('\n');
}

function fmt(n: number): string {
  return n.toLocaleString('uk-UA');
}
