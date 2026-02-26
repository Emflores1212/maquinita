'use client';

import { useMemo, useState, useTransition } from 'react';
import { Loader2, MessageSquare } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { replyConsumerFeedbackAction } from '@/app/actions/marketing';

type FeedbackRow = {
  id: string;
  createdAt: string;
  consumerPhone: string | null;
  machineName: string;
  machineId: string | null;
  productName: string;
  rating: number;
  comment: string | null;
  operatorReply: string | null;
};

type RatingSummary = {
  label: string;
  value: number;
};

function stars(value: number) {
  const clamped = Math.max(1, Math.min(5, Math.round(value)));
  return '★'.repeat(clamped) + '☆'.repeat(5 - clamped);
}

export default function FeedbackPageClient({
  rows,
  machineSummary,
  productSummary,
}: {
  rows: FeedbackRow[];
  machineSummary: RatingSummary[];
  productSummary: RatingSummary[];
}) {
  const t = useTranslations('marketing.feedback');
  const [isPending, startTransition] = useTransition();
  const [replyTarget, setReplyTarget] = useState<FeedbackRow | null>(null);
  const [replyText, setReplyText] = useState('');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const sortedRows = useMemo(() => rows, [rows]);

  const submitReply = () => {
    if (!replyTarget?.id) return;

    setStatusMessage(null);
    setErrorMessage(null);

    startTransition(async () => {
      const response = await replyConsumerFeedbackAction({
        feedbackId: replyTarget.id,
        reply: replyText,
      });

      if (!response.ok) {
        setErrorMessage(response.error ?? t('replyError'));
        return;
      }

      setStatusMessage(t('replySuccess'));
      setReplyTarget(null);
      setReplyText('');
    });
  };

  return (
    <div className="space-y-6">
      <section className="grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">{t('machineSummaryTitle')}</h2>
          <div className="mt-3 space-y-2">
            {machineSummary.map((entry) => (
              <div key={entry.label} className="flex items-center justify-between rounded-lg border border-slate-100 p-2">
                <span className="text-sm text-slate-700">{entry.label}</span>
                <span className="text-sm font-semibold text-slate-900">{entry.value.toFixed(2)}</span>
              </div>
            ))}
            {machineSummary.length === 0 ? <p className="text-sm text-slate-500">{t('summaryEmpty')}</p> : null}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">{t('productSummaryTitle')}</h2>
          <div className="mt-3 space-y-2">
            {productSummary.map((entry) => (
              <div key={entry.label} className="flex items-center justify-between rounded-lg border border-slate-100 p-2">
                <span className="text-sm text-slate-700">{entry.label}</span>
                <span className="text-sm font-semibold text-slate-900">{entry.value.toFixed(2)}</span>
              </div>
            ))}
            {productSummary.length === 0 ? <p className="text-sm text-slate-500">{t('summaryEmpty')}</p> : null}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">{t('tableTitle')}</h2>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500">
                <th className="px-3 py-2">{t('dateCol')}</th>
                <th className="px-3 py-2">{t('consumerCol')}</th>
                <th className="px-3 py-2">{t('machineCol')}</th>
                <th className="px-3 py-2">{t('productCol')}</th>
                <th className="px-3 py-2">{t('ratingCol')}</th>
                <th className="px-3 py-2">{t('commentCol')}</th>
                <th className="px-3 py-2">{t('replyCol')}</th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((row) => (
                <tr key={row.id} className="border-b border-slate-100">
                  <td className="px-3 py-2 text-slate-600">{new Date(row.createdAt).toLocaleString()}</td>
                  <td className="px-3 py-2 text-slate-600">{row.consumerPhone || '-'}</td>
                  <td className="px-3 py-2 text-slate-600">{row.machineName}</td>
                  <td className="px-3 py-2 text-slate-600">{row.productName}</td>
                  <td className="px-3 py-2 text-amber-600">{stars(row.rating)}</td>
                  <td className="px-3 py-2 text-slate-600">{row.comment || '-'}</td>
                  <td className="px-3 py-2">
                    {row.operatorReply ? (
                      <p className="max-w-[260px] text-xs text-slate-700">{row.operatorReply}</p>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setReplyTarget(row);
                          setReplyText('');
                        }}
                        className="inline-flex h-10 items-center gap-1 rounded-lg border border-slate-300 px-3 text-xs font-semibold text-slate-700"
                      >
                        <MessageSquare className="h-3.5 w-3.5" />
                        {t('replyAction')}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {sortedRows.length === 0 ? (
                <tr>
                  <td className="px-3 py-4 text-slate-500" colSpan={7}>
                    {t('tableEmpty')}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {statusMessage ? <p className="text-sm font-medium text-emerald-700">{statusMessage}</p> : null}
      {errorMessage ? <p className="text-sm font-medium text-red-700">{errorMessage}</p> : null}

      {replyTarget ? (
        <>
          <div className="fixed inset-0 z-40 bg-black/35" onClick={() => setReplyTarget(null)} />
          <div className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl border border-slate-200 bg-white p-4 shadow-xl md:inset-auto md:bottom-8 md:left-1/2 md:w-full md:max-w-lg md:-translate-x-1/2 md:rounded-2xl">
            <h3 className="text-base font-semibold text-slate-900">{t('replyModalTitle')}</h3>
            <p className="mt-1 text-sm text-slate-600">{replyTarget.comment || '-'}</p>
            <textarea
              value={replyText}
              onChange={(event) => setReplyText(event.target.value)}
              rows={4}
              className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                disabled={isPending}
                onClick={submitReply}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-[#0D2B4E] px-4 text-sm font-semibold text-white disabled:opacity-60"
              >
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {t('replySubmit')}
              </button>
              <button
                type="button"
                onClick={() => setReplyTarget(null)}
                className="inline-flex h-12 items-center justify-center rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700"
              >
                {t('replyCancel')}
              </button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
