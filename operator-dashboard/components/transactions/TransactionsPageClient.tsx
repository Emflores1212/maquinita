'use client';

import { useMemo, useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Loader2,
  Mail,
  Receipt,
  RotateCcw,
  Search,
  X,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { issueRefundAction, resendTransactionReceiptAction } from '@/app/actions/transactions';
import type { TransactionLineItem, TransactionTimelineStep } from '@/lib/transactions';

type FiltersState = {
  since: string | null;
  until: string | null;
  machines: string[];
  status: string;
  search: string;
  page: number;
};

type MachineFilterOption = {
  id: string;
  name: string;
};

type SummaryState = {
  totalRevenue: number;
  totalTransactions: number;
  avgValue: number;
  totalRefunded: number;
};

export type TransactionListRow = {
  id: string;
  shortId: string;
  machineId: string | null;
  machineName: string;
  machineAddress: string | null;
  stripeChargeId: string | null;
  amount: number;
  taxAmount: number;
  discountAmount: number;
  refundAmount: number;
  status: string;
  items: TransactionLineItem[];
  customerPhone: string | null;
  customerEmail: string | null;
  cardLast4: string | null;
  currency: string;
  statusTimeline: TransactionTimelineStep[];
  createdAt: string;
  isOfflineSync: boolean;
  syncedAt: string | null;
};

type PaginationState = {
  page: number;
  totalPages: number;
  totalItems: number;
  perPage: number;
};

type ExportRow = {
  id: string;
  createdAt: string | null;
  machineName: string;
  amount: number;
  status: string;
  refundAmount: number;
  customerEmail: string;
  isOfflineSync: boolean;
  syncedAt: string | null;
};

function isoDate(value: Date) {
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, '0');
  const day = `${value.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function currencyFormat(value: number, currency = 'usd') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
    minimumFractionDigits: 2,
  }).format(value);
}

function dateTimeFormat(value: string, locale: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function csvEscape(value: string) {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function statusBadgeClass(status: string) {
  const normalized = status.toLowerCase();
  if (normalized === 'completed') return 'bg-emerald-100 text-emerald-700';
  if (normalized === 'pending') return 'bg-amber-100 text-amber-700';
  if (normalized === 'refunded') return 'bg-blue-100 text-blue-700';
  if (normalized === 'failed') return 'bg-red-100 text-red-700';
  return 'bg-slate-100 text-slate-700';
}

function statusLabel(status: string, t: (key: string) => string) {
  const normalized = status.toLowerCase();
  if (normalized === 'completed' || normalized === 'pending' || normalized === 'refunded' || normalized === 'failed') {
    return t(`status.${normalized}` as 'status.completed');
  }
  return status;
}

export default function TransactionsPageClient({
  filters,
  machines,
  summary,
  transactions,
  pagination,
  exportRows,
  canWrite,
}: {
  filters: FiltersState;
  machines: MachineFilterOption[];
  summary: SummaryState;
  transactions: TransactionListRow[];
  pagination: PaginationState;
  exportRows: ExportRow[];
  canWrite: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations('transactionsPage');
  const locale = useLocale();

  const [selectedTransactionId, setSelectedTransactionId] = useState<string | null>(null);
  const [showRfid, setShowRfid] = useState(false);
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [refundStep, setRefundStep] = useState(1);
  const [refundMode, setRefundMode] = useState<'full' | 'partial'>('full');
  const [refundReason, setRefundReason] = useState<'customer_complaint' | 'quality' | 'machine_error' | 'duplicate' | 'other'>(
    'customer_complaint'
  );
  const [refundOtherReason, setRefundOtherReason] = useState('');
  const [selectedLineIndexes, setSelectedLineIndexes] = useState<number[]>([]);
  const [customAmountInput, setCustomAmountInput] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const selectedTransaction = useMemo(
    () => transactions.find((transaction) => transaction.id === selectedTransactionId) ?? null,
    [transactions, selectedTransactionId]
  );

  const fullRefundable = useMemo(() => {
    if (!selectedTransaction) return 0;
    return Math.max(0, selectedTransaction.amount - selectedTransaction.refundAmount);
  }, [selectedTransaction]);

  const selectedLineRefundAmount = useMemo(() => {
    if (!selectedTransaction) return 0;
    return selectedTransaction.items.reduce((sum, item, index) => (selectedLineIndexes.includes(index) ? sum + item.lineTotal : sum), 0);
  }, [selectedLineIndexes, selectedTransaction]);

  const customAmount = Number(customAmountInput);
  const previewRefundAmount =
    refundMode === 'full' ? fullRefundable : customAmount > 0 ? customAmount : selectedLineRefundAmount;

  const selectedRfidEpcs = useMemo(() => {
    if (!selectedTransaction) return [];
    return selectedTransaction.items.flatMap((item) => item.epcs ?? []).filter(Boolean);
  }, [selectedTransaction]);

  const buildUrl = (updates: Record<string, string | string[] | null | undefined>) => {
    const params = new URLSearchParams(searchParams.toString());

    Object.entries(updates).forEach(([key, value]) => {
      params.delete(key);
      if (value == null) return;
      if (Array.isArray(value)) {
        value.forEach((entry) => {
          if (entry) params.append(key, entry);
        });
        return;
      }
      if (value) params.set(key, value);
    });

    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  };

  const applyPreset = (preset: 'today' | 'yesterday' | 'last7' | 'last30') => {
    const now = new Date();
    let since = '';
    let until = '';

    if (preset === 'today') {
      since = isoDate(now);
      until = isoDate(now);
    } else if (preset === 'yesterday') {
      const value = new Date(now);
      value.setDate(value.getDate() - 1);
      since = isoDate(value);
      until = isoDate(value);
    } else if (preset === 'last7') {
      const start = new Date(now);
      start.setDate(start.getDate() - 6);
      since = isoDate(start);
      until = isoDate(now);
    } else {
      const start = new Date(now);
      start.setDate(start.getDate() - 29);
      since = isoDate(start);
      until = isoDate(now);
    }

    router.push(
      buildUrl({
        since,
        until,
        page: '1',
      })
    );
  };

  const submitFilters = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const since = (formData.get('since') as string | null)?.trim() || null;
    const until = (formData.get('until') as string | null)?.trim() || null;
    const status = (formData.get('status') as string | null)?.trim() || 'all';
    const search = (formData.get('search') as string | null)?.trim() || null;
    const machineValues = formData
      .getAll('machines')
      .map((value) => `${value}`.trim())
      .filter(Boolean);

    router.push(
      buildUrl({
        since,
        until,
        status,
        search,
        machines: machineValues,
        page: '1',
      })
    );
  };

  const exportCsv = () => {
    const headers = ['created_at', 'transaction_id', 'machine', 'amount', 'status', 'refund_amount', 'customer_email', 'offline_synced', 'synced_at'];
    const lines = exportRows.map((row) =>
      [
        row.createdAt ?? '',
        row.id,
        row.machineName,
        row.amount.toFixed(2),
        row.status,
        row.refundAmount.toFixed(2),
        row.customerEmail,
        row.isOfflineSync ? 'true' : 'false',
        row.syncedAt ?? '',
      ]
        .map((value) => csvEscape(String(value)))
        .join(',')
    );

    const csv = [headers.join(','), ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `transactions-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  };

  const copyText = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setFeedback({ type: 'success', text: t('copySuccess') });
    } catch {
      setFeedback({ type: 'error', text: t('copyError') });
    }
  };

  const openRefund = () => {
    setRefundStep(1);
    setRefundMode('full');
    setSelectedLineIndexes([]);
    setCustomAmountInput('');
    setRefundReason('customer_complaint');
    setRefundOtherReason('');
    setShowRefundModal(true);
  };

  const confirmRefund = () => {
    if (!selectedTransaction) return;
    if (!Number.isFinite(previewRefundAmount) || previewRefundAmount <= 0) {
      setFeedback({ type: 'error', text: t('refund.invalidAmount') });
      return;
    }
    if (previewRefundAmount > fullRefundable) {
      setFeedback({ type: 'error', text: t('refund.exceeds') });
      return;
    }

    startTransition(async () => {
      const result = await issueRefundAction({
        transactionId: selectedTransaction.id,
        mode: refundMode,
        reason: refundReason,
        otherReason: refundReason === 'other' ? refundOtherReason : null,
        lineItemIndexes: refundMode === 'partial' ? selectedLineIndexes : undefined,
        customAmount: refundMode === 'partial' && customAmount > 0 ? customAmount : undefined,
      });

      if (!result.ok) {
        setFeedback({ type: 'error', text: result.error ?? t('refund.error') });
        return;
      }

      setFeedback({ type: 'success', text: t('refund.success', { amount: currencyFormat(previewRefundAmount, selectedTransaction.currency) }) });
      setShowRefundModal(false);
      router.refresh();
    });
  };

  const resendReceipt = () => {
    if (!selectedTransaction) return;
    startTransition(async () => {
      const result = await resendTransactionReceiptAction({ transactionId: selectedTransaction.id });
      if (!result.ok) {
        setFeedback({ type: 'error', text: result.error ?? t('receipt.error') });
        return;
      }
      setFeedback({ type: 'success', text: t('receipt.success') });
    });
  };

  const lineSubtotal = selectedTransaction?.items.reduce((sum, item) => sum + item.lineTotal, 0) ?? 0;
  const taxRate =
    selectedTransaction && lineSubtotal > 0 ? (selectedTransaction.taxAmount / lineSubtotal) * 100 : 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('title')}</h1>
          <p className="text-sm text-slate-500">{t('subtitle')}</p>
        </div>
        <button
          type="button"
          onClick={exportCsv}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700"
        >
          <Download className="h-4 w-4" />
          {t('exportCsv')}
        </button>
      </div>

      {feedback ? (
        <div
          className={`rounded-lg border px-3 py-2 text-sm font-semibold ${
            feedback.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'border-red-200 bg-red-50 text-red-700'
          }`}
        >
          {feedback.text}
        </div>
      ) : null}

      <form onSubmit={submitFilters} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap gap-2">
          <button type="button" onClick={() => applyPreset('today')} className="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-semibold">
            {t('presets.today')}
          </button>
          <button type="button" onClick={() => applyPreset('yesterday')} className="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-semibold">
            {t('presets.yesterday')}
          </button>
          <button type="button" onClick={() => applyPreset('last7')} className="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-semibold">
            {t('presets.last7')}
          </button>
          <button type="button" onClick={() => applyPreset('last30')} className="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-semibold">
            {t('presets.last30')}
          </button>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
          <label className="text-sm font-semibold text-slate-700">
            {t('filters.since')}
            <input
              name="since"
              type="date"
              defaultValue={filters.since ?? ''}
              className="mt-1 h-11 w-full rounded-lg border border-slate-300 px-3 text-sm"
            />
          </label>
          <label className="text-sm font-semibold text-slate-700">
            {t('filters.until')}
            <input
              name="until"
              type="date"
              defaultValue={filters.until ?? ''}
              className="mt-1 h-11 w-full rounded-lg border border-slate-300 px-3 text-sm"
            />
          </label>
          <label className="text-sm font-semibold text-slate-700">
            {t('filters.status')}
            <select name="status" defaultValue={filters.status} className="mt-1 h-11 w-full rounded-lg border border-slate-300 px-3 text-sm">
              <option value="all">{t('status.all')}</option>
              <option value="completed">{t('status.completed')}</option>
              <option value="pending">{t('status.pending')}</option>
              <option value="refunded">{t('status.refunded')}</option>
              <option value="failed">{t('status.failed')}</option>
            </select>
          </label>
          <label className="text-sm font-semibold text-slate-700">
            {t('filters.machines')}
            <select
              name="machines"
              defaultValue={filters.machines}
              multiple
              className="mt-1 h-24 w-full rounded-lg border border-slate-300 px-2 py-1 text-sm"
            >
              {machines.map((machine) => (
                <option key={machine.id} value={machine.id}>
                  {machine.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-semibold text-slate-700">
            {t('filters.search')}
            <div className="mt-1 flex h-11 items-center rounded-lg border border-slate-300 bg-white pl-2 pr-2">
              <Search className="h-4 w-4 text-slate-400" />
              <input
                name="search"
                defaultValue={filters.search}
                placeholder={t('filters.searchPlaceholder')}
                className="h-full w-full border-0 bg-transparent px-2 text-sm outline-none"
              />
            </div>
          </label>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <button type="submit" className="inline-flex h-11 items-center rounded-lg bg-[#0D2B4E] px-4 text-sm font-semibold text-white">
            {t('filters.apply')}
          </button>
          <button
            type="button"
            onClick={() => router.push('/transactions')}
            className="inline-flex h-11 items-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700"
          >
            {t('filters.clear')}
          </button>
        </div>
      </form>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase text-slate-500">{t('summary.revenue')}</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{currencyFormat(summary.totalRevenue)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase text-slate-500">{t('summary.count')}</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{summary.totalTransactions}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase text-slate-500">{t('summary.avg')}</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{currencyFormat(summary.avgValue)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase text-slate-500">{t('summary.refunded')}</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{currencyFormat(summary.totalRefunded)}</p>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">{t('table.dateTime')}</th>
                <th className="px-4 py-3">{t('table.id')}</th>
                <th className="px-4 py-3">{t('table.machine')}</th>
                <th className="px-4 py-3">{t('table.amount')}</th>
                <th className="px-4 py-3">{t('table.status')}</th>
                <th className="px-4 py-3 text-right">{t('table.details')}</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((transaction) => (
                <tr
                  key={transaction.id}
                  className="cursor-pointer border-t border-slate-100 hover:bg-slate-50"
                  onClick={() => {
                    setSelectedTransactionId(transaction.id);
                    setShowRfid(false);
                  }}
                >
                  <td className="px-4 py-3 text-slate-700">{dateTimeFormat(transaction.createdAt, locale)}</td>
                  <td className="px-4 py-3">
                    <div className="inline-flex items-center gap-2">
                      <code className="rounded bg-slate-100 px-2 py-1 text-xs font-semibold">{transaction.shortId}</code>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          void copyText(transaction.id);
                        }}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 text-slate-600"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{transaction.machineName}</td>
                  <td className="px-4 py-3 font-semibold text-slate-900">{currencyFormat(transaction.amount, transaction.currency)}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusBadgeClass(transaction.status)}`}>
                        {statusLabel(transaction.status, t)}
                      </span>
                      {transaction.isOfflineSync ? (
                        <span className="rounded-full bg-indigo-100 px-2.5 py-1 text-xs font-semibold text-indigo-700">
                          {t('status.synced')}
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        setSelectedTransactionId(transaction.id);
                        setShowRfid(false);
                      }}
                      className="inline-flex h-10 items-center rounded-lg border border-slate-300 px-3 text-xs font-semibold text-slate-700"
                    >
                      {t('table.open')}
                    </button>
                  </td>
                </tr>
              ))}

              {transactions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-500">
                    {t('empty')}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600">
          {t('pagination.label', { page: pagination.page, totalPages: pagination.totalPages, totalItems: pagination.totalItems })}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={pagination.page <= 1}
            onClick={() => router.push(buildUrl({ page: String(Math.max(1, pagination.page - 1)) }))}
            className="inline-flex h-10 items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 disabled:opacity-50"
          >
            <ChevronLeft className="h-4 w-4" />
            {t('pagination.previous')}
          </button>
          <button
            type="button"
            disabled={pagination.page >= pagination.totalPages}
            onClick={() => router.push(buildUrl({ page: String(Math.min(pagination.totalPages, pagination.page + 1)) }))}
            className="inline-flex h-10 items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 disabled:opacity-50"
          >
            {t('pagination.next')}
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {selectedTransaction ? (
        <>
          <div className="fixed inset-0 z-40 bg-black/40" onClick={() => setSelectedTransactionId(null)} />
          <aside className="fixed right-0 top-0 z-50 h-full w-full max-w-xl overflow-auto border-l border-slate-200 bg-white p-4 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900">{t('details.title')}</h3>
              <button
                type="button"
                onClick={() => setSelectedTransactionId(null)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-300"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
              <p className="flex items-center justify-between gap-2">
                <span className="font-semibold">{t('details.id')}</span>
                <span className="inline-flex items-center gap-2">
                  <code className="rounded bg-white px-2 py-1 text-xs">{selectedTransaction.id}</code>
                  <button
                    type="button"
                    onClick={() => void copyText(selectedTransaction.id)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-300"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                </span>
              </p>
              <p>
                <span className="font-semibold">{t('details.machine')}</span> {selectedTransaction.machineName}
                {selectedTransaction.machineAddress ? ` • ${selectedTransaction.machineAddress}` : ''}
              </p>
              <p>
                <span className="font-semibold">{t('details.dateTime')}</span> {dateTimeFormat(selectedTransaction.createdAt, locale)}
              </p>
            </div>

            <section className="mt-4">
              <h4 className="text-base font-bold text-slate-900">{t('details.items')}</h4>
              <div className="mt-2 space-y-2">
                {selectedTransaction.items.map((item, index) => (
                  <div key={`${item.name}-${index}`} className="rounded-xl border border-slate-200 p-3">
                    <div className="flex items-start gap-3">
                      <div className="h-12 w-12 overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
                        {item.photoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={item.photoUrl} alt={item.name} className="h-full w-full object-cover" />
                        ) : null}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-900">{item.name}</p>
                        <p className="text-xs text-slate-600">
                          {item.quantity} × {currencyFormat(item.unitPrice, selectedTransaction.currency)}
                        </p>
                      </div>
                      <p className="text-sm font-bold text-slate-900">{currencyFormat(item.lineTotal, selectedTransaction.currency)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="mt-4 rounded-xl border border-slate-200 p-3 text-sm">
              <p className="flex items-center justify-between">
                <span>{t('details.subtotal')}</span>
                <strong>{currencyFormat(lineSubtotal, selectedTransaction.currency)}</strong>
              </p>
              <p className="mt-1 flex items-center justify-between">
                <span>{t('details.tax', { rate: taxRate.toFixed(2) })}</span>
                <strong>{currencyFormat(selectedTransaction.taxAmount, selectedTransaction.currency)}</strong>
              </p>
              <p className="mt-1 flex items-center justify-between">
                <span>{t('details.discount')}</span>
                <strong>-{currencyFormat(selectedTransaction.discountAmount, selectedTransaction.currency)}</strong>
              </p>
              <p className="mt-1 flex items-center justify-between">
                <span>{t('details.refunded')}</span>
                <strong>-{currencyFormat(selectedTransaction.refundAmount, selectedTransaction.currency)}</strong>
              </p>
              <p className="mt-2 flex items-center justify-between text-base">
                <span className="font-semibold">{t('details.total')}</span>
                <strong className="text-[#0D2B4E]">{currencyFormat(selectedTransaction.amount, selectedTransaction.currency)}</strong>
              </p>
            </section>

            <section className="mt-4 rounded-xl border border-slate-200 p-3 text-sm">
              <p>
                <span className="font-semibold">{t('details.payment')}</span>{' '}
                {selectedTransaction.cardLast4 ? t('details.cardEnding', { last4: selectedTransaction.cardLast4 }) : '-'}
              </p>
            </section>

            <section className="mt-4">
              <h4 className="text-base font-bold text-slate-900">{t('details.timeline')}</h4>
              <ol className="mt-2 space-y-2">
                {selectedTransaction.statusTimeline.map((step, index) => (
                  <li key={`${step.key}-${index}`} className="rounded-lg border border-slate-200 p-2 text-sm">
                    <p className="font-semibold text-slate-900">{step.label}</p>
                    <p className="text-xs text-slate-600">{dateTimeFormat(step.at, locale)}</p>
                  </li>
                ))}
              </ol>
            </section>

            <section className="mt-4">
              <button
                type="button"
                onClick={() => setShowRfid((current) => !current)}
                className="inline-flex h-10 items-center rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-700"
              >
                {showRfid ? t('details.hideRfid') : t('details.viewRfid')}
              </button>
              {showRfid ? (
                <div className="mt-2 rounded-xl border border-slate-200 p-3">
                  {selectedRfidEpcs.length > 0 ? (
                    <div className="space-y-1">
                      {selectedRfidEpcs.map((epc) => (
                        <p key={epc} className="font-mono text-xs text-slate-700">
                          {epc}
                        </p>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-500">{t('details.noRfid')}</p>
                  )}
                </div>
              ) : null}
            </section>

            <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {canWrite && selectedTransaction.status.toLowerCase() === 'completed' ? (
                <button
                  type="button"
                  onClick={openRefund}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-red-600 px-3 text-sm font-bold text-white"
                >
                  <RotateCcw className="h-4 w-4" />
                  {t('details.issueRefund')}
                </button>
              ) : null}
              <button
                type="button"
                onClick={resendReceipt}
                disabled={isPending}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 disabled:opacity-60"
              >
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                {t('details.resendReceipt')}
              </button>
            </div>
          </aside>
        </>
      ) : null}

      {showRefundModal && selectedTransaction ? (
        <div className="fixed inset-0 z-[60] bg-black/50 px-4 py-8">
          <div className="mx-auto max-w-lg rounded-2xl bg-white p-4 shadow-xl">
            <h4 className="text-lg font-bold text-slate-900">{t('refund.title')}</h4>
            <p className="text-sm text-slate-600">
              {t('refund.available')}: {currencyFormat(fullRefundable, selectedTransaction.currency)}
            </p>

            {refundStep === 1 ? (
              <div className="mt-3 space-y-2">
                <p className="text-sm font-semibold text-slate-700">{t('refund.step1')}</p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setRefundMode('full')}
                    className={`h-12 rounded-lg border text-sm font-semibold ${
                      refundMode === 'full' ? 'border-[#0D2B4E] bg-[#0D2B4E] text-white' : 'border-slate-300 text-slate-700'
                    }`}
                  >
                    {t('refund.full')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setRefundMode('partial')}
                    className={`h-12 rounded-lg border text-sm font-semibold ${
                      refundMode === 'partial' ? 'border-[#0D2B4E] bg-[#0D2B4E] text-white' : 'border-slate-300 text-slate-700'
                    }`}
                  >
                    {t('refund.partial')}
                  </button>
                </div>
              </div>
            ) : null}

            {refundStep === 2 ? (
              <div className="mt-3 space-y-2">
                <p className="text-sm font-semibold text-slate-700">{t('refund.step2')}</p>
                {refundMode === 'partial' ? (
                  <>
                    <div className="space-y-2">
                      {selectedTransaction.items.map((item, index) => (
                        <label key={`${item.name}-${index}`} className="flex items-center justify-between rounded-lg border border-slate-200 p-2 text-sm">
                          <span className="mr-2 flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={selectedLineIndexes.includes(index)}
                              onChange={(event) => {
                                setSelectedLineIndexes((current) => {
                                  if (event.target.checked) return [...current, index];
                                  return current.filter((value) => value !== index);
                                });
                              }}
                            />
                            {item.name}
                          </span>
                          <span className="font-semibold">{currencyFormat(item.lineTotal, selectedTransaction.currency)}</span>
                        </label>
                      ))}
                    </div>
                    <label className="block text-sm font-semibold text-slate-700">
                      {t('refund.customAmount')}
                      <input
                        inputMode="decimal"
                        value={customAmountInput}
                        onChange={(event) => setCustomAmountInput(event.target.value.replace(/[^0-9.]/g, ''))}
                        className="mt-1 h-11 w-full rounded-lg border border-slate-300 px-3 text-sm"
                        placeholder="0.00"
                      />
                    </label>
                  </>
                ) : (
                  <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">{t('refund.fullAuto')}</p>
                )}
              </div>
            ) : null}

            {refundStep === 3 ? (
              <div className="mt-3 space-y-2">
                <p className="text-sm font-semibold text-slate-700">{t('refund.step3')}</p>
                <select
                  value={refundReason}
                  onChange={(event) =>
                    setRefundReason(
                      event.target.value as 'customer_complaint' | 'quality' | 'machine_error' | 'duplicate' | 'other'
                    )
                  }
                  className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm"
                >
                  <option value="customer_complaint">{t('reasons.customer_complaint')}</option>
                  <option value="quality">{t('reasons.quality')}</option>
                  <option value="machine_error">{t('reasons.machine_error')}</option>
                  <option value="duplicate">{t('reasons.duplicate')}</option>
                  <option value="other">{t('reasons.other')}</option>
                </select>
                {refundReason === 'other' ? (
                  <input
                    value={refundOtherReason}
                    onChange={(event) => setRefundOtherReason(event.target.value)}
                    className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm"
                    placeholder={t('refund.otherPlaceholder')}
                  />
                ) : null}
              </div>
            ) : null}

            {refundStep === 4 ? (
              <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
                <p className="font-semibold text-slate-900">{t('refund.step4')}</p>
                <p className="mt-1 text-slate-700">
                  {t('refund.preview', {
                    amount: currencyFormat(previewRefundAmount, selectedTransaction.currency),
                    last4: selectedTransaction.cardLast4 ?? '----',
                  })}
                </p>
              </div>
            ) : null}

            <div className="mt-4 grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setShowRefundModal(false)}
                className="h-11 rounded-lg border border-slate-300 text-sm font-semibold text-slate-700"
              >
                {t('refund.cancel')}
              </button>
              <button
                type="button"
                onClick={() => setRefundStep((current) => Math.max(1, current - 1))}
                disabled={refundStep === 1}
                className="h-11 rounded-lg border border-slate-300 text-sm font-semibold text-slate-700 disabled:opacity-50"
              >
                {t('refund.back')}
              </button>
              {refundStep < 4 ? (
                <button
                  type="button"
                  onClick={() => setRefundStep((current) => Math.min(4, current + 1))}
                  className="h-11 rounded-lg bg-[#0D2B4E] text-sm font-bold text-white"
                >
                  {t('refund.next')}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={confirmRefund}
                  disabled={isPending}
                  className="h-11 rounded-lg bg-red-600 text-sm font-bold text-white disabled:opacity-60"
                >
                  {isPending ? <Loader2 className="mx-auto h-5 w-5 animate-spin" /> : t('refund.confirm')}
                </button>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
