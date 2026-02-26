'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

export default function AddToHomeBanner({ slug }: { slug: string }) {
  const t = useTranslations('consumer.addToHome');
  const [visible, setVisible] = useState(false);
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);

  const dismissKey = useMemo(() => `mq_consumer_install_dismissed_${slug}`, [slug]);
  const visitKey = useMemo(() => `mq_consumer_visits_${slug}`, [slug]);

  useEffect(() => {
    const visits = Number(window.localStorage.getItem(visitKey) ?? '0') + 1;
    window.localStorage.setItem(visitKey, String(visits));

    const dismissed = window.localStorage.getItem(dismissKey) === '1';
    if (!dismissed && visits >= 2) {
      setVisible(true);
    }

    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setPromptEvent(event as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstall);
  }, [dismissKey, visitKey]);

  if (!visible) return null;

  return (
    <div className="mb-3 rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
      <p className="font-semibold">{t('title')}</p>
      <p className="mt-1">{t('subtitle')}</p>
      <div className="mt-3 flex gap-2">
        {promptEvent ? (
          <button
            type="button"
            onClick={async () => {
              await promptEvent.prompt();
              await promptEvent.userChoice;
              setVisible(false);
            }}
            className="inline-flex h-11 items-center rounded-lg bg-[#0D2B4E] px-4 text-sm font-semibold text-white"
          >
            {t('install')}
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => {
            window.localStorage.setItem(dismissKey, '1');
            setVisible(false);
          }}
          className="inline-flex h-11 items-center rounded-lg border border-sky-300 bg-white px-4 text-sm font-semibold text-sky-900"
        >
          {t('dismiss')}
        </button>
      </div>
    </div>
  );
}
