'use client';

import Link from 'next/link';
import { AlertTriangle, Gauge, Settings2, ShieldAlert, Wrench } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { DriverProfile, MachineAlert, MachineDetailData } from '@/components/machines/types';
import { statusColor } from '@/components/machines/helpers';
import MachineSettingsForm from '@/components/machines/MachineSettingsForm';

function formatLastSeen(value: string | null) {
  if (!value) return '-';
  return new Date(value).toLocaleString();
}

function formatTemp(value: number | null, unit: string) {
  if (value === null || Number.isNaN(Number(value))) return '-';
  return `${Number(value).toFixed(1)}°${unit.toUpperCase()}`;
}

export default function MachineDetailTabs({
  machine,
  metrics,
  recentAlerts,
  drivers,
}: {
  machine: MachineDetailData;
  metrics: { revenue: number; transactionCount: number; itemsSold: number };
  recentAlerts: MachineAlert[];
  drivers: DriverProfile[];
}) {
  const t = useTranslations('machineDetail');
  const settings = machine.settings ?? {};

  const temperatureUnit = String(settings.temperatureUnit ?? 'f').toLowerCase() === 'c' ? 'c' : 'f';
  const threshold = Number(settings.tempThreshold ?? 42);
  const temp = Number(machine.temperature ?? 0);
  const gaugePercent = Math.max(0, Math.min(100, (temp / Math.max(threshold, 1)) * 100));

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold text-slate-900">{machine.name}</h1>
          <span className={`rounded-full px-2 py-1 text-xs font-bold ${statusColor(machine.status)}`}>{machine.status ?? '-'}</span>
          <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700">{machine.type}</span>
          <span className="rounded-full bg-sky-100 px-2 py-1 text-xs font-bold text-sky-700">{formatTemp(machine.temperature, temperatureUnit)}</span>
        </div>

        <p className="text-sm text-slate-600">{machine.location_name ?? machine.address ?? '-'}</p>
        <p className="mt-1 text-xs text-slate-500">
          {t('lastSeen')}: {formatLastSeen(machine.last_seen_at)}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Link href={`/machines/${machine.id}/edit`} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
            <Settings2 className="h-3.5 w-3.5" />
            {t('editMachine')}
          </Link>
          <Link href={`/machines/${machine.id}/qr`} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
            {t('openQr')}
          </Link>
        </div>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="h-auto w-full flex-wrap justify-start gap-1 bg-transparent p-0">
          <TabsTrigger value="overview">{t('tabs.overview')}</TabsTrigger>
          <TabsTrigger value="inventory">{t('tabs.inventory')}</TabsTrigger>
          <TabsTrigger value="restock">{t('tabs.restock')}</TabsTrigger>
          <TabsTrigger value="transactions">{t('tabs.transactions')}</TabsTrigger>
          <TabsTrigger value="financials">{t('tabs.financials')}</TabsTrigger>
          <TabsTrigger value="settings">{t('tabs.settings')}</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm lg:col-span-1">
              <div className="mb-3 flex items-center gap-2">
                <Gauge className="h-4 w-4 text-slate-600" />
                <p className="text-sm font-semibold text-slate-800">{t('temperatureGauge')}</p>
              </div>
              <div className="mb-2 h-3 overflow-hidden rounded-full bg-slate-100">
                <div className={`h-full ${gaugePercent > 95 ? 'bg-red-500' : gaugePercent > 80 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${gaugePercent}%` }} />
              </div>
              <p className="text-xs text-slate-500">
                {formatTemp(machine.temperature, temperatureUnit)} / {formatTemp(threshold, temperatureUnit)}
              </p>
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm lg:col-span-1">
              <p className="mb-2 text-sm font-semibold text-slate-800">{t('todayMetrics')}</p>
              <div className="space-y-2 text-sm text-slate-700">
                <p>
                  {t('revenue')}: <span className="font-semibold">${metrics.revenue.toFixed(2)}</span>
                </p>
                <p>
                  {t('transactions')}: <span className="font-semibold">{metrics.transactionCount}</span>
                </p>
                <p>
                  {t('items')}: <span className="font-semibold">{metrics.itemsSold}</span>
                </p>
              </div>
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm lg:col-span-1">
              <p className="mb-2 text-sm font-semibold text-slate-800">{t('commands')}</p>
              <div className="grid grid-cols-1 gap-2">
                <button className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50" type="button">
                  <Wrench className="h-3.5 w-3.5" />
                  {t('runDiagnostics')}
                </button>
                <button className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50" type="button">
                  <ShieldAlert className="h-3.5 w-3.5" />
                  {t('remoteLockdown')}
                </button>
              </div>
            </section>
          </div>

          <section className="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-slate-600" />
              <p className="text-sm font-semibold text-slate-800">{t('recentAlerts')}</p>
            </div>
            <div className="space-y-2">
              {recentAlerts.length === 0 ? (
                <p className="text-sm text-slate-500">{t('noRecentAlerts')}</p>
              ) : (
                recentAlerts.map((alert) => (
                  <div key={alert.id} className="rounded-lg border border-slate-200 px-3 py-2">
                    <p className="text-xs font-bold text-slate-700">{alert.type}</p>
                    <p className="text-sm text-slate-600">{alert.message ?? '-'}</p>
                    <p className="mt-1 text-xs text-slate-400">{alert.created_at ? new Date(alert.created_at).toLocaleString() : '-'}</p>
                  </div>
                ))
              )}
            </div>
          </section>
        </TabsContent>

        <TabsContent value="inventory">
          <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">{t('phase2Placeholder')}</div>
        </TabsContent>

        <TabsContent value="restock">
          <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">{t('phase2Placeholder')}</div>
        </TabsContent>

        <TabsContent value="transactions">
          <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">{t('phase3Placeholder')}</div>
        </TabsContent>

        <TabsContent value="financials">
          <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">{t('phase3Placeholder')}</div>
        </TabsContent>

        <TabsContent value="settings">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <MachineSettingsForm machine={machine} drivers={drivers} />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
