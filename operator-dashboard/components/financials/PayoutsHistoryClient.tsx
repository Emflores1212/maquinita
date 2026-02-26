'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

type PayoutTransactionView = {
  stripeBalanceTransactionId: string;
  transactionId: string | null;
  machineName: string;
  amount: number;
  feeAmount: number;
  netAmount: number;
  refundAmount: number;
};

type PayoutRowView = {
  id: string;
  createdAt: string;
  periodStart: string | null;
  periodEnd: string | null;
  gross: number;
  fees: number;
  refunds: number;
  netPaid: number;
  status: 'scheduled' | 'in_transit' | 'paid' | 'failed';
  transactions: PayoutTransactionView[];
};

function money(value: number, locale: string) {
  return new Intl.NumberFormat(locale || 'en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(value);
}

function dateTime(value: string, locale: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale || 'en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function dateOnly(value: string | null, locale: string) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale || 'en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  }).format(date);
}

export default function PayoutsHistoryClient({ rows }: { rows: PayoutRowView[] }) {
  const t = useTranslations('payoutsPage');
  const locale = useLocale();
  const [selectedPayout, setSelectedPayout] = useState<PayoutRowView | null>(null);

  const statusLabel = (status: PayoutRowView['status']) => {
    if (status === 'in_transit') return t('status.inTransit');
    if (status === 'paid') return t('status.paid');
    if (status === 'failed') return t('status.failed');
    return t('status.scheduled');
  };

  const statusClass = (status: PayoutRowView['status']) => {
    if (status === 'in_transit') return 'bg-blue-100 text-blue-700';
    if (status === 'paid') return 'bg-emerald-100 text-emerald-700';
    if (status === 'failed') return 'bg-red-100 text-red-700';
    return 'bg-amber-100 text-amber-700';
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t('title')}</h1>
        <p className="mt-1 text-sm text-slate-500">{t('subtitle')}</p>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="overflow-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">{t('table.date')}</th>
                <th className="px-3 py-2">{t('table.period')}</th>
                <th className="px-3 py-2">{t('table.gross')}</th>
                <th className="px-3 py-2">{t('table.fees')}</th>
                <th className="px-3 py-2">{t('table.refunds')}</th>
                <th className="px-3 py-2">{t('table.netPaid')}</th>
                <th className="px-3 py-2">{t('table.status')}</th>
                <th className="px-3 py-2 text-right">{t('table.transactions')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-slate-100">
                  <td className="px-3 py-2">{dateTime(row.createdAt, locale)}</td>
                  <td className="px-3 py-2">
                    {dateOnly(row.periodStart, locale)} - {dateOnly(row.periodEnd, locale)}
                  </td>
                  <td className="px-3 py-2">{money(row.gross, locale)}</td>
                  <td className="px-3 py-2">{money(row.fees, locale)}</td>
                  <td className="px-3 py-2">{money(row.refunds, locale)}</td>
                  <td className="px-3 py-2 font-semibold text-slate-900">{money(row.netPaid, locale)}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(row.status)}`}>
                      {statusLabel(row.status)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => setSelectedPayout(row)}
                      className="inline-flex h-10 items-center rounded-lg border border-slate-300 px-3 text-xs font-semibold text-slate-700"
                    >
                      {t('table.openTransactions')}
                    </button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-10 text-center text-sm text-slate-500">
                    {t('empty')}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {selectedPayout ? (
        <>
          <div className="fixed inset-0 z-40 bg-black/40" onClick={() => setSelectedPayout(null)} />
          <aside className="fixed right-0 top-0 z-50 h-full w-full max-w-2xl overflow-auto border-l border-slate-200 bg-white p-4 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900">{t('modal.title')}</h3>
              <button
                type="button"
                onClick={() => setSelectedPayout(null)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-300"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
              <p>
                <span className="font-semibold">{t('modal.date')}</span> {dateTime(selectedPayout.createdAt, locale)}
              </p>
              <p>
                <span className="font-semibold">{t('modal.period')}</span> {dateOnly(selectedPayout.periodStart, locale)} - {dateOnly(selectedPayout.periodEnd, locale)}
              </p>
              <p>
                <span className="font-semibold">{t('modal.netPaid')}</span> {money(selectedPayout.netPaid, locale)}
              </p>
            </div>

            <div className="mt-4 overflow-auto rounded-xl border border-slate-200">
              <table className="w-full min-w-[700px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2">{t('modal.columns.transactionId')}</th>
                    <th className="px-3 py-2">{t('modal.columns.machine')}</th>
                    <th className="px-3 py-2">{t('modal.columns.gross')}</th>
                    <th className="px-3 py-2">{t('modal.columns.fees')}</th>
                    <th className="px-3 py-2">{t('modal.columns.refunds')}</th>
                    <th className="px-3 py-2">{t('modal.columns.net')}</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedPayout.transactions.map((tx) => (
                    <tr key={tx.stripeBalanceTransactionId} className="border-t border-slate-100">
                      <td className="px-3 py-2 font-mono text-xs">{tx.transactionId ?? tx.stripeBalanceTransactionId}</td>
                      <td className="px-3 py-2">{tx.machineName}</td>
                      <td className="px-3 py-2">{money(tx.amount, locale)}</td>
                      <td className="px-3 py-2">{money(tx.feeAmount, locale)}</td>
                      <td className="px-3 py-2">{money(tx.refundAmount, locale)}</td>
                      <td className="px-3 py-2 font-semibold text-slate-900">{money(tx.netAmount, locale)}</td>
                    </tr>
                  ))}
                  {selectedPayout.transactions.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-3 py-8 text-center text-sm text-slate-500">
                        {t('modal.empty')}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </aside>
        </>
      ) : null}
    </div>
  );
}
