'use client';

import { useTranslations } from 'next-intl';

type ModulePlaceholderProps = {
  titleKey:
    | 'machines'
    | 'products'
    | 'inventory'
    | 'restock'
    | 'transactions'
    | 'financials'
    | 'discounts'
    | 'analytics'
    | 'settings';
};

export default function ModulePlaceholder({ titleKey }: ModulePlaceholderProps) {
  const tNav = useTranslations('nav');
  const tModule = useTranslations('modules');

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6">
      <h2 className="text-lg font-bold text-slate-900">{tNav(titleKey)}</h2>
      <p className="mt-2 text-sm text-slate-600">{tModule('comingSoon')}</p>
    </div>
  );
}
