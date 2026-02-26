'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { BellRing } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/components/providers/AuthProvider';

function base64UrlToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }

  return outputArray;
}

export default function NotificationSettingsCard() {
  const t = useTranslations('settingsPage.notifications');
  const { user, operatorId } = useAuth();
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [isEnabled, setIsEnabled] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const isSupported = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
  }, []);

  useEffect(() => {
    if (!isSupported) return;
    setPermission(Notification.permission);

    let cancelled = false;
    const checkExistingSubscription = async () => {
      try {
        const registration = await navigator.serviceWorker.getRegistration();
        const subscription = await registration?.pushManager.getSubscription();
        if (!cancelled) {
          setIsEnabled(Boolean(subscription));
        }
      } catch {
        if (!cancelled) setIsEnabled(false);
      }
    };

    void checkExistingSubscription();

    return () => {
      cancelled = true;
    };
  }, [isSupported]);

  if (!user || !operatorId) {
    return null;
  }

  const enableNotifications = () => {
    setFeedback(null);
    startTransition(async () => {
      try {
        const requestedPermission = await Notification.requestPermission();
        setPermission(requestedPermission);

        if (requestedPermission !== 'granted') {
          setFeedback(t('permissionDenied'));
          return;
        }

        const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
        if (!vapidPublicKey) {
          setFeedback(t('missingKey'));
          return;
        }

        const registration = await navigator.serviceWorker.register('/sw.js');
        let subscription = await registration.pushManager.getSubscription();

        if (!subscription) {
          subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: base64UrlToUint8Array(vapidPublicKey),
          });
        }

        const response = await fetch('/api/push/subscribe', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ subscription }),
        });

        if (!response.ok) {
          setFeedback(t('subscribeError'));
          return;
        }

        setIsEnabled(true);
        setPermission('granted');
        setFeedback(t('enabled'));
      } catch {
        setFeedback(t('subscribeError'));
      }
    });
  };

  const disableNotifications = () => {
    setFeedback(null);
    startTransition(async () => {
      try {
        const registration = await navigator.serviceWorker.getRegistration();
        const subscription = await registration?.pushManager.getSubscription();
        if (!subscription) {
          setIsEnabled(false);
          setFeedback(t('disabled'));
          return;
        }

        await fetch('/api/push/subscribe', {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });

        await subscription.unsubscribe();
        setIsEnabled(false);
        setFeedback(t('disabled'));
      } catch {
        setFeedback(t('unsubscribeError'));
      }
    });
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="rounded-md bg-sky-100 p-2 text-sky-700">
          <BellRing className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold text-slate-900">{t('title')}</h2>
          <p className="mt-1 text-sm text-slate-600">{t('subtitle')}</p>
          <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-sm font-medium text-slate-800">
              {isSupported ? (isEnabled ? t('statusEnabled') : t('statusDisabled')) : t('notSupported')}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {permission === 'denied' ? t('permissionDenied') : t('subtitle')}
            </p>
          </div>
          {feedback ? <p className="mt-2 text-xs font-medium text-slate-600">{feedback}</p> : null}

          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={enableNotifications}
              disabled={!isSupported || isPending || permission === 'denied'}
              className="min-h-12 rounded-lg bg-[#0D2B4E] px-4 py-3 text-sm font-semibold text-white hover:bg-[#0A2240] disabled:opacity-60"
            >
              {isPending ? t('working') : t('enableAction')}
            </button>
            <button
              type="button"
              onClick={disableNotifications}
              disabled={!isSupported || isPending || !isEnabled}
              className="min-h-12 rounded-lg border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 disabled:opacity-60"
            >
              {t('disableAction')}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
