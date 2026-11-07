/** All money is stored as integer minor units (cents) to avoid float drift. */

export function toCents(major: number): number {
  return Math.round(major * 100);
}

export function fromCents(cents: number): number {
  return cents / 100;
}

/** PayPal expects decimal strings with two fraction digits for USD-like currencies. */
export function centsToPayPalValue(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function payPalValueToCents(value: string | number | undefined | null): number {
  if (value === undefined || value === null || value === '') return 0;
  const n = typeof value === 'number' ? value : Number.parseFloat(value);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

export function formatMoney(cents: number, currency = 'USD', opts: { compact?: boolean } = {}): string {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      notation: opts.compact ? 'compact' : 'standard',
      maximumFractionDigits: opts.compact ? 1 : 2,
    }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}
