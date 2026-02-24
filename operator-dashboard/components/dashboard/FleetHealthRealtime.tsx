'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { createBrowserClient } from '@/lib/supabase-browser';

type Machine = {
  id: string;
  operator_id: string;
  name: string;
  status: string | null;
  temperature: number | null;
  settings?: { tempThreshold?: number } | null;
};

function updateMachineInState(current: Machine[], payload: { eventType: string; new: any; old: any }): Machine[] {
  const incoming = payload.new as Machine;
  const previous = payload.old as Machine;

  if (payload.eventType === 'INSERT') {
    return [...current.filter((machine) => machine.id !== incoming.id), incoming];
  }

  if (payload.eventType === 'UPDATE') {
    return current.map((machine) => (machine.id === incoming.id ? incoming : machine));
  }

  if (payload.eventType === 'DELETE') {
    return current.filter((machine) => machine.id !== previous.id);
  }

  return current;
}

function isWarning(machine: Machine) {
  const status = (machine.status ?? '').toLowerCase();
  if (status.includes('warning') || status.includes('error')) {
    return true;
  }

  const threshold = Number(machine.settings?.tempThreshold ?? 42);
  return machine.temperature !== null && Number(machine.temperature) >= threshold;
}

export default function FleetHealthRealtime({
  operatorId,
  initialMachines,
}: {
  operatorId: string;
  initialMachines: Machine[];
}) {
  const t = useTranslations('dashboard.fleet');
  const tStatus = useTranslations('status');
  const [machines, setMachines] = useState<Machine[]>(initialMachines);
  const [isLive, setIsLive] = useState(false);

  useEffect(() => {
    const supabase = createBrowserClient();

    const channel = supabase
      .channel(`machines-${operatorId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'machines',
          filter: `operator_id=eq.${operatorId}`,
        },
        (payload) => {
          setMachines((current) => updateMachineInState(current, payload));
        }
      )
      .subscribe((status) => {
        setIsLive(status === 'SUBSCRIBED');
      });

    return () => {
      channel.unsubscribe();
    };
  }, [operatorId]);

  const stats = useMemo(() => {
    const total = machines.length;
    const online = machines.filter((machine) => (machine.status ?? '').toLowerCase() === 'online').length;
    const offline = machines.filter((machine) => (machine.status ?? '').toLowerCase() === 'offline').length;
    const warnings = machines.filter((machine) => isWarning(machine)).length;

    return { total, online, offline, warnings };
  }, [machines]);

  const cards = [
    { label: t('total'), value: stats.total, color: 'bg-slate-100 text-slate-700' },
    { label: t('online'), value: stats.online, color: 'bg-emerald-100 text-emerald-700' },
    { label: t('offline'), value: stats.offline, color: 'bg-red-100 text-red-700' },
    { label: t('warnings'), value: stats.warnings, color: 'bg-amber-100 text-amber-700' },
  ];

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-bold text-slate-900">{t('title')}</h3>
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
          <span className={`h-2 w-2 rounded-full ${isLive ? 'bg-emerald-500' : 'bg-slate-300'}`} />
          {isLive ? tStatus('live') : '---'}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {cards.map((card) => (
          <div key={card.label} className="rounded-xl border border-slate-200 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{card.label}</p>
            <div className="mt-2 flex items-center gap-2">
              <span className={`rounded-md px-2 py-1 text-sm font-bold ${card.color}`}>{card.value}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
