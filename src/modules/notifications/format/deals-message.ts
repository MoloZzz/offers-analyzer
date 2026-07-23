import { marginStats, realizedDom, realizedMargin } from '../../calibration/deal-margin';
import { DealOutcome } from '../../calibration/entities/deal-outcome.entity';

/** A deal paired with the minimal listing context needed to name it in the message. */
export interface DealView {
  deal: DealOutcome;
  listing?: { make: string; model: string; year: number; url: string };
}

function label(view: DealView): string {
  const l = view.listing;
  return l ? `${l.make} ${l.model}, ${l.year}` : 'оголошення';
}

function urlLine(view: DealView): string {
  return view.listing ? `\n  ${view.listing.url}` : '';
}

function daysSince(from: Date | null, now: Date): number | null {
  if (from == null) return null;
  return Math.max(0, Math.round((now.getTime() - from.getTime()) / (24 * 60 * 60 * 1000)));
}

/** Ukrainian /deals message: open deals (bought, unsold) + closed deals + a realized-margin footer. */
export function formatDeals(open: DealView[], closed: DealView[], now: Date = new Date()): string {
  if (open.length === 0 && closed.length === 0) {
    return 'Ще немає записаних угод. Познач результат кнопками під сповіщенням або /deal <посилання>.';
  }

  const lines: string[] = ['🚗 Угоди'];

  if (open.length > 0) {
    lines.push('', 'Відкриті (куплено, ще не продано):');
    for (const v of open) {
      const held = daysSince(v.deal.boughtAt, now);
      const heldStr = held != null ? `, тримаю ${held} дн.` : '';
      lines.push(`• ${label(v)}${heldStr}${urlLine(v)}`);
    }
  }

  if (closed.length > 0) {
    lines.push('', 'Закриті:');
    for (const v of closed) {
      const margin = realizedMargin(v.deal);
      const dom = realizedDom(v.deal);
      const marginStr = margin != null ? `маржа $${margin}` : 'маржа —';
      const domStr = dom != null ? `, ${dom} дн.` : '';
      lines.push(`• ${label(v)} — ${marginStr}${domStr}${urlLine(v)}`);
    }
  }

  const stats = marginStats(closed.map((v) => v.deal));
  if (stats.closed > 0) {
    const loss = stats.lossShare != null ? Math.round(stats.lossShare * 100) : 0;
    const domStr = stats.medianDom != null ? ` · медіанний DOM ${stats.medianDom} дн.` : '';
    lines.push(
      '',
      `Разом закритих: ${stats.closed} · медіанна маржа $${stats.medianMarginUsd} · збиткових ${loss}%${domStr}`,
    );
  }

  return lines.join('\n');
}
