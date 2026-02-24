'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { updateLanguage } from '@/app/actions/preferences';

export default function LanguageToggle() {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations('topbar');
  const [isPending, startTransition] = useTransition();

  const nextLocale = locale === 'es' ? 'en' : 'es';

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => {
        startTransition(async () => {
          await updateLanguage(nextLocale);
          router.refresh();
        });
      }}
      className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
      aria-label={t('language')}
    >
      {locale.toUpperCase()}
    </button>
  );
}
