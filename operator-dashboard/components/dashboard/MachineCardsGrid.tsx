'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';

type MachineCard = {
  id: string;
  name: string;
  location: string | null;
  status: string | null;
  temperature: number | null;
  todayRevenue: number;
};

function statusDot(status: string | null) {
  const value = (status ?? '').toLowerCase();
  if (value === 'online') return '🟢';
  if (value === 'offline') return '🔴';
  if (value.includes('warning')) return '🟠';
  if (value.includes('error')) return '🟡';
  return '⚪';
}

export default function MachineCardsGrid({ machines }: { machines: MachineCard[] }) {
  const t = useTranslations('dashboard.machinesGrid');

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="mb-4 text-lg font-bold text-slate-900">{t('title')}</h3>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {machines.map((machine) => (
          <Link key={machine.id} href={`/machines/${machine.id}`} className="rounded-xl border border-slate-200 p-4 transition-colors hover:bg-slate-50">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="truncate text-sm font-bold text-slate-900">{machine.name}</p>
              <span className="text-sm">{statusDot(machine.status)}</span>
            </div>
            <p className="text-xs text-slate-500">
              {t('location')}: {machine.location ?? '-'}
            </p>
            <p className="mt-2 text-xs text-slate-500">
              {t('temperature')}: {machine.temperature ?? '-'}
            </p>
            <p className="mt-2 text-sm font-semibold text-slate-800">
              {t('todayRevenue')}: ${machine.todayRevenue.toFixed(2)}
            </p>
            <p className="mt-3 text-xs font-semibold text-[#1565C0]">{t('goToMachine')}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
