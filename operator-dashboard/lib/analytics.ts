import { calculatePlatformFees, calculateStripeFeesEstimate, calculateNetToOperator, type FeesConfig } from '@/lib/financials';

export type AnalyticsPeriodPreset = '7d' | '30d' | '90d' | '12m' | 'custom';
export type AnalyticsMetric = 'gross' | 'net';
export type AnalyticsTab = 'overview' | 'profitability';
export type WasteColor = 'red' | 'orange' | 'green';

export type ProductSortColumn = 'name' | 'unitsSold' | 'revenue' | 'sellThroughPct' | 'wasted' | 'wastePct';
export type SortDirection = 'asc' | 'desc';

export type ProductSort = {
  column: ProductSortColumn;
  direction: SortDirection;
};

export type ResolvedPeriod = {
  start: Date;
  end: Date;
  periodDays: number;
};

export type DeltaSummary = {
  amount: number;
  percent: number | null;
  trend: 'up' | 'down' | 'flat';
  improved: boolean;
};

export type ProductAnalyticsRow = {
  productId: string;
  productName: string;
  categoryId: string | null;
  categoryName: string;
  unitsSold: number;
  revenue: number;
  wasted: number;
  sellThroughPct: number;
  wastePct: number;
};

export type MachineAnalyticsRow = {
  machineId: string;
  machineName: string;
  revenue: number;
  transactions: number;
  aov: number;
  topProduct: string;
  wastePct: number;
  rank: number;
};

export type ProfitabilityRow = {
  machineId: string;
  machineName: string;
  revenue: number;
  estimatedCogs: number;
  grossMargin: number;
  platformFee: number;
  stripeFeeEstimate: number;
  refunds: number;
  netToOperator: number;
  grossMarginPct: number;
  netMarginPct: number;
  profitable: boolean;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

function endOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

function toDate(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function csvEscape(value: string) {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function getDateKey(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseAnalyticsPeriod(value: string | null): AnalyticsPeriodPreset {
  if (value === '7d' || value === '30d' || value === '90d' || value === '12m' || value === 'custom') {
    return value;
  }
  return '30d';
}

export function parseAnalyticsMetric(value: string | null): AnalyticsMetric {
  return value === 'net' ? 'net' : 'gross';
}

export function parseAnalyticsTab(value: string | null): AnalyticsTab {
  return value === 'profitability' ? 'profitability' : 'overview';
}

export function parseProductSort(value: string | null): ProductSort {
  if (!value) {
    return { column: 'revenue', direction: 'desc' };
  }

  const [columnRaw, directionRaw] = value.split(':');
  const column =
    columnRaw === 'name' ||
    columnRaw === 'unitsSold' ||
    columnRaw === 'revenue' ||
    columnRaw === 'sellThroughPct' ||
    columnRaw === 'wasted' ||
    columnRaw === 'wastePct'
      ? columnRaw
      : 'revenue';

  const direction: SortDirection = directionRaw === 'asc' ? 'asc' : 'desc';
  return { column, direction };
}

export function resolvePeriodRange(period: AnalyticsPeriodPreset, from?: string | null, to?: string | null, now = new Date()): ResolvedPeriod {
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);

  if (period === 'custom') {
    const fromDate = toDate(from);
    const toDateValue = toDate(to);
    if (!fromDate || !toDateValue) {
      return {
        start: startOfDay(new Date(todayStart.getTime() - 29 * DAY_MS)),
        end: todayEnd,
        periodDays: 30,
      };
    }

    const start = startOfDay(fromDate);
    const end = endOfDay(toDateValue);
    if (start.getTime() > end.getTime()) {
      return {
        start: startOfDay(new Date(todayStart.getTime() - 29 * DAY_MS)),
        end: todayEnd,
        periodDays: 30,
      };
    }

    const periodDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / DAY_MS) + 1);
    return { start, end, periodDays };
  }

  if (period === '12m') {
    const start = startOfDay(new Date(todayStart.getTime()));
    start.setMonth(start.getMonth() - 11);

    return {
      start,
      end: todayEnd,
      periodDays: Math.max(1, Math.round((todayEnd.getTime() - start.getTime()) / DAY_MS) + 1),
    };
  }

  const days = period === '7d' ? 7 : period === '90d' ? 90 : 30;
  const start = startOfDay(new Date(todayStart.getTime() - (days - 1) * DAY_MS));
  return { start, end: todayEnd, periodDays: days };
}

export function resolvePreviousPeriodRange(currentStart: Date, currentEnd: Date): ResolvedPeriod {
  const durationMs = currentEnd.getTime() - currentStart.getTime() + 1;
  const previousEnd = new Date(currentStart.getTime() - 1);
  const previousStart = new Date(previousEnd.getTime() - durationMs + 1);

  return {
    start: previousStart,
    end: previousEnd,
    periodDays: Math.max(1, Math.round((currentEnd.getTime() - currentStart.getTime()) / DAY_MS) + 1),
  };
}

export function summarizeDelta(current: number, previous: number, opts?: { lowerIsBetter?: boolean }): DeltaSummary {
  const amount = current - previous;
  const trend: DeltaSummary['trend'] = amount === 0 ? 'flat' : amount > 0 ? 'up' : 'down';
  const percent = previous !== 0 ? (amount / Math.abs(previous)) * 100 : null;
  const lowerIsBetter = opts?.lowerIsBetter ?? false;

  const improved = amount === 0 ? false : lowerIsBetter ? amount < 0 : amount > 0;

  return { amount, percent, trend, improved };
}

export function calcSellThroughPct(unitsSold: number, unitsWasted: number) {
  const total = Math.max(0, unitsSold) + Math.max(0, unitsWasted);
  if (total === 0) return 0;
  return (Math.max(0, unitsSold) / total) * 100;
}

export function calcWastePct(unitsSold: number, unitsWasted: number) {
  const total = Math.max(0, unitsSold) + Math.max(0, unitsWasted);
  if (total === 0) return 0;
  return (Math.max(0, unitsWasted) / total) * 100;
}

export function getWasteColor(value: number): WasteColor {
  if (value > 40) return 'red';
  if (value > 20) return 'orange';
  return 'green';
}

export function getWasteColorClass(value: number) {
  const color = getWasteColor(value);
  if (color === 'red') return 'text-red-700';
  if (color === 'orange') return 'text-amber-700';
  return 'text-emerald-700';
}

export function rankMachineRows(rows: Omit<MachineAnalyticsRow, 'rank'>[]): MachineAnalyticsRow[] {
  return [...rows]
    .sort((a, b) => b.revenue - a.revenue || b.transactions - a.transactions || a.machineName.localeCompare(b.machineName))
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

export function resolveCogsPercentage(params: {
  productId: string;
  categoryId: string | null;
  productCogsMap: Map<string, number>;
  categoryCogsMap: Map<string, number>;
}) {
  if (params.productCogsMap.has(params.productId)) {
    return Math.max(0, Math.min(100, toNumber(params.productCogsMap.get(params.productId), 0)));
  }

  if (params.categoryId && params.categoryCogsMap.has(params.categoryId)) {
    return Math.max(0, Math.min(100, toNumber(params.categoryCogsMap.get(params.categoryId), 0)));
  }

  return 0;
}

export function buildProfitabilityRows(params: {
  machineRows: Array<{
    machineId: string;
    machineName: string;
    revenue: number;
    transactions: number;
    refunds: number;
  }>;
  revenueByMachineProduct: Map<string, number>;
  productCategoryById: Map<string, string | null>;
  fees: FeesConfig;
  productCogsMap: Map<string, number>;
  categoryCogsMap: Map<string, number>;
}): ProfitabilityRow[] {
  return params.machineRows
    .map((row) => {
      let estimatedCogs = 0;
      const machinePrefix = `${row.machineId}::`;

      for (const [key, revenue] of params.revenueByMachineProduct.entries()) {
        if (!key.startsWith(machinePrefix)) continue;
        const productId = key.slice(machinePrefix.length);
        const categoryId = params.productCategoryById.get(productId) ?? null;
        const cogsPct = resolveCogsPercentage({
          productId,
          categoryId,
          productCogsMap: params.productCogsMap,
          categoryCogsMap: params.categoryCogsMap,
        });
        estimatedCogs += revenue * (cogsPct / 100);
      }

      const grossMargin = row.revenue - estimatedCogs;
      const platformFee = calculatePlatformFees(row.revenue, row.transactions, params.fees);
      const stripeFeeEstimate = calculateStripeFeesEstimate(row.revenue, row.transactions);

      const netToOperator = calculateNetToOperator({
        grossRevenue: row.revenue,
        refunds: row.refunds,
        platformFees: platformFee,
        stripeFees: stripeFeeEstimate,
      }) - estimatedCogs;

      const grossMarginPct = row.revenue > 0 ? (grossMargin / row.revenue) * 100 : 0;
      const netMarginPct = row.revenue > 0 ? (netToOperator / row.revenue) * 100 : 0;

      return {
        machineId: row.machineId,
        machineName: row.machineName,
        revenue: row.revenue,
        estimatedCogs,
        grossMargin,
        platformFee,
        stripeFeeEstimate,
        refunds: row.refunds,
        netToOperator,
        grossMarginPct,
        netMarginPct,
        profitable: netToOperator > 0,
      };
    })
    .sort((a, b) => b.netToOperator - a.netToOperator || a.machineName.localeCompare(b.machineName));
}

export function serializeProductAnalyticsCsv(rows: ProductAnalyticsRow[]) {
  const headers = ['product', 'category', 'units_sold', 'revenue', 'sell_through_pct', 'wasted', 'waste_pct'];
  const lines = rows.map((row) =>
    [
      row.productName,
      row.categoryName,
      String(row.unitsSold),
      row.revenue.toFixed(2),
      row.sellThroughPct.toFixed(2),
      String(row.wasted),
      row.wastePct.toFixed(2),
    ]
      .map(csvEscape)
      .join(',')
  );
  return [headers.join(','), ...lines].join('\n');
}

export function serializeMachineAnalyticsCsv(rows: MachineAnalyticsRow[]) {
  const headers = ['machine', 'revenue', 'transactions', 'aov', 'top_product', 'waste_pct', 'rank'];
  const lines = rows.map((row) =>
    [
      row.machineName,
      row.revenue.toFixed(2),
      String(row.transactions),
      row.aov.toFixed(2),
      row.topProduct,
      row.wastePct.toFixed(2),
      String(row.rank),
    ]
      .map(csvEscape)
      .join(',')
  );
  return [headers.join(','), ...lines].join('\n');
}

export function sortProductRows(rows: ProductAnalyticsRow[], sort: ProductSort) {
  const sorted = [...rows];

  sorted.sort((a, b) => {
    const sign = sort.direction === 'asc' ? 1 : -1;

    if (sort.column === 'name') {
      return a.productName.localeCompare(b.productName) * sign;
    }

    if (sort.column === 'unitsSold') {
      return (a.unitsSold - b.unitsSold) * sign || a.productName.localeCompare(b.productName);
    }

    if (sort.column === 'revenue') {
      return (a.revenue - b.revenue) * sign || a.productName.localeCompare(b.productName);
    }

    if (sort.column === 'sellThroughPct') {
      return (a.sellThroughPct - b.sellThroughPct) * sign || a.productName.localeCompare(b.productName);
    }

    if (sort.column === 'wasted') {
      return (a.wasted - b.wasted) * sign || a.productName.localeCompare(b.productName);
    }

    return (a.wastePct - b.wastePct) * sign || a.productName.localeCompare(b.productName);
  });

  return sorted;
}
