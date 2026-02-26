'use client';

import { useEffect, useState, useTransition } from 'react';
import { BellRing } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/components/providers/AuthProvider';
import { getCurrentPushSubscription, isPushSupported, subscribeToPush } from '@/lib/push-client';

const BANNER_DISMISSED_KEY = 'maquinita_notifications_banner_dismissed';

export default function EnableNotificationsBanner() {
  const t = useTranslations('notifications.banner');
  const { user, operatorId } = useAuth();
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [isEnabled, setIsEnabled] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const supported = isPushSupported();

  useEffect(() => {
    if (!supported) return;
    setIsDismissed(window.localStorage.getItem(BANNER_DISMISSED_KEY) === '1');
    setPermission(Notification.permission);

    let cancelled = false;

    const checkExistingSubscription = async () => {
      try {
        const subscription = await getCurrentPushSubscription();

        if (!cancelled) {
          setIsEnabled(Boolean(subscription));
        }
      } catch {
        if (!cancelled) {
          setIsEnabled(false);
        }
      }
    };

    void checkExistingSubscription();

    return () => {
      cancelled = true;
    };
  }, [supported]);

  if (!supported || !user || !operatorId || permission === 'denied' || isEnabled || isDismissed) {
    return null;
  }

  const dismissBanner = () => {
    setIsDismissed(true);
    window.localStorage.setItem(BANNER_DISMISSED_KEY, '1');
  };

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

        const subscription = await subscribeToPush(vapidPublicKey);

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
      } catch {
        setFeedback(t('subscribeError'));
      }
    });
  };

  return (
    <div className="mb-4 rounded-xl border border-sky-200 bg-sky-50 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 rounded-md bg-sky-100 p-2 text-sky-700">
            <BellRing className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-sky-900">{t('title')}</p>
            <p className="text-sm text-sky-800">{t('description')}</p>
            {feedback ? <p className="mt-1 text-xs text-red-600">{feedback}</p> : null}
          </div>
        </div>

        <div className="flex gap-2 self-end sm:self-auto">
          <button
            type="button"
            onClick={dismissBanner}
            className="min-h-12 rounded-lg border border-sky-300 bg-white px-4 py-3 text-sm font-semibold text-sky-800 hover:bg-sky-100"
          >
            Dismiss
          </button>
          <button
            type="button"
            onClick={enableNotifications}
            disabled={isPending}
            className="min-h-12 rounded-lg bg-[#0D2B4E] px-4 py-3 text-sm font-semibold text-white hover:bg-[#0A2240] disabled:opacity-70"
          >
            {isPending ? t('enabling') : t('action')}
          </button>
        </div>
      </div>
    </div>
  );
}
