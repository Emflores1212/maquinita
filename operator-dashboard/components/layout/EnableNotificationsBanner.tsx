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

export default function EnableNotificationsBanner() {
  const t = useTranslations('notifications.banner');
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
        if (!cancelled) {
          setIsEnabled(false);
        }
      }
    };

    void checkExistingSubscription();

    return () => {
      cancelled = true;
    };
  }, [isSupported]);

  if (!isSupported || !user || !operatorId || permission === 'denied' || isEnabled) {
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
      } catch {
        setFeedback(t('subscribeError'));
      }
    });
  };

  return (
    <div className="mb-4 rounded-xl border border-sky-200 bg-sky-50 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 rounded-md bg-sky-100 p-2 text-sky-700">
            <BellRing className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-semibold text-sky-900">{t('title')}</p>
            <p className="text-sm text-sky-800">{t('description')}</p>
            {feedback ? <p className="mt-1 text-xs text-red-600">{feedback}</p> : null}
          </div>
        </div>

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
  );
}
