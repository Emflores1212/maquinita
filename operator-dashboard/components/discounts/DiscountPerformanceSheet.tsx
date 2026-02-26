'use client';

import { useMemo, useTransition } from 'react';
import { X } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { endDiscountAction } from '@/app/actions/discounts';
import type { DiscountListItem, DiscountPerformanceTxRow } from '@/components/discounts/types';
import { buildRedemptionSeries, summarizeDiscountPerformance } from '@/lib/discounts';

function currency(value: number) {
  return `$${Number(value || 0).toFixed(2)}`;
}

export default function DiscountPerformanceSheet({
  discount,
  rows,
  open,
  canWrite,
  onClose,
  onEnded,
}: {
  discount: DiscountListItem | null;
  rows: DiscountPerformanceTxRow[];
  open: boolean;
  canWrite: boolean;
  onClose: () => void;
  onEnded: () => void;
}) {
  const [isPending, startTransition] = useTransition();

  const summary = useMemo(() => summarizeDiscountPerformance(rows), [rows]);
  const chartData = useMemo(() => buildRedemptionSeries(rows), [rows]);
  const couponRows = useMemo(() => rows.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 40), [rows]);

  if (!open || !discount) {
    return null;
  }

  const endDiscount = () => {
    if (!canWrite) return;

    startTransition(async () => {
      const result = await endDiscountAction({ discountId: discount.id });
      if (!result.ok) {
        return;
      }
      onEnded();
    });
  };

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      <aside className="fixed right-0 top-0 z-50 h-full w-full max-w-2xl overflow-auto border-l border-slate-200 bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Discount Performance</h3>
            <p className="text-sm text-slate-500">{discount.name}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-slate-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-slate-200 p-3">
            <p className="text-xs uppercase tracking-wide text-slate-500">Total Redemptions</p>
            <p className="mt-1 text-xl font-bold text-slate-900">{summary.redemptions}</p>
          </div>
          <div className="rounded-lg border border-slate-200 p-3">
            <p className="text-xs uppercase tracking-wide text-slate-500">Revenue with Discount</p>
            <p className="mt-1 text-xl font-bold text-slate-900">{currency(summary.revenueWithDiscount)}</p>
          </div>
          <div className="rounded-lg border border-slate-200 p-3">
            <p className="text-xs uppercase tracking-wide text-slate-500">Discount Given</p>
            <p className="mt-1 text-xl font-bold text-slate-900">{currency(summary.discountGiven)}</p>
          </div>
        </div>

        <div className="mt-4 rounded-lg border border-slate-200 p-3">
          <p className="mb-2 text-sm font-semibold text-slate-800">Redemptions Over Time</p>
          {chartData.length === 0 ? (
            <p className="text-sm text-slate-500">No redemptions yet.</p>
          ) : (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="redemptions" fill="#0D2B4E" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {discount.type === 'coupon' ? (
          <div className="mt-4 rounded-lg border border-slate-200 p-3">
            <p className="mb-2 text-sm font-semibold text-slate-800">Coupon Redemptions</p>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-2 py-2">Date</th>
                    <th className="px-2 py-2">Machine</th>
                    <th className="px-2 py-2">Amount</th>
                    <th className="px-2 py-2">Discount</th>
                    <th className="px-2 py-2">Transaction</th>
                  </tr>
                </thead>
                <tbody>
                  {couponRows.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-2 py-3 text-slate-500">
                        No coupon redemptions.
                      </td>
                    </tr>
                  ) : (
                    couponRows.map((row) => (
                      <tr key={row.id} className="border-t border-slate-100">
                        <td className="px-2 py-2 text-slate-600">{new Date(row.createdAt).toLocaleString()}</td>
                        <td className="px-2 py-2 text-slate-700">{row.machineName}</td>
                        <td className="px-2 py-2 text-slate-700">{currency(row.amount)}</td>
                        <td className="px-2 py-2 text-slate-700">{currency(row.discountAmount)}</td>
                        <td className="px-2 py-2 font-mono text-xs text-slate-500">{row.id.slice(0, 8)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="min-h-12 rounded-lg border border-slate-200 px-4 text-sm font-semibold text-slate-700"
          >
            Close
          </button>
          {canWrite && discount.status !== 'ended' ? (
            <button
              type="button"
              onClick={endDiscount}
              disabled={isPending}
              className="min-h-12 rounded-lg bg-red-600 px-4 text-sm font-semibold text-white disabled:opacity-60"
            >
              {isPending ? 'Ending...' : 'End Discount'}
            </button>
          ) : null}
        </div>
      </aside>
    </>
  );
}
