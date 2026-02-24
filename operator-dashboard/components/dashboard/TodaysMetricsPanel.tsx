'use client';

import { useTranslations } from 'next-intl';

export default function TodaysMetricsPanel({
  revenue,
  transactionCount,
  itemsSold,
}: {
  revenue: number;
  transactionCount: number;
  itemsSold: number;
}) {
  const t = useTranslations('dashboard.metrics');

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="mb-4 text-lg font-bold text-slate-900">{t('title')}</h3>
      <div className="space-y-3">
        <div className="rounded-lg border border-slate-200 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('revenue')}</p>
          <p className="text-xl font-bold text-slate-900">${revenue.toFixed(2)}</p>
        </div>
        <div className="rounded-lg border border-slate-200 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('transactions')}</p>
          <p className="text-xl font-bold text-slate-900">{transactionCount}</p>
        </div>
        <div className="rounded-lg border border-slate-200 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('items')}</p>
          <p className="text-xl font-bold text-slate-900">{itemsSold}</p>
        </div>
      </div>
    </section>
  );
}
