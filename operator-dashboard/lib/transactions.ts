import type { Json } from '@/lib/types';

export type TransactionLineItem = {
  productId: string | null;
  name: string;
  photoUrl: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  epcs: string[];
};

export type TransactionTimelineStep = {
  key: 'authorized' | 'items_detected' | 'settled' | 'refund_created';
  label: string;
  at: string;
};

function numberOr(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function textOr(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim().length > 0 ? value : fallback;
}

function parseEpcs(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter(Boolean)
    .map((entry) => entry.toUpperCase());
}

export function parseTransactionItems(value: unknown): TransactionLineItem[] {
  if (!Array.isArray(value)) return [];

  return value.map((item, index) => {
    const row = (item ?? {}) as Record<string, unknown>;
    const quantity = Math.max(1, Math.floor(numberOr(row.quantity, 1)));
    const unitPrice = numberOr(row.unit_price ?? row.unitPrice ?? row.price, 0);
    const lineTotal = numberOr(row.line_total ?? row.lineTotal, quantity * unitPrice);

    return {
      productId: typeof row.product_id === 'string' ? row.product_id : typeof row.productId === 'string' ? row.productId : null,
      name: textOr(row.name, `Item ${index + 1}`),
      photoUrl: typeof row.photo_url === 'string' ? row.photo_url : typeof row.photoUrl === 'string' ? row.photoUrl : null,
      quantity,
      unitPrice,
      lineTotal,
      epcs: parseEpcs(row.epcs ?? row.rfid_epcs),
    };
  });
}

export function buildDefaultTimeline(createdAtISO: string): TransactionTimelineStep[] {
  const createdAt = new Date(createdAtISO);
  const base = Number.isNaN(createdAt.getTime()) ? new Date() : createdAt;

  return [
    { key: 'authorized', label: 'Authorized', at: base.toISOString() },
    { key: 'items_detected', label: 'Items Detected', at: new Date(base.getTime() + 20 * 1000).toISOString() },
    { key: 'settled', label: 'Settled', at: new Date(base.getTime() + 40 * 1000).toISOString() },
  ];
}

export function parseTimeline(value: unknown, fallbackCreatedAt: string): TransactionTimelineStep[] {
  if (!Array.isArray(value)) {
    return buildDefaultTimeline(fallbackCreatedAt);
  }

  const parsed = value
    .map((entry) => {
      const row = (entry ?? {}) as Record<string, unknown>;
      const key = row.key;
      const at = row.at;
      const label = row.label;
      if (
        (key === 'authorized' || key === 'items_detected' || key === 'settled' || key === 'refund_created') &&
        typeof at === 'string' &&
        typeof label === 'string'
      ) {
        return { key, at, label };
      }
      return null;
    })
    .filter(Boolean) as TransactionTimelineStep[];

  return parsed.length > 0 ? parsed : buildDefaultTimeline(fallbackCreatedAt);
}

export function appendTimelineStep(timeline: unknown, step: TransactionTimelineStep, fallbackCreatedAt: string): Json {
  const existing = parseTimeline(timeline, fallbackCreatedAt);
  return [...existing, step] as unknown as Json;
}

export function calculateSubtotal(items: TransactionLineItem[]) {
  return items.reduce((sum, item) => sum + item.lineTotal, 0);
}
