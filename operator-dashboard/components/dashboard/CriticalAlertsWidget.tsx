'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { createBrowserClient } from '@/lib/supabase-browser';

type AlertRow = {
  id: string;
  operator_id: string;
  machine_id: string | null;
  type: string;
  message: string | null;
  created_at: string | null;
  resolved_at: string | null;
  machine_name?: string;
};

function badgeClass(type: string) {
  if (type === 'OFFLINE') return 'bg-red-100 text-red-700';
  if (type === 'TOO_WARM') return 'bg-orange-100 text-orange-700';
  if (type === 'RFID_ERROR') return 'bg-yellow-100 text-yellow-700';
  if (type === 'LOW_STOCK') return 'bg-blue-100 text-blue-700';
  return 'bg-slate-100 text-slate-700';
}

function timeSince(value: string | null, sinceLabel: string, justNow: string) {
  if (!value) return justNow;
  const diffMs = Date.now() - new Date(value).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return justNow;
  if (minutes < 60) return `${minutes}m ${sinceLabel}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${sinceLabel}`;
  const days = Math.floor(hours / 24);
  return `${days}d ${sinceLabel}`;
}

function mergeAlertState(current: AlertRow[], payload: { eventType: string; new: any; old: any }): AlertRow[] {
  const nextAlert = payload.new as AlertRow;
  const oldAlert = payload.old as AlertRow;

  if (payload.eventType === 'INSERT') {
    return [nextAlert, ...current.filter((alert) => alert.id !== nextAlert.id)];
  }

  if (payload.eventType === 'UPDATE') {
    return current.map((alert) => (alert.id === nextAlert.id ? nextAlert : alert));
  }

  if (payload.eventType === 'DELETE') {
    return current.filter((alert) => alert.id !== oldAlert.id);
  }

  return current;
}

export default function CriticalAlertsWidget({
  operatorId,
  initialAlerts,
}: {
  operatorId: string;
  initialAlerts: AlertRow[];
}) {
  const t = useTranslations('dashboard.alerts');
  const tCommon = useTranslations('common');
  const locale = useLocale();
  const [alerts, setAlerts] = useState<AlertRow[]>(initialAlerts);

  useEffect(() => {
    const supabase = createBrowserClient();

    const channel = supabase
      .channel(`alerts-widget-${operatorId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'alerts',
          filter: `operator_id=eq.${operatorId}`,
        },
        (payload) => {
          setAlerts((current) => mergeAlertState(current, payload).filter((alert) => !alert.resolved_at));
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [operatorId]);

  const activeAlerts = alerts.filter((alert) => !alert.resolved_at).slice(0, 10);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="mb-4 text-lg font-bold text-slate-900">{t('title')}</h3>

      {activeAlerts.length === 0 ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-700">{t('allGood')}</div>
      ) : (
        <div className="space-y-3">
          {activeAlerts.map((alert) => (
            <div key={alert.id} className="rounded-xl border border-slate-200 p-4">
              <div className="mb-2 flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{alert.machine_name ?? alert.machine_id ?? '-'}</p>
                  <p className="text-sm text-slate-600">{alert.message ?? alert.type}</p>
                </div>
                <span className={`rounded-full px-2 py-1 text-xs font-bold ${badgeClass(alert.type)}`}>{alert.type}</span>
              </div>
              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-400">{timeSince(alert.created_at, tCommon('since'), tCommon('justNow'))}</p>
                {alert.machine_id ? (
                  <Link href={`/machines/${alert.machine_id}`} className="text-xs font-semibold text-[#1565C0] hover:text-[#0D2B4E]">
                    {t('goToMachine')}
                  </Link>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
