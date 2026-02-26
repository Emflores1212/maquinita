'use client';

import { useMemo, useState, useTransition } from 'react';
import { Loader2, Star } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  submitConsumerFeedbackAction,
  updateConsumerNotificationOptInAction,
} from '@/app/actions/consumer';
import type { ConsumerFeedbackTarget, ConsumerPurchaseRow } from '@/components/consumer/types';

function money(value: number, locale = 'en-US') {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(value);
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

type FeedbackDraft = {
  rating: number;
  comment: string;
};

export default function ConsumerProfileClient({
  slug,
  operatorId,
  fullName,
  phone,
  creditBalance,
  purchases,
  feedbackTargets,
  notificationOptIn,
}: {
  slug: string;
  operatorId: string;
  fullName: string | null;
  phone: string | null;
  creditBalance: number;
  purchases: ConsumerPurchaseRow[];
  feedbackTargets: ConsumerFeedbackTarget[];
  notificationOptIn: boolean;
}) {
  const t = useTranslations('consumer.profile');

  const [pushEnabled, setPushEnabled] = useState(notificationOptIn);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [feedbackDrafts, setFeedbackDrafts] = useState<Record<string, FeedbackDraft>>(() => {
    const next: Record<string, FeedbackDraft> = {};
    for (const target of feedbackTargets) {
      next[target.transactionId] = { rating: 5, comment: '' };
    }
    return next;
  });
  const [submittedTargets, setSubmittedTargets] = useState<Record<string, boolean>>({});

  const [isPending, startTransition] = useTransition();

  const vapidKey = useMemo(() => process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '', []);

  const updatePushPreference = (enabled: boolean) => {
    setErrorMessage(null);
    setStatusMessage(null);

    startTransition(async () => {
      const result = await updateConsumerNotificationOptInAction({
        operatorId,
        notificationOptIn: enabled,
      });

      if (!result.ok) {
        setPushEnabled(!enabled);
        setErrorMessage(result.error ?? t('pushUpdateError'));
        return;
      }

      setStatusMessage(enabled ? t('pushEnabled') : t('pushDisabled'));
    });
  };

  const enablePush = async () => {
    if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
      setErrorMessage(t('pushNotSupported'));
      setPushEnabled(false);
      return;
    }

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      setErrorMessage(t('pushPermissionDenied'));
      setPushEnabled(false);
      return;
    }

    if (!vapidKey) {
      setErrorMessage(t('pushConfigMissing'));
      setPushEnabled(false);
      return;
    }

    const scope = `/${slug}/`;
    const registration = await navigator.serviceWorker.register('/sw.js', { scope });
    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });
    }

    const response = await fetch('/api/consumer/push-subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        operatorId,
        subscription: subscription.toJSON(),
      }),
    });

    if (!response.ok) {
      setErrorMessage(t('pushSubscribeError'));
      setPushEnabled(false);
      return;
    }

    updatePushPreference(true);
  };

  const disablePush = async () => {
    const scope = `/${slug}/`;
    const registration = await navigator.serviceWorker.getRegistration(scope);
    const subscription = await registration?.pushManager.getSubscription();

    if (subscription) {
      const endpoint = subscription.endpoint;
      await subscription.unsubscribe().catch(() => undefined);

      await fetch('/api/consumer/push-subscribe', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operatorId,
          endpoint,
        }),
      }).catch(() => undefined);
    }

    updatePushPreference(false);
  };

  const handleTogglePush = (checked: boolean) => {
    setPushEnabled(checked);
    setErrorMessage(null);
    setStatusMessage(null);

    void (checked ? enablePush() : disablePush());
  };

  const submitFeedback = (target: ConsumerFeedbackTarget) => {
    const draft = feedbackDrafts[target.transactionId];
    if (!draft || draft.rating < 1 || draft.rating > 5) {
      setErrorMessage(t('feedback.invalidRating'));
      return;
    }

    setErrorMessage(null);
    setStatusMessage(null);

    startTransition(async () => {
      const result = await submitConsumerFeedbackAction({
        operatorId,
        transactionId: target.transactionId,
        machineId: target.machineId,
        productId: target.productId,
        rating: draft.rating,
        comment: draft.comment,
      });

      if (!result.ok) {
        setErrorMessage(result.error ?? t('feedback.submitError'));
        return;
      }

      setSubmittedTargets((current) => ({
        ...current,
        [target.transactionId]: true,
      }));
      setStatusMessage(t('feedback.submitted'));
    });
  };

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('hello')}</p>
        <h2 className="text-lg font-bold text-slate-900">{fullName || phone || t('guest')}</h2>
        <p className="mt-1 text-sm text-slate-500">{phone || '-'}</p>

        <div className="mt-4 rounded-xl px-4 py-4 text-white" style={{ backgroundColor: 'var(--brand-primary, #0D2B4E)' }}>
          <p className="text-xs font-semibold uppercase tracking-wide text-white/80">{t('credits')}</p>
          <p className="text-3xl font-extrabold">{money(creditBalance)}</p>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">{t('pushTitle')}</h3>
            <p className="text-xs text-slate-500">{t('pushSubtitle')}</p>
          </div>
          <label className="inline-flex cursor-pointer items-center gap-2">
            <input type="checkbox" checked={pushEnabled} onChange={(event) => handleTogglePush(event.target.checked)} className="h-5 w-5" />
          </label>
        </div>
      </section>

      {statusMessage ? <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{statusMessage}</div> : null}
      {errorMessage ? <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{errorMessage}</div> : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-900">{t('historyTitle')}</h3>
        <div className="mt-3 space-y-2">
          {purchases.length === 0 ? <p className="text-sm text-slate-500">{t('noPurchases')}</p> : null}
          {purchases.map((purchase) => (
            <article key={purchase.id} className="rounded-lg border border-slate-200 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-900">{money(purchase.amount)}</p>
                <p className="text-xs text-slate-500">{new Date(purchase.createdAt).toLocaleString()}</p>
              </div>
              <p className="mt-1 text-xs text-slate-600">{purchase.machineName}</p>
              <p className="text-xs text-slate-500">{purchase.itemsSummary}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-900">{t('feedback.title')}</h3>
        <div className="mt-3 space-y-3">
          {feedbackTargets.length === 0 ? <p className="text-sm text-slate-500">{t('feedback.nonePending')}</p> : null}
          {feedbackTargets.map((target) => {
            const draft = feedbackDrafts[target.transactionId] ?? { rating: 5, comment: '' };
            const alreadySubmitted = submittedTargets[target.transactionId] === true;

            return (
              <article key={target.transactionId} className="rounded-lg border border-slate-200 p-3">
                <p className="text-sm font-semibold text-slate-900">{target.productName}</p>
                <p className="text-xs text-slate-500">{target.machineName}</p>

                <div className="mt-2 flex items-center gap-1">
                  {Array.from({ length: 5 }).map((_, index) => {
                    const value = index + 1;
                    const active = draft.rating >= value;
                    return (
                      <button
                        key={value}
                        type="button"
                        disabled={alreadySubmitted}
                        onClick={() =>
                          setFeedbackDrafts((current) => ({
                            ...current,
                            [target.transactionId]: {
                              ...draft,
                              rating: value,
                            },
                          }))
                        }
                        className="p-1"
                      >
                        <Star className={`h-5 w-5 ${active ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`} />
                      </button>
                    );
                  })}
                </div>

                <textarea
                  value={draft.comment}
                  disabled={alreadySubmitted}
                  onChange={(event) =>
                    setFeedbackDrafts((current) => ({
                      ...current,
                      [target.transactionId]: {
                        ...draft,
                        comment: event.target.value,
                      },
                    }))
                  }
                  rows={3}
                  placeholder={t('feedback.commentPlaceholder')}
                  className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />

                <button
                  type="button"
                  disabled={alreadySubmitted || isPending}
                  onClick={() => submitFeedback(target)}
                  className="mt-2 inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-[#0D2B4E] px-4 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {alreadySubmitted ? t('feedback.sent') : t('feedback.submit')}
                </button>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
