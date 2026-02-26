'use client';

import { useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ArrowDown, ArrowUp, Crown, Download } from 'lucide-react';
import {
  getWasteColorClass,
  serializeMachineAnalyticsCsv,
  serializeProductAnalyticsCsv,
  type AnalyticsMetric,
  type AnalyticsPeriodPreset,
  type AnalyticsTab,
  type DeltaSummary,
  type MachineAnalyticsRow,
  type ProductAnalyticsRow,
  type ProductSort,
  type ProfitabilityRow,
} from '@/lib/analytics';

type AnalyticsDashboardClientProps = {
  filters: {
    period: AnalyticsPeriodPreset;
    from: string;
    to: string;
    machineId: string;
    categoryId: string;
    sort: ProductSort;
    metric: AnalyticsMetric;
    tab: AnalyticsTab;
  };
  periodLabel: string;
  machines: Array<{ id: string; name: string }>;
  categories: Array<{ id: string; name: string }>;
  kpis: {
    revenue: number;
    transactions: number;
    aov: number;
    wasteRate: number;
  };
  deltas: {
    revenue: DeltaSummary;
    transactions: DeltaSummary;
    aov: DeltaSummary;
    wasteRate: DeltaSummary;
  };
  chartData: Array<{
    date: string;
    grossRevenue: number;
    netToOperator: number;
    transactions: number;
  }>;
  productRows: ProductAnalyticsRow[];
  machineRows: MachineAnalyticsRow[];
  inventoryAnalytics: {
    wasteReport: Array<{
      machineName: string;
      productName: string;
      unitsWasted: number;
    }>;
    stockoutEvents: Array<{
      occurredAt: string;
      machineName: string;
      productName: string;
      expected: number;
      counted: number;
      gap: number;
    }>;
    restockFrequency: Array<{
      machineName: string;
      avgDays: number;
      sessions: number;
    }>;
  };
  profitabilityRows: ProfitabilityRow[];
  lowMarginMachineNames: string[];
};

function money(value: number, locale: string) {
  return new Intl.NumberFormat(locale || 'en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(value);
}

function percent(value: number, locale: string) {
  return new Intl.NumberFormat(locale || 'en-US', {
    style: 'percent',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value / 100);
}

function downloadCsv(contents: string, filename: string) {
  const blob = new Blob([contents], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

function deltaClasses(delta: DeltaSummary) {
  if (delta.improved) return 'text-emerald-700';
  if (delta.trend === 'flat') return 'text-slate-500';
  return 'text-red-700';
}

export default function AnalyticsDashboardClient({
  filters,
  periodLabel,
  machines,
  categories,
  kpis,
  deltas,
  chartData,
  productRows,
  machineRows,
  inventoryAnalytics,
  profitabilityRows,
  lowMarginMachineNames,
}: AnalyticsDashboardClientProps) {
  const t = useTranslations('analyticsPage');
  const tProfitability = useTranslations('profitabilityTab');
  const tInventory = useTranslations('inventoryAnalytics');
  const locale = useLocale();

  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  const metricDataKey = filters.metric === 'net' ? 'netToOperator' : 'grossRevenue';

  const chartTooltipLabel = useMemo(() => {
    return filters.metric === 'net' ? t('chart.net') : t('chart.gross');
  }, [filters.metric, t]);

  const buildUrl = (updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());

    Object.entries(updates).forEach(([key, value]) => {
      params.delete(key);
      if (value) {
        params.set(key, value);
      }
    });

    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  };

  const sortValue = `${filters.sort.column}:${filters.sort.direction}`;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('title')}</h1>
          <p className="mt-1 text-sm text-slate-500">{t('subtitle')}</p>
          <p className="mt-1 text-xs font-semibold text-slate-500">
            {t('periodLabel')}: {periodLabel}
          </p>
        </div>

        <div className="inline-flex h-12 overflow-hidden rounded-lg border border-slate-300 bg-white">
          <button
            type="button"
            onClick={() => router.push(buildUrl({ tab: 'overview' }))}
            className={`px-4 text-sm font-semibold ${filters.tab === 'overview' ? 'bg-[#0D2B4E] text-white' : 'text-slate-700'}`}
          >
            {t('tabs.overview')}
          </button>
          <button
            type="button"
            onClick={() => router.push(buildUrl({ tab: 'profitability' }))}
            className={`px-4 text-sm font-semibold ${filters.tab === 'profitability' ? 'bg-[#0D2B4E] text-white' : 'text-slate-700'}`}
          >
            {t('tabs.profitability')}
          </button>
        </div>
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          const formData = new FormData(event.currentTarget);
          const period = (formData.get('period') as string | null) ?? '30d';
          const machineId = (formData.get('machineId') as string | null) ?? 'all';
          const categoryId = (formData.get('categoryId') as string | null) ?? 'all';
          const from = ((formData.get('from') as string | null) ?? '').trim();
          const to = ((formData.get('to') as string | null) ?? '').trim();

          router.push(
            buildUrl({
              period,
              machineId,
              categoryId,
              from: period === 'custom' ? from || null : null,
              to: period === 'custom' ? to || null : null,
            })
          );
        }}
        className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
          <label className="text-sm font-semibold text-slate-700">
            {t('filters.period')}
            <select name="period" defaultValue={filters.period} className="mt-1 h-12 w-full rounded-lg border border-slate-300 px-3 text-sm">
              <option value="7d">7D</option>
              <option value="30d">30D</option>
              <option value="90d">90D</option>
              <option value="12m">12M</option>
              <option value="custom">{t('filters.custom')}</option>
            </select>
          </label>

          <label className="text-sm font-semibold text-slate-700">
            {t('filters.from')}
            <input name="from" type="date" defaultValue={filters.from} className="mt-1 h-12 w-full rounded-lg border border-slate-300 px-3 text-sm" />
          </label>

          <label className="text-sm font-semibold text-slate-700">
            {t('filters.to')}
            <input name="to" type="date" defaultValue={filters.to} className="mt-1 h-12 w-full rounded-lg border border-slate-300 px-3 text-sm" />
          </label>

          <label className="text-sm font-semibold text-slate-700">
            {t('filters.machine')}
            <select name="machineId" defaultValue={filters.machineId} className="mt-1 h-12 w-full rounded-lg border border-slate-300 px-3 text-sm">
              <option value="all">{t('filters.allMachines')}</option>
              {machines.map((machine) => (
                <option key={machine.id} value={machine.id}>
                  {machine.name}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm font-semibold text-slate-700">
            {t('filters.category')}
            <select name="categoryId" defaultValue={filters.categoryId} className="mt-1 h-12 w-full rounded-lg border border-slate-300 px-3 text-sm">
              <option value="all">{t('filters.allCategories')}</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <button type="submit" className="inline-flex h-12 items-center rounded-lg bg-[#0D2B4E] px-4 text-sm font-semibold text-white">
            {t('filters.apply')}
          </button>
          <button
            type="button"
            onClick={() => router.push('/analytics?period=30d&machineId=all&categoryId=all&metric=gross&tab=overview')}
            className="inline-flex h-12 items-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700"
          >
            {t('filters.reset')}
          </button>

          <div className="ml-auto inline-flex overflow-hidden rounded-lg border border-slate-300">
            <button
              type="button"
              onClick={() => router.push(buildUrl({ metric: 'gross' }))}
              className={`h-12 px-4 text-sm font-semibold ${filters.metric === 'gross' ? 'bg-[#0D2B4E] text-white' : 'bg-white text-slate-700'}`}
            >
              {t('chart.gross')}
            </button>
            <button
              type="button"
              onClick={() => router.push(buildUrl({ metric: 'net' }))}
              className={`h-12 px-4 text-sm font-semibold ${filters.metric === 'net' ? 'bg-[#0D2B4E] text-white' : 'bg-white text-slate-700'}`}
            >
              {t('chart.net')}
            </button>
          </div>
        </div>
      </form>

      {filters.tab === 'overview' ? (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase text-slate-500">{t('kpis.revenue')}</p>
              <p className="mt-2 text-2xl font-bold text-slate-900">{money(kpis.revenue, locale)}</p>
              <p className={`mt-2 flex items-center gap-1 text-xs font-semibold ${deltaClasses(deltas.revenue)}`}>
                {deltas.revenue.trend === 'up' ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />}
                {deltas.revenue.percent === null ? t('kpis.noBaseline') : `${deltas.revenue.percent.toFixed(1)}%`}
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase text-slate-500">{t('kpis.transactions')}</p>
              <p className="mt-2 text-2xl font-bold text-slate-900">{kpis.transactions.toLocaleString(locale)}</p>
              <p className={`mt-2 flex items-center gap-1 text-xs font-semibold ${deltaClasses(deltas.transactions)}`}>
                {deltas.transactions.trend === 'up' ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />}
                {deltas.transactions.percent === null ? t('kpis.noBaseline') : `${deltas.transactions.percent.toFixed(1)}%`}
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase text-slate-500">{t('kpis.aov')}</p>
              <p className="mt-2 text-2xl font-bold text-slate-900">{money(kpis.aov, locale)}</p>
              <p className={`mt-2 flex items-center gap-1 text-xs font-semibold ${deltaClasses(deltas.aov)}`}>
                {deltas.aov.trend === 'up' ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />}
                {deltas.aov.percent === null ? t('kpis.noBaseline') : `${deltas.aov.percent.toFixed(1)}%`}
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-semibold uppercase text-slate-500">{t('kpis.wasteRate')}</p>
              <p className="mt-2 text-2xl font-bold text-slate-900">{percent(kpis.wasteRate, locale)}</p>
              <p className={`mt-2 flex items-center gap-1 text-xs font-semibold ${deltaClasses(deltas.wasteRate)}`}>
                {deltas.wasteRate.trend === 'up' ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />}
                {deltas.wasteRate.percent === null ? t('kpis.noBaseline') : `${deltas.wasteRate.percent.toFixed(1)}%`}
              </p>
            </div>
          </div>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-base font-semibold text-slate-900">{t('chart.title')}</h2>
            <div className="mt-4 h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis tickFormatter={(value) => `$${Number(value).toFixed(0)}`} />
                  <Tooltip
                    formatter={(value: number | string | undefined, dataKey: string | undefined) => {
                      const numeric = Number(value ?? 0);
                      if (dataKey === 'transactions') return [String(Math.round(numeric)), t('chart.transactions')];
                      return [money(numeric, locale), dataKey === 'netToOperator' ? t('chart.net') : chartTooltipLabel];
                    }}
                  />
                  <Area type="monotone" dataKey={metricDataKey} stroke="#0D2B4E" fill="#0D2B4E" fillOpacity={0.18} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-slate-900">{t('productTable.title')}</h2>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={sortValue}
                  onChange={(event) => router.push(buildUrl({ sort: event.target.value }))}
                  className="h-11 rounded-lg border border-slate-300 px-3 text-sm"
                >
                  <option value="revenue:desc">{t('productTable.sort.revenueDesc')}</option>
                  <option value="revenue:asc">{t('productTable.sort.revenueAsc')}</option>
                  <option value="unitsSold:desc">{t('productTable.sort.unitsDesc')}</option>
                  <option value="unitsSold:asc">{t('productTable.sort.unitsAsc')}</option>
                  <option value="wastePct:desc">{t('productTable.sort.wasteDesc')}</option>
                  <option value="wastePct:asc">{t('productTable.sort.wasteAsc')}</option>
                  <option value="name:asc">{t('productTable.sort.nameAsc')}</option>
                </select>

                <button
                  type="button"
                  onClick={() =>
                    downloadCsv(
                      serializeProductAnalyticsCsv(productRows),
                      `analytics-products-${new Date().toISOString().slice(0, 10)}.csv`
                    )
                  }
                  className="inline-flex h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700"
                >
                  <Download className="h-4 w-4" />
                  {t('productTable.exportCsv')}
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                    <th className="px-2 py-2">{t('productTable.columns.product')}</th>
                    <th className="px-2 py-2">{t('productTable.columns.unitsSold')}</th>
                    <th className="px-2 py-2">{t('productTable.columns.revenue')}</th>
                    <th className="px-2 py-2">{t('productTable.columns.sellThrough')}</th>
                    <th className="px-2 py-2">{t('productTable.columns.wasted')}</th>
                    <th className="px-2 py-2">{t('productTable.columns.wastePct')}</th>
                  </tr>
                </thead>
                <tbody>
                  {productRows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-2 py-4 text-center text-sm text-slate-500">
                        {t('productTable.empty')}
                      </td>
                    </tr>
                  ) : (
                    productRows.map((row) => (
                      <tr key={row.productId} className="border-b border-slate-100">
                        <td className="px-2 py-2">
                          <p className="font-semibold text-slate-800">{row.productName}</p>
                          <p className="text-xs text-slate-500">{row.categoryName}</p>
                        </td>
                        <td className="px-2 py-2 text-slate-700">{row.unitsSold.toLocaleString(locale)}</td>
                        <td className="px-2 py-2 text-slate-700">{money(row.revenue, locale)}</td>
                        <td className="px-2 py-2 text-slate-700">{percent(row.sellThroughPct, locale)}</td>
                        <td className="px-2 py-2 text-slate-700">{row.wasted.toLocaleString(locale)}</td>
                        <td className={`px-2 py-2 font-semibold ${getWasteColorClass(row.wastePct)}`}>{percent(row.wastePct, locale)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-base font-semibold text-slate-900">{t('machineComparison.title')}</h2>

            <div className="mt-4 h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={machineRows}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="machineName" />
                  <YAxis tickFormatter={(value) => `$${Number(value).toFixed(0)}`} />
                  <Tooltip formatter={(value: number | string | undefined) => money(Number(value ?? 0), locale)} />
                  <Bar dataKey="revenue" fill="#0D2B4E" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                    <th className="px-2 py-2">{t('machineComparison.columns.machine')}</th>
                    <th className="px-2 py-2">{t('machineComparison.columns.revenue')}</th>
                    <th className="px-2 py-2">{t('machineComparison.columns.transactions')}</th>
                    <th className="px-2 py-2">{t('machineComparison.columns.aov')}</th>
                    <th className="px-2 py-2">{t('machineComparison.columns.topProduct')}</th>
                    <th className="px-2 py-2">{t('machineComparison.columns.wastePct')}</th>
                    <th className="px-2 py-2">{t('machineComparison.columns.rank')}</th>
                  </tr>
                </thead>
                <tbody>
                  {machineRows.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-2 py-4 text-center text-sm text-slate-500">
                        {t('machineComparison.empty')}
                      </td>
                    </tr>
                  ) : (
                    machineRows.map((row) => (
                      <tr key={row.machineId} className="border-b border-slate-100">
                        <td className="px-2 py-2 font-semibold text-slate-800">
                          <span className="inline-flex items-center gap-1">
                            {row.rank === 1 ? <Crown className="h-4 w-4 text-amber-500" /> : null}
                            {row.machineName}
                          </span>
                        </td>
                        <td className="px-2 py-2 text-slate-700">{money(row.revenue, locale)}</td>
                        <td className="px-2 py-2 text-slate-700">{row.transactions.toLocaleString(locale)}</td>
                        <td className="px-2 py-2 text-slate-700">{money(row.aov, locale)}</td>
                        <td className="px-2 py-2 text-slate-700">{row.topProduct}</td>
                        <td className={`px-2 py-2 font-semibold ${getWasteColorClass(row.wastePct)}`}>{percent(row.wastePct, locale)}</td>
                        <td className="px-2 py-2 text-slate-700">#{row.rank}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={() =>
                  downloadCsv(
                    serializeMachineAnalyticsCsv(machineRows),
                    `analytics-machines-${new Date().toISOString().slice(0, 10)}.csv`
                  )
                }
                className="inline-flex h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700"
              >
                <Download className="h-4 w-4" />
                {t('machineComparison.exportCsv')}
              </button>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-base font-semibold text-slate-900">{tInventory('title')}</h2>

            <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
              <div className="rounded-xl border border-slate-200 p-3">
                <h3 className="text-sm font-semibold text-slate-800">{tInventory('wasteReport.title')}</h3>
                <div className="mt-2 space-y-2">
                  {inventoryAnalytics.wasteReport.length === 0 ? (
                    <p className="text-xs text-slate-500">{tInventory('wasteReport.empty')}</p>
                  ) : (
                    inventoryAnalytics.wasteReport.map((row, index) => (
                      <div key={`${row.machineName}-${row.productName}-${index}`} className="rounded-md border border-slate-100 bg-slate-50 p-2 text-xs">
                        <p className="font-semibold text-slate-800">{row.productName}</p>
                        <p className="text-slate-600">
                          {row.machineName} • {tInventory('wasteReport.units', { count: row.unitsWasted })}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 p-3">
                <h3 className="text-sm font-semibold text-slate-800">{tInventory('stockoutEvents.title')}</h3>
                <div className="mt-2 space-y-2">
                  {inventoryAnalytics.stockoutEvents.length === 0 ? (
                    <p className="text-xs text-slate-500">{tInventory('stockoutEvents.empty')}</p>
                  ) : (
                    inventoryAnalytics.stockoutEvents.map((event, index) => (
                      <div key={`${event.machineName}-${event.productName}-${index}`} className="rounded-md border border-slate-100 bg-slate-50 p-2 text-xs">
                        <p className="font-semibold text-slate-800">{event.productName}</p>
                        <p className="text-slate-600">{event.machineName}</p>
                        <p className="text-amber-700">
                          {tInventory('stockoutEvents.gap', {
                            expected: event.expected,
                            counted: event.counted,
                            gap: event.gap,
                          })}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 p-3">
                <h3 className="text-sm font-semibold text-slate-800">{tInventory('restockFrequency.title')}</h3>
                <div className="mt-2 h-40 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={inventoryAnalytics.restockFrequency}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="machineName" hide />
                      <YAxis />
                      <Tooltip formatter={(value: number | string | undefined) => `${Number(value ?? 0).toFixed(2)} d`} />
                      <Bar dataKey="avgDays" fill="#0D2B4E" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="mt-2 space-y-2">
                  {inventoryAnalytics.restockFrequency.length === 0 ? (
                    <p className="text-xs text-slate-500">{tInventory('restockFrequency.empty')}</p>
                  ) : (
                    inventoryAnalytics.restockFrequency.map((row) => (
                      <div key={row.machineName} className="rounded-md border border-slate-100 bg-slate-50 p-2 text-xs">
                        <p className="font-semibold text-slate-800">{row.machineName}</p>
                        <p className="text-slate-600">
                          {tInventory('restockFrequency.value', {
                            days: row.avgDays.toFixed(2),
                            sessions: row.sessions,
                          })}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </section>
        </>
      ) : (
        <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-slate-900">{tProfitability('title')}</h2>
            <p className="text-xs text-slate-500">{tProfitability('subtitle')}</p>
          </div>

          {lowMarginMachineNames.length > 0 ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {tProfitability('lowMarginWarning', { machines: lowMarginMachineNames.join(', ') })}
            </div>
          ) : null}

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                  <th className="px-2 py-2">{tProfitability('columns.machine')}</th>
                  <th className="px-2 py-2">{tProfitability('columns.revenue')}</th>
                  <th className="px-2 py-2">{tProfitability('columns.cogs')}</th>
                  <th className="px-2 py-2">{tProfitability('columns.grossMargin')}</th>
                  <th className="px-2 py-2">{tProfitability('columns.platformFee')}</th>
                  <th className="px-2 py-2">{tProfitability('columns.stripeFee')}</th>
                  <th className="px-2 py-2">{tProfitability('columns.refunds')}</th>
                  <th className="px-2 py-2">{tProfitability('columns.net')}</th>
                  <th className="px-2 py-2">{tProfitability('columns.grossMarginPct')}</th>
                  <th className="px-2 py-2">{tProfitability('columns.netMarginPct')}</th>
                  <th className="px-2 py-2">{tProfitability('columns.profitable')}</th>
                </tr>
              </thead>
              <tbody>
                {profitabilityRows.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="px-2 py-4 text-center text-sm text-slate-500">
                      {tProfitability('empty')}
                    </td>
                  </tr>
                ) : (
                  profitabilityRows.map((row) => (
                    <tr key={row.machineId} className="border-b border-slate-100">
                      <td className="px-2 py-2 font-semibold text-slate-800">{row.machineName}</td>
                      <td className="px-2 py-2 text-slate-700">{money(row.revenue, locale)}</td>
                      <td className="px-2 py-2 text-slate-700">{money(row.estimatedCogs, locale)}</td>
                      <td className="px-2 py-2 text-slate-700">{money(row.grossMargin, locale)}</td>
                      <td className="px-2 py-2 text-slate-700">{money(row.platformFee, locale)}</td>
                      <td className="px-2 py-2 text-slate-700">{money(row.stripeFeeEstimate, locale)}</td>
                      <td className="px-2 py-2 text-slate-700">{money(row.refunds, locale)}</td>
                      <td className="px-2 py-2 text-slate-900 font-semibold">{money(row.netToOperator, locale)}</td>
                      <td className="px-2 py-2 text-slate-700">{percent(row.grossMarginPct, locale)}</td>
                      <td className={`px-2 py-2 font-semibold ${row.netMarginPct < 15 ? 'text-amber-700' : 'text-emerald-700'}`}>
                        {percent(row.netMarginPct, locale)}
                      </td>
                      <td className="px-2 py-2">
                        <span
                          className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${
                            row.profitable ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                          }`}
                        >
                          {row.profitable ? tProfitability('yes') : tProfitability('no')}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
