'use client';

import { useMemo, useState, useTransition } from 'react';
import { Loader2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { updatePayoutScheduleAction } from '@/app/actions/financials';
import type { PayoutInterval, WeeklyAnchor } from '@/lib/financials';

type BankingSettingsClientProps = {
  canWrite: boolean;
  status: 'unconnected' | 'pending_verification' | 'active' | 'restricted';
  statusCode: 'connected' | 'refresh' | 'forbidden' | 'error' | null;
  account: {
    stripeAccountId: string | null;
    bankName: string | null;
    bankLast4: string | null;
    bankAccountType: string | null;
    payoutInterval: PayoutInterval | null;
    weeklyAnchor: WeeklyAnchor | null;
    monthlyAnchor: number | null;
    nextPayoutDate: string | null;
  };
};

type Feedback = { type: 'success' | 'error'; text: string } | null;

export default function BankingSettingsClient({ canWrite, status, statusCode, account }: BankingSettingsClientProps) {
  const t = useTranslations('bankingPage');
  const locale = useLocale();
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<Feedback>(null);

  const [interval, setInterval] = useState<PayoutInterval>(account.payoutInterval ?? 'daily');
  const [weeklyAnchor, setWeeklyAnchor] = useState<WeeklyAnchor>(account.weeklyAnchor ?? 'monday');
  const [monthlyAnchor, setMonthlyAnchor] = useState<number>(account.monthlyAnchor ?? 1);

  const statusTone = useMemo(() => {
    if (status === 'active') return 'border-emerald-200 bg-emerald-50 text-emerald-800';
    if (status === 'pending_verification') return 'border-amber-200 bg-amber-50 text-amber-800';
    if (status === 'restricted') return 'border-red-200 bg-red-50 text-red-800';
    return 'border-slate-200 bg-slate-50 text-slate-700';
  }, [status]);

  const statusLabel =
    status === 'active'
      ? t('status.active')
      : status === 'pending_verification'
        ? t('status.pending')
        : status === 'restricted'
          ? t('status.restricted')
          : t('status.unconnected');

  const submitSchedule = () => {
    if (!canWrite || !account.stripeAccountId) return;

    setFeedback(null);
    startTransition(async () => {
      const result = await updatePayoutScheduleAction({
        interval,
        weeklyAnchor: interval === 'weekly' ? weeklyAnchor : undefined,
        monthlyAnchor: interval === 'monthly' ? monthlyAnchor : undefined,
      });

      if (!result.ok) {
        setFeedback({ type: 'error', text: result.error ?? t('schedule.saveError') });
        return;
      }

      const nextPayoutDate = result.nextPayoutDate ? new Date(result.nextPayoutDate).toLocaleDateString(locale) : '-';
      setFeedback({ type: 'success', text: t('schedule.saveSuccess', { date: nextPayoutDate }) });
    });
  };

  const statusMessage = statusCode
    ? statusCode === 'connected'
      ? t('messages.connected')
      : statusCode === 'refresh'
        ? t('messages.refresh')
        : statusCode === 'forbidden'
          ? t('messages.forbidden')
          : t('messages.error')
    : null;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t('title')}</h1>
        <p className="mt-1 text-sm text-slate-500">{t('subtitle')}</p>
      </div>

      {statusMessage ? (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-700">{statusMessage}</div>
      ) : null}

      {feedback ? (
        <div
          className={`rounded-lg border px-4 py-3 text-sm font-semibold ${
            feedback.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-700'
          }`}
        >
          {feedback.text}
        </div>
      ) : null}

      <section className={`rounded-2xl border p-4 shadow-sm ${statusTone}`}>
        <h2 className="text-base font-bold">{t('status.title')}</h2>
        <p className="mt-2 text-sm font-semibold">{statusLabel}</p>
        {!account.stripeAccountId ? (
          <div className="mt-4">
            <a
              href="/api/stripe/connect/create"
              className="inline-flex h-12 items-center rounded-lg bg-[#0D2B4E] px-4 text-sm font-semibold text-white"
            >
              {t('status.connectButton')}
            </a>
          </div>
        ) : (
          <div className="mt-3 space-y-1 text-sm">
            <p>
              <span className="font-semibold">{t('status.accountId')}:</span> {account.stripeAccountId}
            </p>
            <p>
              <span className="font-semibold">{t('status.bank')}:</span> {account.bankName ?? '-'}
            </p>
            <p>
              <span className="font-semibold">{t('status.last4')}:</span> {account.bankLast4 ?? '-'}
            </p>
            <p>
              <span className="font-semibold">{t('status.accountType')}:</span> {account.bankAccountType ?? '-'}
            </p>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-base font-bold text-slate-900">{t('schedule.title')}</h2>
        <p className="mt-1 text-sm text-slate-500">
          {t('schedule.nextPayout')}: {account.nextPayoutDate ? new Date(account.nextPayoutDate).toLocaleDateString(locale) : '-'}
        </p>

        <div className="mt-4 grid gap-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {(['daily', 'weekly', 'monthly'] as const).map((option) => (
              <label
                key={option}
                className={`flex h-12 cursor-pointer items-center justify-center rounded-lg border text-sm font-semibold ${
                  interval === option ? 'border-[#0D2B4E] bg-[#0D2B4E] text-white' : 'border-slate-300 text-slate-700'
                }`}
              >
                <input
                  type="radio"
                  className="hidden"
                  value={option}
                  checked={interval === option}
                  onChange={() => setInterval(option)}
                  disabled={!canWrite || !account.stripeAccountId}
                />
                {option === 'daily' ? t('schedule.daily') : option === 'weekly' ? t('schedule.weekly') : t('schedule.monthly')}
              </label>
            ))}
          </div>

          {interval === 'weekly' ? (
            <label className="text-sm font-semibold text-slate-700">
              {t('schedule.weeklyDay')}
              <select
                className="mt-1 h-12 w-full rounded-lg border border-slate-300 px-3 text-sm"
                value={weeklyAnchor}
                onChange={(event) => setWeeklyAnchor(event.target.value as WeeklyAnchor)}
                disabled={!canWrite || !account.stripeAccountId}
              >
                <option value="monday">{t('days.monday')}</option>
                <option value="tuesday">{t('days.tuesday')}</option>
                <option value="wednesday">{t('days.wednesday')}</option>
                <option value="thursday">{t('days.thursday')}</option>
                <option value="friday">{t('days.friday')}</option>
                <option value="saturday">{t('days.saturday')}</option>
                <option value="sunday">{t('days.sunday')}</option>
              </select>
            </label>
          ) : null}

          {interval === 'monthly' ? (
            <label className="text-sm font-semibold text-slate-700">
              {t('schedule.monthlyDay')}
              <select
                className="mt-1 h-12 w-full rounded-lg border border-slate-300 px-3 text-sm"
                value={String(monthlyAnchor)}
                onChange={(event) => setMonthlyAnchor(Number(event.target.value))}
                disabled={!canWrite || !account.stripeAccountId}
              >
                {Array.from({ length: 28 }, (_, index) => index + 1).map((day) => (
                  <option key={day} value={String(day)}>
                    {day}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <button
            type="button"
            onClick={submitSchedule}
            disabled={!canWrite || !account.stripeAccountId || isPending}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-[#0D2B4E] px-4 text-sm font-semibold text-white disabled:opacity-60"
          >
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {t('schedule.save')}
          </button>
        </div>
      </section>
    </div>
  );
}
