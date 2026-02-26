import type { Json } from '@/lib/types';

export type ConsumerOperator = {
  id: string;
  name: string;
  slug: string;
  branding: Json | null;
};

export type ConsumerBranding = {
  logoUrl: string | null;
  primaryColor: string;
};

export function normalizeBranding(branding: Json | null | undefined): ConsumerBranding {
  const source = (branding ?? {}) as Record<string, unknown>;
  const logoUrl = typeof source.logoUrl === 'string' && source.logoUrl.trim().length > 0 ? source.logoUrl.trim() : null;

  const candidate =
    typeof source.primaryColor === 'string'
      ? source.primaryColor
      : typeof source.receiptPrimaryColor === 'string'
        ? source.receiptPrimaryColor
        : '#0D2B4E';

  const primaryColor = /^#[0-9A-Fa-f]{6}$/.test(candidate.trim()) ? candidate.trim() : '#0D2B4E';

  return {
    logoUrl,
    primaryColor,
  };
}

export function asCurrency(value: number, locale = 'en-US') {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(value);
}
