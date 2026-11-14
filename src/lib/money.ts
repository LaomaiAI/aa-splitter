/** Format integer cents as yuan, for example 3333 becomes "¥33.33". */
export function formatCents(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}¥${(abs / 100).toFixed(2)}`;
}

/**
 * Parse a yuan amount typed by a user into integer cents.
 * Returns null for empty, non-numeric, zero or negative input.
 */
export function parseYuanToCents(input: string): number | null {
  const trimmed = input.trim();
  if (trimmed === '') return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value <= 0) return null;
  const cents = Math.round(value * 100);
  if (!Number.isInteger(cents) || cents <= 0) return null;
  return cents;
}
