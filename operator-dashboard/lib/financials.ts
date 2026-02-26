import type { Json } from '@/lib/types';

export type FinancialPeriodPreset = '7d' | '30d' | '90d' | '12m' | 'custom';
export type FinancialMetric = 'gross' | 'net';
export type PayoutInterval = 'daily' | 'weekly' | 'monthly';
export type WeeklyAnchor = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';

export type ResolvedPeriod = {
  start: Date;
  end: Date;
  periodDays: number;
};

export type FeesConfig = {
  feeRate: number;
  feeFixed: number;
  saasMonthlyFee: number;
};

export type DeltaSummary = {
  amount: number;
  percent: number | null;
  direction: 'up' | 'down' | 'flat';
};

export type FinancialTransactionRow = {
  id: string;
  machineId: string | null;
  amount: number;
  refundAmount: number;
  taxAmount: number;
  createdAt: string;
};

export type DailyFinancialPoint = {
  date: string;
  grossRevenue: number;
  refunds: number;
  transactions: number;
  platformFees: number;
  stripeFees: number;
  netToOperator: number;
};

export type MachineFinancialAggregate = {
  machineId: string;
  machineName: string;
  gross: number;
  transactions: number;
  refunds: number;
  taxCollected: number;
  platformFee: number;
  stripeFee: number;
  net: number;
  percentOfTotal: number;
};

export type TaxRow = {
  machineId: string;
  machineName: string;
  grossSales: number;
  taxCollected: number;
  taxRate: number;
};

export type PayoutSchedule = {
  interval: PayoutInterval;
  weeklyAnchor?: WeeklyAnchor | null;
  monthlyAnchor?: number | null;
};

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

function endOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

function asDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function clampNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getDateKey(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function resolvePeriodRange(period: FinancialPeriodPreset, from?: string | null, to?: string | null, now = new Date()): ResolvedPeriod {
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);

  if (period === 'custom') {
    const fromDate = asDate(from);
    const toDate = asDate(to);
    if (!fromDate || !toDate) {
      return {
        start: startOfDay(new Date(todayStart.getTime() - 29 * 24 * 60 * 60 * 1000)),
        end: todayEnd,
        periodDays: 30,
      };
    }
    const start = startOfDay(fromDate);
    const end = endOfDay(toDate);
    if (start.getTime() > end.getTime()) {
      return {
        start: startOfDay(new Date(todayStart.getTime() - 29 * 24 * 60 * 60 * 1000)),
        end: todayEnd,
        periodDays: 30,
      };
    }
    const periodDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1);
    return { start, end, periodDays };
  }

  if (period === '12m') {
    const start = startOfDay(new Date(todayStart.getTime()));
    start.setMonth(start.getMonth() - 11);
    return {
      start,
      end: todayEnd,
      periodDays: Math.max(1, Math.round((todayEnd.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1),
    };
  }

  const days = period === '7d' ? 7 : period === '90d' ? 90 : 30;
  const start = startOfDay(new Date(todayStart.getTime() - (days - 1) * 24 * 60 * 60 * 1000));
  return { start, end: todayEnd, periodDays: days };
}

export function resolvePreviousPeriodRange(currentStart: Date, currentEnd: Date): ResolvedPeriod {
  const duration = currentEnd.getTime() - currentStart.getTime() + 1;
  const prevEnd = new Date(currentStart.getTime() - 1);
  const prevStart = new Date(prevEnd.getTime() - duration + 1);
  const periodDays = Math.max(1, Math.round((currentEnd.getTime() - currentStart.getTime()) / (24 * 60 * 60 * 1000)) + 1);
  return {
    start: prevStart,
    end: prevEnd,
    periodDays,
  };
}

export function normalizeFeesConfig(settings: Json | null | undefined): FeesConfig {
  const source = (settings ?? {}) as Record<string, unknown>;
  const feeRate = Math.max(0, clampNumber(source.feeRate, 0));
  const feeFixed = Math.max(0, clampNumber(source.feeFixed, 0));
  const saasMonthlyFee = Math.max(0, clampNumber(source.saasMonthlyFee, 0));

  return {
    feeRate,
    feeFixed,
    saasMonthlyFee,
  };
}

export function calculatePlatformFees(grossRevenue: number, transactionCount: number, config: FeesConfig) {
  return grossRevenue * config.feeRate + transactionCount * config.feeFixed;
}

export function calculateStripeFeesEstimate(grossRevenue: number, transactionCount: number) {
  return grossRevenue * 0.029 + transactionCount * 0.3;
}

export function calculateNetToOperator(params: {
  grossRevenue: number;
  refunds: number;
  platformFees: number;
  stripeFees: number;
}) {
  return params.grossRevenue - params.refunds - params.platformFees - params.stripeFees;
}

export function summarizeDelta(current: number, previous: number): DeltaSummary {
  const amount = current - previous;
  const direction = amount === 0 ? 'flat' : amount > 0 ? 'up' : 'down';
  const percent = previous !== 0 ? (amount / Math.abs(previous)) * 100 : null;
  return { amount, percent, direction };
}

export function buildDailySeries(rows: FinancialTransactionRow[], range: ResolvedPeriod, fees: FeesConfig): DailyFinancialPoint[] {
  const pointByDate = new Map<string, DailyFinancialPoint>();
  const oneDayMs = 24 * 60 * 60 * 1000;

  for (let day = range.start.getTime(); day <= range.end.getTime(); day += oneDayMs) {
    const key = getDateKey(new Date(day));
    pointByDate.set(key, {
      date: key,
      grossRevenue: 0,
      refunds: 0,
      transactions: 0,
      platformFees: 0,
      stripeFees: 0,
      netToOperator: 0,
    });
  }

  for (const row of rows) {
    const createdAt = asDate(row.createdAt);
    if (!createdAt) continue;
    const key = getDateKey(createdAt);
    const point = pointByDate.get(key);
    if (!point) continue;
    point.grossRevenue += row.amount;
    point.refunds += row.refundAmount;
    point.transactions += 1;
  }

  const points = [...pointByDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  for (const point of points) {
    point.platformFees = calculatePlatformFees(point.grossRevenue, point.transactions, fees);
    point.stripeFees = calculateStripeFeesEstimate(point.grossRevenue, point.transactions);
    point.netToOperator = calculateNetToOperator({
      grossRevenue: point.grossRevenue,
      refunds: point.refunds,
      platformFees: point.platformFees,
      stripeFees: point.stripeFees,
    });
  }

  return points;
}

export function aggregateByMachine(params: {
  rows: FinancialTransactionRow[];
  machineNameById: Map<string, string>;
  fees: FeesConfig;
}): MachineFinancialAggregate[] {
  const byMachine = new Map<string, Omit<MachineFinancialAggregate, 'percentOfTotal'>>();

  for (const row of params.rows) {
    if (!row.machineId) continue;
    const machineName = params.machineNameById.get(row.machineId) ?? row.machineId;

    const aggregate =
      byMachine.get(row.machineId) ??
      {
        machineId: row.machineId,
        machineName,
        gross: 0,
        transactions: 0,
        refunds: 0,
        taxCollected: 0,
        platformFee: 0,
        stripeFee: 0,
        net: 0,
      };

    aggregate.gross += row.amount;
    aggregate.transactions += 1;
    aggregate.refunds += row.refundAmount;
    aggregate.taxCollected += row.taxAmount;
    byMachine.set(row.machineId, aggregate);
  }

  const rows = [...byMachine.values()];
  const totalGross = rows.reduce((sum, row) => sum + row.gross, 0);

  return rows
    .map((row) => {
      const platformFee = calculatePlatformFees(row.gross, row.transactions, params.fees);
      const stripeFee = calculateStripeFeesEstimate(row.gross, row.transactions);
      const net = calculateNetToOperator({
        grossRevenue: row.gross,
        refunds: row.refunds,
        platformFees: platformFee,
        stripeFees: stripeFee,
      });

      return {
        ...row,
        platformFee,
        stripeFee,
        net,
        percentOfTotal: totalGross > 0 ? (row.gross / totalGross) * 100 : 0,
      };
    })
    .sort((a, b) => b.net - a.net);
}

export function aggregateTaxByMachine(params: {
  machineAggRows: MachineFinancialAggregate[];
  machineSettingsById: Map<string, Json | null | undefined>;
}): TaxRow[] {
  return params.machineAggRows.map((row) => {
    const settings = (params.machineSettingsById.get(row.machineId) ?? {}) as Record<string, unknown>;
    const machineTaxRate = clampNumber(settings.taxRate, NaN);
    const fallbackRate = row.gross > row.taxCollected ? (row.taxCollected / Math.max(row.gross - row.taxCollected, 0.01)) * 100 : 0;
    const taxRate = Number.isFinite(machineTaxRate) ? machineTaxRate : fallbackRate;

    return {
      machineId: row.machineId,
      machineName: row.machineName,
      grossSales: row.gross,
      taxCollected: row.taxCollected,
      taxRate,
    };
  });
}

function csvEscape(value: string) {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function serializeMachineCsv(rows: MachineFinancialAggregate[]) {
  const headers = ['machine', 'gross', 'transactions', 'refunds', 'platform_fee', 'net', 'percent_of_total'];
  const lines = rows.map((row) =>
    [
      row.machineName,
      row.gross.toFixed(2),
      String(row.transactions),
      row.refunds.toFixed(2),
      row.platformFee.toFixed(2),
      row.net.toFixed(2),
      row.percentOfTotal.toFixed(2),
    ]
      .map(csvEscape)
      .join(',')
  );
  return [headers.join(','), ...lines].join('\n');
}

export function serializeTaxCsv(rows: TaxRow[]) {
  const headers = ['machine', 'gross_sales', 'tax_collected', 'tax_rate_percent'];
  const lines = rows.map((row) =>
    [row.machineName, row.grossSales.toFixed(2), row.taxCollected.toFixed(2), row.taxRate.toFixed(2)]
      .map(csvEscape)
      .join(',')
  );
  return [headers.join(','), ...lines].join('\n');
}

export function computeNextPayoutDate(schedule: PayoutSchedule | null | undefined, now = new Date()) {
  if (!schedule?.interval) return null;

  if (schedule.interval === 'daily') {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  }

  if (schedule.interval === 'weekly') {
    const anchor = schedule.weeklyAnchor ?? 'monday';
    const targetDay = anchor === 'sunday' ? 0 : ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'].indexOf(anchor) + 1;
    const current = now.getDay();
    const delta = ((targetDay - current + 7) % 7) || 7;
    return new Date(now.getFullYear(), now.getMonth(), now.getDate() + delta);
  }

  const day = Math.max(1, Math.min(28, Math.floor(clampNumber(schedule.monthlyAnchor, 1))));
  const sameMonth = new Date(now.getFullYear(), now.getMonth(), day);
  if (sameMonth.getTime() > now.getTime()) return sameMonth;
  return new Date(now.getFullYear(), now.getMonth() + 1, day);
}

export function formatPeriodLabel(start: Date | null, end: Date | null) {
  if (!start || !end) return '-';
  return `${getDateKey(start)} to ${getDateKey(end)}`;
}
