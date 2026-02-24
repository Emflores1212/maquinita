'use client';

import { useTranslations } from 'next-intl';

export default function MachineDetailPlaceholder({ id }: { id: string }) {
  const t = useTranslations('machineDetail');

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6">
      <h2 className="text-lg font-bold text-slate-900">{t('title', { id })}</h2>
      <p className="mt-2 text-sm text-slate-600">{t('description')}</p>
    </div>
  );
}
