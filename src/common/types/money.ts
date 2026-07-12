/** Currencies the system compares in (see profitability-definition in the vault). */
export enum Currency {
  USD = 'USD',
  UAH = 'UAH',
}

/** A monetary amount tied to its currency. Normalized to a canonical currency for comparison. */
export interface Money {
  amount: number;
  currency: Currency;
}

export function money(amount: number, currency: Currency): Money {
  return { amount, currency };
}
