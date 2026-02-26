type PercentOptions = {
  minFractionDigits?: number;
  maxFractionDigits?: number;
  fromWholePercent?: boolean;
};

export function formatMoney(value: number, locale = 'en-US', currency = 'USD') {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(value);
}

export function formatPercent(value: number, locale = 'en-US', options?: PercentOptions) {
  const normalized = options?.fromWholePercent === false ? value : value / 100;
  return new Intl.NumberFormat(locale, {
    style: 'percent',
    minimumFractionDigits: options?.minFractionDigits ?? 1,
    maximumFractionDigits: options?.maxFractionDigits ?? 1,
  }).format(normalized);
}

export function formatDateTime(value: string | Date | null | undefined, locale = 'en-US', fallback = '-') {
  if (!value) return fallback;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toLocaleString(locale);
}

export function csvEscape(value: string) {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
