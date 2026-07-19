import { ValuationResult } from '../../../valuation/valuation.service';
import { Listing } from '../../../listings/entities/listing.entity';
import { Opportunity } from '../../../valuation/entities/opportunity.entity';
import { ListingDetail } from '../../../sources/ports/listing-source.port';

/** Calculate fair value from asking price and discount percentage */
function calcFairValue(asking: number, discountPct: number): number {
  if (discountPct >= 100) return asking;
  return Math.round(asking / (1 - discountPct / 100));
}

/** Format vehicle card for inline display */
export function formatVehicleCard(detail: ListingDetail, result: ValuationResult): string {
  const lines: string[] = [];

  // Header
  lines.push(`🚗 <b>${escapeHtml(detail.make)} ${escapeHtml(detail.model)} ${detail.year}</b>`);
  lines.push('');

  // Price info
  lines.push(`💰 <b>Price:</b> ${formatCurrency(detail.price.amount, detail.price.currency)}`);
  lines.push(`📊 <b>Score:</b> ${result.total100} / 100`);
  lines.push(`📉 <b>Discount:</b> ${result.discountPct.toFixed(1)}%`);
  lines.push(`🎯 <b>Fair price:</b> ${formatCurrency(calcFairValue(detail.price.amount, result.discountPct), detail.price.currency)}`);

  // Badge
  if (result.isOpportunity) {
    lines.push('');
    lines.push('🔥 <b>GOOD DEAL</b>');
  } else if (result.disqualified) {
    lines.push('');
    lines.push('⛔ <b>DISQUALIFIED</b>');
  } else if (result.score > 0) {
    lines.push('');
    lines.push('📈 <b>ABOVE MARKET</b>');
  } else {
    lines.push('');
    lines.push('📊 <b>AT MARKET</b>');
  }

  lines.push('');
  lines.push(`🔗 ${detail.url}`);

  return lines.join('\n');
}

/** Format vehicle card with factors */
export function formatVehicleCardWithFactors(detail: ListingDetail, result: ValuationResult): string {
  const lines: string[] = [];

  // Header
  lines.push(`🚗 <b>${escapeHtml(detail.make)} ${escapeHtml(detail.model)} ${detail.year}</b>`);
  lines.push('');

  // Price info
  lines.push(`💰 <b>Price:</b> ${formatCurrency(detail.price.amount, detail.price.currency)}`);
  lines.push(`📊 <b>Total Score:</b> ${result.total100} / 100`);
  lines.push(`📉 <b>Discount:</b> ${result.discountPct.toFixed(1)}%`);
  lines.push(`🎯 <b>Fair price:</b> ${formatCurrency(calcFairValue(detail.price.amount, result.discountPct), detail.price.currency)}`);

  // Factors
  if (result.factors && result.factors.length > 0) {
    lines.push('');
    lines.push('<b>Factors:</b>');
    for (const factor of result.factors) {
      const emoji = factor.modifier > 1 ? '🟢' : factor.modifier < 1 ? '🔴' : '⚪';
      const sign = factor.modifier > 1 ? '+' : factor.modifier < 1 ? '' : '';
      lines.push(`${emoji} ${factor.factor}: ${sign}${(factor.modifier - 1) * 100}% — ${factor.reasons.join(', ')}`);
    }
  }

  // Badge
  lines.push('');
  if (result.isOpportunity) {
    lines.push('🔥 <b>GOOD DEAL</b>');
  } else if (result.disqualified) {
    lines.push('⛔ <b>DISQUALIFIED</b>');
  } else if (result.score > 0) {
    lines.push('📈 <b>ABOVE MARKET</b>');
  } else {
    lines.push('📊 <b>AT MARKET</b>');
  }

  lines.push('');
  lines.push(`🔗 ${detail.url}`);

  return lines.join('\n');
}

/** Format why/explanation message */
export function formatWhyMessage(detail: ListingDetail, result: ValuationResult, fairValue: number, currency: string, sampleSize: number, benchmarkBase: string, mileageAware: boolean): string {
  const lines: string[] = [];

  lines.push(`🔍 <b>Why this score?</b>`);
  lines.push('');
  lines.push(`🚗 ${escapeHtml(detail.make)} ${escapeHtml(detail.model)} ${detail.year}`);
  lines.push(`🔗 ${detail.url}`);
  lines.push('');

  lines.push(`📊 <b>Score breakdown:</b>`);
  lines.push(`  Total: ${result.total100} / 100`);
  lines.push(`  Price core: ${result.priceCore > 0 ? '+' : ''}${result.priceCore.toFixed(2)}`);
  lines.push(`  Confidence: ${(result.confidence * 100).toFixed(0)}%`);
  lines.push(`  Penalty: ${(result.penalty * 100).toFixed(0)}%`);
  lines.push('');

  if (result.factors && result.factors.length > 0) {
    lines.push(`🔧 <b>Factors:</b>`);
    for (const factor of result.factors) {
      const sign = factor.modifier > 1 ? '+' : '';
      lines.push(`  ${factor.factor}: ${sign}${(factor.modifier - 1) * 100}% (${factor.subScore100}/100)`);
      lines.push(`    ${factor.reasons.join(', ')}`);
    }
    lines.push('');
  }

  lines.push(`🎯 <b>Benchmark:</b>`);
  lines.push(`  Fair value: ${formatCurrency(fairValue, currency)}`);
  lines.push(`  Sample size: ${sampleSize}`);
  lines.push(`  Base: ${benchmarkBase}`);
  lines.push(`  Mileage adjusted: ${mileageAware ? 'Yes' : 'No'}`);
  lines.push('');

  if (result.redFlags) {
    const flags = Object.entries(result.redFlags).filter(([_, v]) => v).map(([k]) => k);
    if (flags.length > 0) {
      lines.push(`🚩 <b>Red flags:</b> ${flags.join(', ')}`);
    }
  }

  return lines.join('\n');
}

/** Format dashboard */
export function formatDashboard(
  stats: {
    evaluated: number;
    topDeals: number;
    profiles: number;
    lastCalibration: Date | null;
    avgScore: number;
  }
): string {
  const lines: string[] = [];

  lines.push('📊 <b>Dashboard</b>');
  lines.push('');

  lines.push(`📈 <b>Statistics:</b>`);
  lines.push(`  Evaluated listings: ${stats.evaluated}`);
  lines.push(`  Top deals found: ${stats.topDeals}`);
  lines.push(`  Active profiles: ${stats.profiles}`);
  lines.push(`  Average score: ${stats.avgScore.toFixed(1)}`);

  if (stats.lastCalibration) {
    lines.push(`  Last calibration: ${formatDate(stats.lastCalibration)}`);
  } else {
    lines.push(`  Last calibration: Never`);
  }

  return lines.join('\n');
}

/** Format settings screen */
export function formatSettings(
  notificationsEnabled: boolean,
  profilesCount: number,
  blacklistCount: number
): string {
  const lines: string[] = [];

  lines.push('⚙️ <b>Settings</b>');
  lines.push('');

  lines.push(`🔔 <b>Notifications:</b> ${notificationsEnabled ? '🟢 Enabled' : '🔴 Disabled'}`);
  lines.push(`📋 <b>Profiles:</b> ${profilesCount}`);
  lines.push(`🚫 <b>Blacklist:</b> ${blacklistCount} items`);

  return lines.join('\n');
}

/** Format notifications screen */
export function formatNotifications(enabled: boolean, muted: boolean): string {
  const lines: string[] = [];

  lines.push('🔔 <b>Notifications</b>');
  lines.push('');

  if (!enabled) {
    lines.push('Status: 🔴 <b>Disabled</b>');
  } else if (muted) {
    lines.push('Status: 🟡 <b>Muted</b>');
  } else {
    lines.push('Status: 🟢 <b>Enabled</b>');
  }

  return lines.join('\n');
}

/** Format profiles list */
export function formatProfiles(profiles: Array<{ name: string; enabled: boolean; minDealScore: number }>): string {
  const lines: string[] = [];

  lines.push('📋 <b>Monitored Profiles</b>');
  lines.push('');

  if (profiles.length === 0) {
    lines.push('No active profiles.');
    return lines.join('\n');
  }

  for (const p of profiles) {
    lines.push(`${p.enabled ? '🟢' : '🔴'} <b>${escapeHtml(p.name)}</b>`);
    lines.push(`   Threshold: ${p.minDealScore}`);
    lines.push('');
  }

  return lines.join('\n');
}

/** Format blacklist for a profile */
export function formatBlacklist(profileName: string, items: string[]): string {
  const lines: string[] = [];

  lines.push(`🚫 <b>Blacklist: ${escapeHtml(profileName)}</b>`);
  lines.push('');

  if (items.length === 0) {
    lines.push('Empty. Add items to filter out unwanted models.');
    return lines.join('\n');
  }

  for (let i = 0; i < items.length; i++) {
    lines.push(`${i + 1}. ${escapeHtml(items[i])}`);
  }

  return lines.join('\n');
}

/** Format top deals with pagination */
export function formatTopDeals(
  items: Array<{ opportunity: Opportunity; listing?: Listing }>,
  page: number,
  totalPages: number,
  limit: number
): string {
  const lines: string[] = [];

  lines.push(`🔥 <b>Top Deals</b> (${limit} per page, page ${page}/${totalPages})`);
  lines.push('');

  if (items.length === 0) {
    lines.push('No deals found.');
    return lines.join('\n');
  }

  for (let i = 0; i < items.length; i++) {
    const { opportunity, listing } = items[i];
    const name = listing ? `${listing.make} ${listing.model}, ${listing.year}` : 'Unknown';
    const link = listing ? `\n  🔗 ${listing.url}` : '';
    lines.push(`${i + 1}. <b>${escapeHtml(name)}</b> — Score: ${opportunity.score}, ${opportunity.askingValue} ${opportunity.currency}${link}`);
  }

  return lines.join('\n');
}

/** Format best candidates */
export function formatBestCandidates(
  items: Listing[],
  page: number,
  totalPages: number,
  limit: number
): string {
  const lines: string[] = [];

  lines.push(`📊 <b>Best Candidates</b> (${limit} per page, page ${page}/${totalPages})`);
  lines.push('');

  if (items.length === 0) {
    lines.push('Nothing evaluated yet.');
    return lines.join('\n');
  }

  for (let i = 0; i < items.length; i++) {
    const l = items[i];
    const score = l.lastScore ?? 0;
    lines.push(`${i + 1}. <b>${escapeHtml(l.make)} ${escapeHtml(l.model)}, ${l.year}</b> — Score: ${score}, ${l.currentAmount} ${l.currentCurrency}\n  🔗 ${l.url}`);
  }

  return lines.join('\n');
}

/** Format calibration result */
export function formatCalibrationResult(result: any): string {
  const lines: string[] = [];

  lines.push('⚖️ <b>Calibration Result</b>');
  lines.push('');

  if (result.proposed !== null) {
    lines.push(`Proposed threshold: ${result.proposed.toFixed(3)}`);
    lines.push(`Current threshold: ${result.current.toFixed(3)}`);
    lines.push(`Reason: ${result.reason}`);
  } else {
    lines.push('No change proposed.');
    lines.push(`Reason: ${result.reason}`);
  }

  return lines.join('\n');
}

/** Format weights proposal */
export function formatWeightsProposal(proposal: any, candidateVersion: number | null): string {
  const lines: string[] = [];

  lines.push('⚖️ <b>Weights Proposal</b>');
  lines.push('');

  if (candidateVersion) {
    lines.push(`Candidate version: v${candidateVersion}`);
  }

  if (proposal.proposedSoftFlagPenalty !== null) {
    lines.push(`Proposed softFlagPenalty: ${proposal.proposedSoftFlagPenalty.toFixed(2)}`);
    lines.push(`Current: ${proposal.currentSoftFlagPenalty.toFixed(2)}`);
  }

  if (proposal.reason) {
    lines.push(`Reason: ${proposal.reason}`);
  }

  return lines.join('\n');
}

/** Format parameters/thresholds */
export function formatParams(profiles: Array<{ name: string; minDealScore: number }>): string {
  const lines: string[] = [];

  lines.push('📏 <b>Current Thresholds</b>');
  lines.push('');

  for (const p of profiles) {
    lines.push(`• ${escapeHtml(p.name)}: ${p.minDealScore}`);
  }

  return lines.join('\n');
}

/** Format report */
export function formatReport(digest: any): string {
  const lines: string[] = [];

  lines.push('📊 <b>Market Report</b>');
  lines.push('');

  lines.push(`📈 <b>Score Distribution:</b>`);
  for (const [range, count] of Object.entries(digest.scoreDistribution || {})) {
    lines.push(`  ${range}: ${count}`);
  }
  lines.push('');

  if (digest.nearMisses && digest.nearMisses.length > 0) {
    lines.push(`🎯 <b>Near Misses:</b>`);
    for (const nm of digest.nearMisses) {
      lines.push(`  ${nm.label} — ${nm.score.toFixed(2)} — ${nm.url}`);
    }
    lines.push('');
  }

  if (digest.precision !== null) {
    lines.push(`🎯 Precision (30d): ${(digest.precision * 100).toFixed(1)}%`);
    lines.push(`   Labeled: ${digest.labeledCount}`);
  }

  return lines.join('\n');
}

/** Format progress message for check flow */
export function formatCheckProgress(step: number, total: number, currentAction: string): string {
  const bar = '█'.repeat(step) + '░'.repeat(total - step);
  return `🔍 <b>Analyzing vehicle...</b>\n\n${bar} ${step}/${total}\n\n${currentAction}`;
}

/** Utility functions */

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/"/g, '"')
    .replace(/'/g, '&apos;')
}

export function formatCurrency(amount: number, currency: string): string {
  const symbol = currency === 'USD' ? '$' : currency === 'EUR' ? '€' : '₴';
  return `${symbol}${amount.toLocaleString()}`;
}

export function formatDate(date: Date): string {
  return date.toLocaleDateString('uk-UA', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Truncate text for callback data (max 64 bytes) */
export function truncateForCallback(text: string, max = 50): string {
  if (Buffer.byteLength(text, 'utf8') <= max) return text;
  let result = '';
  for (const char of text) {
    if (Buffer.byteLength(result + char, 'utf8') > max) break;
    result += char;
  }
  return result;
}