import { redirect } from 'next/navigation';
import AnalyticsDashboardClient from '@/components/analytics/AnalyticsDashboardClient';
import {
  buildProfitabilityRows,
  calcSellThroughPct,
  calcWastePct,
  getDateKey,
  parseAnalyticsMetric,
  parseAnalyticsPeriod,
  parseAnalyticsTab,
  parseProductSort,
  rankMachineRows,
  resolvePeriodRange,
  resolvePreviousPeriodRange,
  sortProductRows,
  summarizeDelta,
  type ProductAnalyticsRow,
} from '@/lib/analytics';
import {
  calculateNetToOperator,
  calculatePlatformFees,
  calculateStripeFeesEstimate,
  formatPeriodLabel,
  normalizeFeesConfig,
} from '@/lib/financials';
import { hasPermission, type UserRole } from '@/lib/permissions';
import { createServerClient } from '@/lib/supabase';
import type { Json } from '@/lib/types';

function asSingleParam(value: string | string[] | undefined) {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function asDateInputValue(value: Date) {
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, '0');
  const day = `${value.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function safeNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseJsonArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

type RollupRow = {
  machineId: string;
  productId: string;
  date: string;
  unitsSold: number;
  revenue: number;
  refunds: number;
  unitsWasted: number;
  transactionsCount: number;
};

function summarizeRollups(rows: RollupRow[]) {
  const revenue = rows.reduce((sum, row) => sum + row.revenue, 0);
  const transactions = rows.reduce((sum, row) => sum + row.transactionsCount, 0);
  const unitsSold = rows.reduce((sum, row) => sum + row.unitsSold, 0);
  const unitsWasted = rows.reduce((sum, row) => sum + row.unitsWasted, 0);
  const refunds = rows.reduce((sum, row) => sum + row.refunds, 0);
  const aov = transactions > 0 ? revenue / transactions : 0;
  const wasteRate = calcWastePct(unitsSold, unitsWasted);

  return {
    revenue,
    transactions,
    unitsSold,
    unitsWasted,
    refunds,
    aov,
    wasteRate,
  };
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const supabase = createServerClient();
  const db = supabase as any;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login?returnUrl=/analytics');
  }

  const { data: profileData } = await db.from('profiles').select('operator_id, role').eq('id', user.id).maybeSingle();
  const profile = profileData as { operator_id: string | null; role: UserRole | null } | null;

  if (!profile?.operator_id || !hasPermission(profile.role, 'analytics', 'r')) {
    redirect('/dashboard');
  }

  const period = parseAnalyticsPeriod(asSingleParam(searchParams.period));
  const metric = parseAnalyticsMetric(asSingleParam(searchParams.metric));
  const tab = parseAnalyticsTab(asSingleParam(searchParams.tab));
  const from = asSingleParam(searchParams.from);
  const to = asSingleParam(searchParams.to);
  const machineFilter = asSingleParam(searchParams.machineId) ?? 'all';
  const categoryFilter = asSingleParam(searchParams.categoryId) ?? 'all';
  const productSort = parseProductSort(asSingleParam(searchParams.sort));

  const currentRange = resolvePeriodRange(period, from, to);
  const previousRange = resolvePreviousPeriodRange(currentRange.start, currentRange.end);

  const [operatorData, machinesData, productsData, categoriesData, cogsData] = await Promise.all([
    db.from('operators').select('id, settings').eq('id', profile.operator_id).maybeSingle(),
    db
      .from('machines')
      .select('id, name, status')
      .eq('operator_id', profile.operator_id)
      .neq('status', 'archived')
      .order('name', { ascending: true }),
    db.from('products').select('id, name, category_id').eq('operator_id', profile.operator_id).order('name', { ascending: true }),
    db.from('product_categories').select('id, name').eq('operator_id', profile.operator_id).order('name', { ascending: true }),
    db.from('cogs_settings').select('id, product_id, category_id, cogs_percentage').eq('operator_id', profile.operator_id),
  ]);

  const operator = operatorData.data as { id: string; settings: Json | null } | null;

  const machines =
    ((machinesData.data as Array<{ id: string; name: string; status: string | null }> | null) ?? []).map((machine) => ({
      id: machine.id,
      name: machine.name,
    }));

  const products =
    ((productsData.data as Array<{ id: string; name: string; category_id: string | null }> | null) ?? []).map((product) => ({
      id: product.id,
      name: product.name,
      categoryId: product.category_id,
    }));

  const categories =
    ((categoriesData.data as Array<{ id: string; name: string }> | null) ?? []).map((category) => ({
      id: category.id,
      name: category.name,
    }));

  const cogsSettings =
    ((cogsData.data as Array<{ id: string; product_id: string | null; category_id: string | null; cogs_percentage: number | null }> | null) ?? []).map(
      (row) => ({
        id: row.id,
        productId: row.product_id,
        categoryId: row.category_id,
        cogsPercentage: safeNumber(row.cogs_percentage),
      })
    );

  const validMachineId = machineFilter !== 'all' && machines.some((machine) => machine.id === machineFilter) ? machineFilter : 'all';
  const validCategoryId = categoryFilter !== 'all' && categories.some((category) => category.id === categoryFilter) ? categoryFilter : 'all';

  const queryRollups = async (startDate: string, endDate: string) => {
    let query = db
      .from('daily_rollups')
      .select('machine_id, product_id, date, units_sold, revenue, refunds, units_wasted, transactions_count')
      .eq('operator_id', profile.operator_id)
      .gte('date', startDate)
      .lte('date', endDate);

    if (validMachineId !== 'all') {
      query = query.eq('machine_id', validMachineId);
    }

    const { data } = await query;

    return ((data as Array<{
      machine_id: string;
      product_id: string;
      date: string;
      units_sold: number | null;
      revenue: number | null;
      refunds: number | null;
      units_wasted: number | null;
      transactions_count: number | null;
    }> | null) ?? []).map((row) => ({
      machineId: row.machine_id,
      productId: row.product_id,
      date: row.date,
      unitsSold: Math.max(0, Math.floor(safeNumber(row.units_sold))),
      revenue: safeNumber(row.revenue),
      refunds: safeNumber(row.refunds),
      unitsWasted: Math.max(0, Math.floor(safeNumber(row.units_wasted))),
      transactionsCount: Math.max(0, Math.floor(safeNumber(row.transactions_count))),
    })) as RollupRow[];
  };

  const [currentRows, previousRows, restockSessionsData] = await Promise.all([
    queryRollups(getDateKey(currentRange.start), getDateKey(currentRange.end)),
    queryRollups(getDateKey(previousRange.start), getDateKey(previousRange.end)),
    (async () => {
      let query = db
        .from('restock_sessions')
        .select('machine_id, completed_at, physical_counts')
        .eq('operator_id', profile.operator_id)
        .eq('status', 'completed')
        .gte('completed_at', currentRange.start.toISOString())
        .lte('completed_at', currentRange.end.toISOString())
        .order('completed_at', { ascending: true })
        .limit(5000);

      if (validMachineId !== 'all') {
        query = query.eq('machine_id', validMachineId);
      }

      const { data } = await query;
      return (data as Array<{ machine_id: string; completed_at: string | null; physical_counts: unknown }> | null) ?? [];
    })(),
  ]);

  const fees = normalizeFeesConfig(operator?.settings);
  const currentSummary = summarizeRollups(currentRows);
  const previousSummary = summarizeRollups(previousRows);

  const chartMap = new Map<
    string,
    {
      date: string;
      grossRevenue: number;
      refunds: number;
      transactions: number;
      netToOperator: number;
    }
  >();

  for (let time = currentRange.start.getTime(); time <= currentRange.end.getTime(); time += 24 * 60 * 60 * 1000) {
    const key = getDateKey(new Date(time));
    chartMap.set(key, {
      date: key,
      grossRevenue: 0,
      refunds: 0,
      transactions: 0,
      netToOperator: 0,
    });
  }

  for (const row of currentRows) {
    const point = chartMap.get(row.date);
    if (!point) continue;
    point.grossRevenue += row.revenue;
    point.refunds += row.refunds;
    point.transactions += row.transactionsCount;
  }

  const chartData = [...chartMap.values()].sort((a, b) => a.date.localeCompare(b.date));
  for (const point of chartData) {
    const platformFee = calculatePlatformFees(point.grossRevenue, point.transactions, fees);
    const stripeFee = calculateStripeFeesEstimate(point.grossRevenue, point.transactions);
    point.netToOperator = calculateNetToOperator({
      grossRevenue: point.grossRevenue,
      refunds: point.refunds,
      platformFees: platformFee,
      stripeFees: stripeFee,
    });
  }

  const machineNameById = new Map(machines.map((machine) => [machine.id, machine.name]));
  const productById = new Map(products.map((product) => [product.id, product]));
  const categoryNameById = new Map(categories.map((category) => [category.id, category.name]));

  const productAgg = new Map<string, { unitsSold: number; revenue: number; wasted: number }>();
  const machineAgg = new Map<string, { revenue: number; transactions: number; unitsSold: number; wasted: number; refunds: number }>();
  const machineProductRevenue = new Map<string, number>();

  for (const row of currentRows) {
    const product = productById.get(row.productId);
    if (product && (validCategoryId === 'all' || product.categoryId === validCategoryId)) {
      const productRow = productAgg.get(row.productId) ?? { unitsSold: 0, revenue: 0, wasted: 0 };
      productRow.unitsSold += row.unitsSold;
      productRow.revenue += row.revenue;
      productRow.wasted += row.unitsWasted;
      productAgg.set(row.productId, productRow);
    }

    const machineRow = machineAgg.get(row.machineId) ?? { revenue: 0, transactions: 0, unitsSold: 0, wasted: 0, refunds: 0 };
    machineRow.revenue += row.revenue;
    machineRow.transactions += row.transactionsCount;
    machineRow.unitsSold += row.unitsSold;
    machineRow.wasted += row.unitsWasted;
    machineRow.refunds += row.refunds;
    machineAgg.set(row.machineId, machineRow);

    const machineProductKey = `${row.machineId}::${row.productId}`;
    machineProductRevenue.set(machineProductKey, (machineProductRevenue.get(machineProductKey) ?? 0) + row.revenue);
  }

  let productRows: ProductAnalyticsRow[] = [...productAgg.entries()].map(([productId, aggregate]) => {
    const product = productById.get(productId);
    const categoryName = product?.categoryId ? categoryNameById.get(product.categoryId) ?? 'Uncategorized' : 'Uncategorized';

    return {
      productId,
      productName: product?.name ?? productId,
      categoryId: product?.categoryId ?? null,
      categoryName,
      unitsSold: aggregate.unitsSold,
      revenue: aggregate.revenue,
      wasted: aggregate.wasted,
      sellThroughPct: calcSellThroughPct(aggregate.unitsSold, aggregate.wasted),
      wastePct: calcWastePct(aggregate.unitsSold, aggregate.wasted),
    };
  });

  productRows = sortProductRows(productRows, productSort);

  const topProductByMachine = new Map<string, string>();
  for (const machine of machines) {
    let topProductId: string | null = null;
    let topRevenue = -1;

    for (const [key, revenue] of machineProductRevenue.entries()) {
      if (!key.startsWith(`${machine.id}::`)) continue;
      if (revenue > topRevenue) {
        topRevenue = revenue;
        topProductId = key.split('::')[1] ?? null;
      }
    }

    if (topProductId) {
      topProductByMachine.set(machine.id, productById.get(topProductId)?.name ?? topProductId);
    }
  }

  const machineRows = rankMachineRows(
    [...machineAgg.entries()].map(([machineId, aggregate]) => ({
      machineId,
      machineName: machineNameById.get(machineId) ?? machineId,
      revenue: aggregate.revenue,
      transactions: aggregate.transactions,
      aov: aggregate.transactions > 0 ? aggregate.revenue / aggregate.transactions : 0,
      topProduct: topProductByMachine.get(machineId) ?? '-',
      wastePct: calcWastePct(aggregate.unitsSold, aggregate.wasted),
    }))
  );

  const productCogsMap = new Map<string, number>();
  const categoryCogsMap = new Map<string, number>();

  for (const row of cogsSettings) {
    if (row.productId) {
      productCogsMap.set(row.productId, row.cogsPercentage);
    }

    if (row.categoryId) {
      categoryCogsMap.set(row.categoryId, row.cogsPercentage);
    }
  }

  const revenueByMachineProduct = new Map<string, number>();
  for (const [key, value] of machineProductRevenue.entries()) {
    revenueByMachineProduct.set(key, value);
  }

  const productCategoryById = new Map(products.map((product) => [product.id, product.categoryId]));

  const profitabilityRows = buildProfitabilityRows({
    machineRows: [...machineAgg.entries()].map(([machineId, aggregate]) => ({
      machineId,
      machineName: machineNameById.get(machineId) ?? machineId,
      revenue: aggregate.revenue,
      transactions: aggregate.transactions,
      refunds: aggregate.refunds,
    })),
    revenueByMachineProduct,
    productCategoryById,
    fees,
    productCogsMap,
    categoryCogsMap,
  });

  const lowMarginMachineNames = profitabilityRows
    .filter((row) => row.revenue > 0 && row.netMarginPct < 15)
    .map((row) => row.machineName);

  const wasteByMachineProduct = new Map<string, { machineName: string; productName: string; unitsWasted: number }>();
  for (const row of currentRows) {
    if (row.unitsWasted <= 0) continue;

    const key = `${row.machineId}::${row.productId}`;
    const existing =
      wasteByMachineProduct.get(key) ??
      ({
        machineName: machineNameById.get(row.machineId) ?? row.machineId,
        productName: productById.get(row.productId)?.name ?? row.productId,
        unitsWasted: 0,
      } as const);

    wasteByMachineProduct.set(key, {
      ...existing,
      unitsWasted: existing.unitsWasted + row.unitsWasted,
    });
  }

  const wasteReport = [...wasteByMachineProduct.values()].sort((a, b) => b.unitsWasted - a.unitsWasted).slice(0, 10);

  const stockoutEvents: Array<{
    occurredAt: string;
    machineName: string;
    productName: string;
    expected: number;
    counted: number;
    gap: number;
  }> = [];

  const restockCompletionsByMachine = new Map<string, Date[]>();

  for (const session of restockSessionsData) {
    if (!session.completed_at || !session.machine_id) continue;

    const completedAt = new Date(session.completed_at);
    if (Number.isNaN(completedAt.getTime())) continue;

    const completions = restockCompletionsByMachine.get(session.machine_id) ?? [];
    completions.push(completedAt);
    restockCompletionsByMachine.set(session.machine_id, completions);

    const physicalCounts = parseJsonArray(session.physical_counts);
    for (const row of physicalCounts) {
      const source = row as { productId?: string; expected?: number; counted?: number; productName?: string | null };
      const expected = Math.max(0, Math.floor(safeNumber(source.expected, 0)));
      const counted = Math.max(0, Math.floor(safeNumber(source.counted, 0)));
      const gap = expected - counted;
      if (gap < 1) continue;

      const productId = typeof source.productId === 'string' ? source.productId : null;
      stockoutEvents.push({
        occurredAt: completedAt.toISOString(),
        machineName: machineNameById.get(session.machine_id) ?? session.machine_id,
        productName:
          typeof source.productName === 'string'
            ? source.productName
            : productId
              ? (productById.get(productId)?.name ?? productId)
              : 'Unknown Product',
        expected,
        counted,
        gap,
      });
    }
  }

  stockoutEvents.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));

  const restockFrequency = [...restockCompletionsByMachine.entries()]
    .map(([machineId, values]) => {
      const sorted = [...values].sort((a, b) => a.getTime() - b.getTime());
      if (sorted.length <= 1) {
        return {
          machineName: machineNameById.get(machineId) ?? machineId,
          avgDays: 0,
          sessions: sorted.length,
        };
      }

      let diffTotal = 0;
      for (let index = 1; index < sorted.length; index += 1) {
        diffTotal += (sorted[index]!.getTime() - sorted[index - 1]!.getTime()) / (24 * 60 * 60 * 1000);
      }

      return {
        machineName: machineNameById.get(machineId) ?? machineId,
        avgDays: diffTotal / Math.max(1, sorted.length - 1),
        sessions: sorted.length,
      };
    })
    .sort((a, b) => b.avgDays - a.avgDays || a.machineName.localeCompare(b.machineName));

  return (
    <AnalyticsDashboardClient
      filters={{
        period,
        from: from ?? asDateInputValue(currentRange.start),
        to: to ?? asDateInputValue(currentRange.end),
        machineId: validMachineId,
        categoryId: validCategoryId,
        sort: productSort,
        metric,
        tab,
      }}
      periodLabel={formatPeriodLabel(currentRange.start, currentRange.end)}
      machines={machines}
      categories={categories}
      kpis={{
        revenue: currentSummary.revenue,
        transactions: currentSummary.transactions,
        aov: currentSummary.aov,
        wasteRate: currentSummary.wasteRate,
      }}
      deltas={{
        revenue: summarizeDelta(currentSummary.revenue, previousSummary.revenue),
        transactions: summarizeDelta(currentSummary.transactions, previousSummary.transactions),
        aov: summarizeDelta(currentSummary.aov, previousSummary.aov),
        wasteRate: summarizeDelta(currentSummary.wasteRate, previousSummary.wasteRate, { lowerIsBetter: true }),
      }}
      chartData={chartData.map((row) => ({
        date: row.date,
        grossRevenue: row.grossRevenue,
        netToOperator: row.netToOperator,
        transactions: row.transactions,
      }))}
      productRows={productRows}
      machineRows={machineRows}
      inventoryAnalytics={{
        wasteReport,
        stockoutEvents: stockoutEvents.slice(0, 100),
        restockFrequency,
      }}
      profitabilityRows={profitabilityRows}
      lowMarginMachineNames={lowMarginMachineNames}
    />
  );
}
