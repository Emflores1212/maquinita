import type { Json } from '@/lib/types';

export type DiscountType = 'standard' | 'happy_hour' | 'expiration' | 'coupon';
export type DiscountValueType = 'percentage' | 'fixed';
export type DiscountStatus = 'active' | 'scheduled' | 'paused' | 'ended';

export type DiscountTabKey = 'active' | 'scheduled' | 'past';

export type ExpirationTier = {
  days_remaining: number;
  discount_pct: number;
};

export type HappyHourSchedule = {
  days: Array<'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat'>;
  from: string;
  to: string;
};

export type DiscountPerformanceSourceRow = {
  id: string;
  discountId: string;
  machineId: string | null;
  amount: number;
  discountAmount: number;
  status: string;
  createdAt: string;
};

export type DiscountPerformanceSummary = {
  redemptions: number;
  revenueWithDiscount: number;
  discountGiven: number;
};

export type DiscountRedemptionPoint = {
  date: string;
  redemptions: number;
  revenue: number;
  discountGiven: number;
};

export function safeNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function normalizeDiscountStatus(value: unknown): DiscountStatus {
  const normalized = String(value ?? '').toLowerCase();
  if (normalized === 'active' || normalized === 'scheduled' || normalized === 'paused' || normalized === 'ended') {
    return normalized;
  }
  return 'active';
}

export function normalizeDiscountType(value: unknown): DiscountType {
  const normalized = String(value ?? '').toLowerCase();
  if (normalized === 'standard' || normalized === 'happy_hour' || normalized === 'expiration' || normalized === 'coupon') {
    return normalized;
  }
  return 'standard';
}

export function normalizeDiscountValueType(value: unknown): DiscountValueType {
  const normalized = String(value ?? '').toLowerCase();
  if (normalized === 'percentage' || normalized === 'fixed') {
    return normalized;
  }
  return 'percentage';
}

export function formatDiscountValue(valueType: DiscountValueType, value: number): string {
  if (valueType === 'percentage') {
    return `${safeNumber(value).toFixed(2).replace(/\.00$/, '')}%`;
  }
  return `$${safeNumber(value).toFixed(2)}`;
}

export function parseDateNullable(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function resolveDiscountTab(params: {
  status: DiscountStatus;
  startsAt: string | null;
  endsAt: string | null;
  endedAt?: string | null;
  now?: Date;
}): DiscountTabKey {
  const now = params.now ?? new Date();
  const startsAt = parseDateNullable(params.startsAt);
  const endsAt = parseDateNullable(params.endsAt);
  const endedAt = parseDateNullable(params.endedAt ?? null);

  if (params.status === 'ended' || endedAt || (endsAt && endsAt <= now)) {
    return 'past';
  }

  if (params.status === 'scheduled' || (startsAt && startsAt > now)) {
    return 'scheduled';
  }

  return 'active';
}

export function formatDiscountTargets(params: {
  productCount: number;
  categoryCount: number;
  machineCount: number;
  fallbackAllLabel?: string;
}): string {
  const allLabel = params.fallbackAllLabel ?? 'All items / all machines';
  const segments: string[] = [];

  if (params.productCount > 0) {
    segments.push(`${params.productCount} products`);
  }

  if (params.categoryCount > 0) {
    segments.push(`${params.categoryCount} categories`);
  }

  if (params.machineCount > 0) {
    segments.push(`${params.machineCount} machines`);
  }

  if (segments.length === 0) {
    return allLabel;
  }

  return segments.join(' · ');
}

export function parseExpirationTiers(value: unknown): ExpirationTier[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((row) => {
      const source = (row ?? {}) as Record<string, unknown>;
      return {
        days_remaining: Math.floor(safeNumber(source.days_remaining, NaN)),
        discount_pct: safeNumber(source.discount_pct, NaN),
      };
    })
    .filter((row) => Number.isFinite(row.days_remaining) && Number.isFinite(row.discount_pct));
}

export function validateExpirationTiers(tiers: ExpirationTier[]): { ok: true } | { ok: false; error: string } {
  if (tiers.length === 0) {
    return { ok: false, error: 'At least one tier is required' };
  }

  for (const tier of tiers) {
    if (tier.days_remaining < 0) {
      return { ok: false, error: 'Days remaining must be >= 0' };
    }

    if (tier.discount_pct <= 0 || tier.discount_pct > 100) {
      return { ok: false, error: 'Discount percent must be between 0 and 100' };
    }
  }

  const sorted = [...tiers].sort((a, b) => b.days_remaining - a.days_remaining);

  for (let i = 0; i < sorted.length - 1; i += 1) {
    if (sorted[i].days_remaining <= sorted[i + 1].days_remaining) {
      return { ok: false, error: 'Tier days must be strictly decreasing' };
    }

    if (sorted[i].discount_pct >= sorted[i + 1].discount_pct) {
      return { ok: false, error: 'Tier discounts must be strictly increasing' };
    }
  }

  return { ok: true };
}

function parseTimeToMinutes(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;

  const hour = Number(match[1]);
  const minute = Number(match[2]);

  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;

  return hour * 60 + minute;
}

export function parseHappyHourSchedule(value: Json | null | undefined): HappyHourSchedule | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const source = value as Record<string, unknown>;
  const daysRaw = Array.isArray(source.days) ? source.days : [];
  const from = typeof source.from === 'string' ? source.from.trim() : '';
  const to = typeof source.to === 'string' ? source.to.trim() : '';

  const validDayMap: Record<string, HappyHourSchedule['days'][number]> = {
    sun: 'sun',
    mon: 'mon',
    tue: 'tue',
    wed: 'wed',
    thu: 'thu',
    fri: 'fri',
    sat: 'sat',
  };

  const days = Array.from(
    new Set(
      daysRaw
        .map((day) => String(day).slice(0, 3).toLowerCase())
        .map((day) => validDayMap[day])
        .filter(Boolean)
    )
  ) as HappyHourSchedule['days'];

  if (days.length === 0) return null;
  if (parseTimeToMinutes(from) === null || parseTimeToMinutes(to) === null) return null;

  return {
    days,
    from,
    to,
  };
}

export function isHappyHourActive(params: {
  schedule: HappyHourSchedule;
  now?: Date;
  timeZone?: string;
}): boolean {
  const now = params.now ?? new Date();
  const timeZone = params.timeZone || 'UTC';

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);

  const weekday = parts.find((entry) => entry.type === 'weekday')?.value?.slice(0, 3).toLowerCase() ?? '';
  const hour = parts.find((entry) => entry.type === 'hour')?.value ?? '00';
  const minute = parts.find((entry) => entry.type === 'minute')?.value ?? '00';
  const currentMinutes = parseTimeToMinutes(`${hour}:${minute}`);
  const fromMinutes = parseTimeToMinutes(params.schedule.from);
  const toMinutes = parseTimeToMinutes(params.schedule.to);

  if (currentMinutes === null || fromMinutes === null || toMinutes === null) {
    return false;
  }

  if (!params.schedule.days.includes(weekday as HappyHourSchedule['days'][number])) {
    return false;
  }

  if (toMinutes >= fromMinutes) {
    return currentMinutes >= fromMinutes && currentMinutes <= toMinutes;
  }

  return currentMinutes >= fromMinutes || currentMinutes <= toMinutes;
}

export function summarizeDiscountPerformance(rows: DiscountPerformanceSourceRow[]): DiscountPerformanceSummary {
  return rows.reduce(
    (acc, row) => {
      acc.redemptions += 1;
      acc.revenueWithDiscount += safeNumber(row.amount);
      acc.discountGiven += safeNumber(row.discountAmount);
      return acc;
    },
    {
      redemptions: 0,
      revenueWithDiscount: 0,
      discountGiven: 0,
    }
  );
}

export function buildRedemptionSeries(rows: DiscountPerformanceSourceRow[]): DiscountRedemptionPoint[] {
  const map = new Map<string, DiscountRedemptionPoint>();

  for (const row of rows) {
    const dateKey = row.createdAt.slice(0, 10);
    const current = map.get(dateKey) ?? {
      date: dateKey,
      redemptions: 0,
      revenue: 0,
      discountGiven: 0,
    };

    current.redemptions += 1;
    current.revenue += safeNumber(row.amount);
    current.discountGiven += safeNumber(row.discountAmount);
    map.set(dateKey, current);
  }

  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
}
