'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowDown, ArrowUp, Download } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type {
  DailyFinancialPoint,
  DeltaSummary,
  FeesConfig,
  FinancialMetric,
  FinancialPeriodPreset,
  MachineFinancialAggregate,
  TaxRow,
} from '@/lib/financials';

type FinancialsDashboardClientProps = {
  filters: {
    period: FinancialPeriodPreset;
    from: string;
    to: string;
    machineId: string;
    metric: FinancialMetric;
  };
  machines: Array<{ id: string; name: string }>;
  summary: {
    grossRevenue: number;
    platformFees: number;
    stripeFees: number;
    netToOperator: number;
    transactions: number;
    refunds: number;
  };
  deltas: {
    grossRevenue: DeltaSummary;
    platformFees: DeltaSummary;
    stripeFees: DeltaSummary;
    netToOperator: DeltaSummary;
  };
  chartData: DailyFinancialPoint[];
  machineRows: MachineFinancialAggregate[];
  taxRows: TaxRow[];
  fees: FeesConfig;
  periodLabel: string;
  selectedMachineLabel: string;
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
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value / 100);
}

function csvEscape(value: string) {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function deltaColor(delta: DeltaSummary) {
  if (delta.direction === 'up') return 'text-emerald-700';
  if (delta.direction === 'down') return 'text-red-700';
  return 'text-slate-500';
}

export default function FinancialsDashboardClient({
  filters,
  machines,
  summary,
  deltas,
  chartData,
  machineRows,
  taxRows,
  fees,
  periodLabel,
  selectedMachineLabel,
}: FinancialsDashboardClientProps) {
  const t = useTranslations('financialsPage');
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [calculatorInput, setCalculatorInput] = useState('8.50');

  const calculatorAmount = Number(calculatorInput);
  const calculator = useMemo(() => {
    const sale = Number.isFinite(calculatorAmount) && calculatorAmount > 0 ? calculatorAmount : 0;
    const platform = sale * fees.feeRate + fees.feeFixed;
    const stripe = sale * 0.029 + 0.3;
    const net = sale - platform - stripe;
    return { sale, platform, stripe, net };
  }, [calculatorAmount, fees.feeFixed, fees.feeRate]);

  const metricDataKey = filters.metric === 'net' ? 'netToOperator' : 'grossRevenue';

  const buildUrl = (updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());

    Object.entries(updates).forEach(([key, value]) => {
      params.delete(key);
      if (value) params.set(key, value);
    });

    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  };

  const exportMachineCsv = () => {
    const headers = ['machine', 'gross', 'transactions', 'refunds', 'platform_fee', 'net', 'percent_of_total'];
    const lines = machineRows.map((row) =>
      [
        row.machineName,
        row.gross.toFixed(2),
        String(row.transactions),
        row.refunds.toFixed(2),
        row.platformFee.toFixed(2),
        row.net.toFixed(2),
        row.percentOfTotal.toFixed(2),
      ]
        .map((value) => csvEscape(String(value)))
        .join(',')
    );

    const csv = [headers.join(','), ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `financials-machines-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  };

  const exportTaxCsv = () => {
    const headers = ['machine', 'gross_sales', 'tax_collected', 'tax_rate_percent'];
    const lines = taxRows.map((row) =>
      [row.machineName, row.grossSales.toFixed(2), row.taxCollected.toFixed(2), row.taxRate.toFixed(2)]
        .map((value) => csvEscape(String(value)))
        .join(',')
    );

    const csv = [headers.join(','), ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `financials-tax-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  };

  const exportTaxPdf = () => {
    const doc = new jsPDF({ unit: 'pt', format: 'letter' });
    doc.setFontSize(16);
    doc.text(t('tax.pdfTitle'), 40, 44);

    doc.setFontSize(10);
    doc.text(`${t('periodLabel')}: ${periodLabel}`, 40, 62);
    doc.text(`${t('filters.machine')}: ${selectedMachineLabel}`, 40, 76);
    doc.text(`${t('tax.generatedAt')}: ${new Date().toLocaleString(locale)}`, 40, 90);

    autoTable(doc, {
      startY: 110,
      head: [[t('tax.table.machine'), t('tax.table.grossSales'), t('tax.table.taxCollected'), t('tax.table.taxRate')]],
      body: taxRows.map((row) => [
        row.machineName,
        money(row.grossSales, locale),
        money(row.taxCollected, locale),
        `${row.taxRate.toFixed(2)}%`,
      ]),
      styles: {
        fontSize: 9,
      },
      headStyles: {
        fillColor: [13, 43, 78],
      },
    });

    const totalGross = taxRows.reduce((sum, row) => sum + row.grossSales, 0);
    const totalTax = taxRows.reduce((sum, row) => sum + row.taxCollected, 0);

    const lastY = (doc as any).lastAutoTable?.finalY ?? 140;
    doc.setFontSize(10);
    doc.text(`${t('tax.totals.gross')}: ${money(totalGross, locale)}`, 40, lastY + 20);
    doc.text(`${t('tax.totals.tax')}: ${money(totalTax, locale)}`, 40, lastY + 34);

    doc.save(`financials-tax-${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t('title')}</h1>
        <p className="mt-1 text-sm text-slate-500">{t('subtitle')}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            href="/financials/banking"
            className="inline-flex h-11 items-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700"
          >
            {t('links.banking')}
          </Link>
          <Link
            href="/financials/payouts"
            className="inline-flex h-11 items-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700"
          >
            {t('links.payouts')}
          </Link>
        </div>
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          const formData = new FormData(event.currentTarget);
          const period = (formData.get('period') as string | null) ?? '30d';
          const machineId = (formData.get('machineId') as string | null) ?? 'all';
          const from = (formData.get('from') as string | null)?.trim() || null;
          const to = (formData.get('to') as string | null)?.trim() || null;

          router.push(
            buildUrl({
              period,
              machineId,
              from: period === 'custom' ? from : null,
              to: period === 'custom' ? to : null,
            })
          );
        }}
        className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
      >
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <label className="text-sm font-semibold text-slate-700">
            {t('filters.period')}
            <select
              name="period"
              defaultValue={filters.period}
              className="mt-1 h-12 w-full rounded-lg border border-slate-300 px-3 text-sm"
            >
              <option value="7d">7D</option>
              <option value="30d">30D</option>
              <option value="90d">90D</option>
              <option value="12m">12M</option>
              <option value="custom">{t('filters.custom')}</option>
            </select>
          </label>

          <label className="text-sm font-semibold text-slate-700">
            {t('filters.from')}
            <input
              name="from"
              type="date"
              defaultValue={filters.from}
              className="mt-1 h-12 w-full rounded-lg border border-slate-300 px-3 text-sm"
            />
          </label>

          <label className="text-sm font-semibold text-slate-700">
            {t('filters.to')}
            <input
              name="to"
              type="date"
              defaultValue={filters.to}
              className="mt-1 h-12 w-full rounded-lg border border-slate-300 px-3 text-sm"
            />
          </label>

          <label className="text-sm font-semibold text-slate-700">
            {t('filters.machine')}
            <select
              name="machineId"
              defaultValue={filters.machineId}
              className="mt-1 h-12 w-full rounded-lg border border-slate-300 px-3 text-sm"
            >
              <option value="all">{t('filters.allMachines')}</option>
              {machines.map((machine) => (
                <option key={machine.id} value={machine.id}>
                  {machine.name}
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
            onClick={() => router.push('/financials?period=30d&machineId=all&metric=gross')}
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
              {t('chart.grossToggle')}
            </button>
            <button
              type="button"
              onClick={() => router.push(buildUrl({ metric: 'net' }))}
              className={`h-12 px-4 text-sm font-semibold ${filters.metric === 'net' ? 'bg-[#0D2B4E] text-white' : 'bg-white text-slate-700'}`}
            >
              {t('chart.netToggle')}
            </button>
          </div>
        </div>
      </form>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase text-slate-500">{t('kpis.grossRevenue')}</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{money(summary.grossRevenue, locale)}</p>
          <p className={`mt-2 flex items-center gap-1 text-xs font-semibold ${deltaColor(deltas.grossRevenue)}`}>
            {deltas.grossRevenue.direction === 'up' ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />}
            {deltas.grossRevenue.percent === null ? t('kpis.noBaseline') : `${deltas.grossRevenue.percent.toFixed(1)}%`}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase text-slate-500">{t('kpis.platformFees')}</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{money(summary.platformFees, locale)}</p>
          <p className={`mt-2 flex items-center gap-1 text-xs font-semibold ${deltaColor(deltas.platformFees)}`}>
            {deltas.platformFees.direction === 'up' ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />}
            {deltas.platformFees.percent === null ? t('kpis.noBaseline') : `${deltas.platformFees.percent.toFixed(1)}%`}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase text-slate-500">{t('kpis.stripeFees')}</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{money(summary.stripeFees, locale)}</p>
          <p className={`mt-2 flex items-center gap-1 text-xs font-semibold ${deltaColor(deltas.stripeFees)}`}>
            {deltas.stripeFees.direction === 'up' ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />}
            {deltas.stripeFees.percent === null ? t('kpis.noBaseline') : `${deltas.stripeFees.percent.toFixed(1)}%`}
          </p>
        </div>

        <div className="rounded-xl border border-[#0D2B4E] bg-[#0D2B4E] p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase text-blue-100">{t('kpis.netToOperator')}</p>
          <p className="mt-2 text-3xl font-extrabold text-white">{money(summary.netToOperator, locale)}</p>
          <p className={`mt-2 flex items-center gap-1 text-xs font-semibold ${deltas.netToOperator.direction === 'down' ? 'text-red-100' : 'text-emerald-100'}`}>
            {deltas.netToOperator.direction === 'up' ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />}
            {deltas.netToOperator.percent === null ? t('kpis.noBaseline') : `${deltas.netToOperator.percent.toFixed(1)}%`}
          </p>
        </div>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900">{t('chart.title')}</h2>
            <p className="text-xs text-slate-500">{periodLabel}</p>
          </div>
        </div>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload || payload.length === 0) return null;
                  const row = payload[0]?.payload as DailyFinancialPoint;
                  return (
                    <div className="rounded-lg border border-slate-200 bg-white p-2 text-xs shadow-sm">
                      <p className="font-semibold text-slate-700">{label}</p>
                      <p className="text-slate-600">{t('chart.grossToggle')}: {money(row.grossRevenue, locale)}</p>
                      <p className="text-slate-600">{t('chart.netToggle')}: {money(row.netToOperator, locale)}</p>
                      <p className="text-slate-600">{t('machineTable.columns.transactions')}: {row.transactions}</p>
                    </div>
                  );
                }}
              />
              <Area
                type="monotone"
                dataKey={metricDataKey}
                stroke="#0D2B4E"
                fill="#1565C033"
                strokeWidth={2}
                name={filters.metric === 'net' ? t('chart.netToggle') : t('chart.grossToggle')}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-base font-bold text-slate-900">{t('machineTable.title')}</h2>
          <button
            type="button"
            onClick={exportMachineCsv}
            className="inline-flex h-12 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700"
          >
            <Download className="h-4 w-4" />
            {t('machineTable.exportCsv')}
          </button>
        </div>

        <div className="overflow-auto">
          <table className="w-full min-w-[840px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">{t('machineTable.columns.machine')}</th>
                <th className="px-3 py-2">{t('machineTable.columns.gross')}</th>
                <th className="px-3 py-2">{t('machineTable.columns.transactions')}</th>
                <th className="px-3 py-2">{t('machineTable.columns.refunds')}</th>
                <th className="px-3 py-2">{t('machineTable.columns.platformFee')}</th>
                <th className="px-3 py-2">{t('machineTable.columns.net')}</th>
                <th className="px-3 py-2">{t('machineTable.columns.percentOfTotal')}</th>
              </tr>
            </thead>
            <tbody>
              {machineRows.map((row) => (
                <tr key={row.machineId} className="border-t border-slate-100">
                  <td className="px-3 py-2 font-semibold text-slate-800">{row.machineName}</td>
                  <td className="px-3 py-2">{money(row.gross, locale)}</td>
                  <td className="px-3 py-2">{row.transactions}</td>
                  <td className="px-3 py-2">{money(row.refunds, locale)}</td>
                  <td className="px-3 py-2">{money(row.platformFee, locale)}</td>
                  <td className="px-3 py-2 font-semibold text-slate-900">{money(row.net, locale)}</td>
                  <td className="px-3 py-2">{percent(row.percentOfTotal, locale)}</td>
                </tr>
              ))}
              {machineRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-sm text-slate-500">
                    {t('machineTable.empty')}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-base font-bold text-slate-900">{t('fees.title')}</h2>
        <p className="mt-2 text-sm text-slate-700">{t('fees.saasFee', { amount: money(fees.saasMonthlyFee, locale) })}</p>
        <p className="text-sm text-slate-700">
          {t('fees.txFee', {
            percent: `${(fees.feeRate * 100).toFixed(2)}%`,
            fixed: money(fees.feeFixed, locale),
          })}
        </p>

        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <label className="text-sm font-semibold text-slate-700">
            {t('fees.calculatorInput')}
            <input
              inputMode="decimal"
              value={calculatorInput}
              onChange={(event) => setCalculatorInput(event.target.value.replace(/[^0-9.]/g, ''))}
              className="mt-1 h-12 w-full rounded-lg border border-slate-300 px-3 text-sm"
            />
          </label>
          <p className="mt-3 text-sm text-slate-700">
            {t('fees.breakdown', {
              sale: money(calculator.sale, locale),
              platform: money(calculator.platform, locale),
              stripe: money(calculator.stripe, locale),
              net: money(calculator.net, locale),
            })}
          </p>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-bold text-slate-900">{t('tax.title')}</h2>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={exportTaxCsv}
              className="inline-flex h-12 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700"
            >
              <Download className="h-4 w-4" />
              {t('tax.exportCsv')}
            </button>
            <button
              type="button"
              onClick={exportTaxPdf}
              className="inline-flex h-12 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700"
            >
              <Download className="h-4 w-4" />
              {t('tax.exportPdf')}
            </button>
          </div>
        </div>

        <div className="overflow-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">{t('tax.table.machine')}</th>
                <th className="px-3 py-2">{t('tax.table.grossSales')}</th>
                <th className="px-3 py-2">{t('tax.table.taxCollected')}</th>
                <th className="px-3 py-2">{t('tax.table.taxRate')}</th>
              </tr>
            </thead>
            <tbody>
              {taxRows.map((row) => (
                <tr key={row.machineId} className="border-t border-slate-100">
                  <td className="px-3 py-2 font-semibold text-slate-800">{row.machineName}</td>
                  <td className="px-3 py-2">{money(row.grossSales, locale)}</td>
                  <td className="px-3 py-2">{money(row.taxCollected, locale)}</td>
                  <td className="px-3 py-2">{row.taxRate.toFixed(2)}%</td>
                </tr>
              ))}
              {taxRows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-8 text-center text-sm text-slate-500">
                    {t('tax.empty')}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
