'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  Gauge,
  Loader2,
  RotateCw,
  Settings2,
  ShieldAlert,
  Thermometer,
  Unlock,
  Lock,
  Wifi,
  Cable,
  Smartphone,
  ChevronDown,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { issueCommand } from '@/app/actions/machine-commands';
import { resolveMachineAlertAction } from '@/app/actions/machines';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type {
  DriverProfile,
  MachineAlert,
  MachineAlertPreference,
  MachineCommandHistoryItem,
  MachineDetailData,
  TeamMemberProfile,
  TemperatureReadingPoint,
} from '@/components/machines/types';
import { statusColor } from '@/components/machines/helpers';
import MachineSettingsForm from '@/components/machines/MachineSettingsForm';
import { createBrowserClient } from '@/lib/supabase-browser';
import { errorCodes } from '@/lib/errorCodes';

type CommandType = 'LOCKDOWN' | 'UNLOCK' | 'REBOOT' | 'TEMP_ADJUST';
type CommandStatus = 'pending' | 'acknowledged' | 'executed' | 'failed';

type CommandProgress = {
  commandId: string;
  status: CommandStatus;
  errorMessage?: string | null;
  issuedAt: string;
};

function formatLastSeen(value: string | null) {
  if (!value) return '-';
  return new Date(value).toLocaleString();
}

function formatTemp(value: number | null, unit: string) {
  if (value === null || Number.isNaN(Number(value))) return '-';
  return `${Number(value).toFixed(1)}°${unit.toUpperCase()}`;
}

function timeSince(value: string | null) {
  if (!value) return '-';
  const diffMs = Date.now() - new Date(value).getTime();
  const minutes = Math.max(0, Math.floor(diffMs / 60000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function resolveBadge(type: string) {
  if (type === 'OFFLINE') return 'bg-red-100 text-red-700';
  if (type === 'TOO_WARM') return 'bg-orange-100 text-orange-700';
  if (type === 'RFID_ERROR') return 'bg-yellow-100 text-yellow-700';
  if (type === 'LOW_STOCK') return 'bg-blue-100 text-blue-700';
  return 'bg-slate-100 text-slate-700';
}

function commandBadge(status: string) {
  if (status === 'executed') return 'bg-emerald-100 text-emerald-700';
  if (status === 'acknowledged') return 'bg-blue-100 text-blue-700';
  if (status === 'failed') return 'bg-red-100 text-red-700';
  return 'bg-slate-100 text-slate-700';
}

function commandText(status: CommandStatus, tLabel: (key: string) => string) {
  if (status === 'pending') return tLabel('statusSending');
  if (status === 'acknowledged') return tLabel('statusAcknowledged');
  if (status === 'executed') return tLabel('statusExecuted');
  return tLabel('statusFailed');
}

function connectivityBadge(connectivityTypeRaw: string | null | undefined, tLabel: (key: string) => string) {
  const value = String(connectivityTypeRaw ?? '').toLowerCase();

  if (value.includes('ethernet')) {
    return {
      icon: Cable,
      label: tLabel('ethernet'),
      className: 'bg-blue-100 text-blue-700',
      isCellular: false,
    };
  }

  if (value.includes('cell')) {
    return {
      icon: Smartphone,
      label: tLabel('cellular'),
      className: 'bg-amber-100 text-amber-700',
      isCellular: true,
    };
  }

  return {
    icon: Wifi,
    label: tLabel('wifi'),
    className: 'bg-indigo-100 text-indigo-700',
    isCellular: false,
  };
}

function tempRangeForType(type: 'fridge' | 'pantry' | 'freezer') {
  if (type === 'fridge') return { min: 33, max: 45 };
  if (type === 'freezer') return { min: -10, max: 10 };
  return null;
}

function openHelpFallback() {
  window.dispatchEvent(new Event('maquinita:open-help'));
}

function getUrgencyRank(urgency: 'high' | 'medium' | 'low') {
  if (urgency === 'high') return 3;
  if (urgency === 'medium') return 2;
  return 1;
}

export default function MachineDetailTabs({
  machine,
  metrics,
  recentAlerts,
  activeAlerts,
  alertHistory,
  resolverNames,
  temperatureReadings,
  drivers,
  teamMembers,
  alertPreferences,
  commandHistory,
  supportEmail,
}: {
  machine: MachineDetailData;
  metrics: { revenue: number; transactionCount: number; itemsSold: number };
  recentAlerts: MachineAlert[];
  activeAlerts: MachineAlert[];
  alertHistory: MachineAlert[];
  resolverNames: Record<string, string>;
  temperatureReadings: TemperatureReadingPoint[];
  drivers: DriverProfile[];
  teamMembers: TeamMemberProfile[];
  alertPreferences: MachineAlertPreference[];
  commandHistory: MachineCommandHistoryItem[];
  supportEmail: string | null;
}) {
  const t = useTranslations('machineDetail');
  const settings = machine.settings ?? {};
  const supabaseRef = useRef(createBrowserClient());
  const activeChannelsRef = useRef<Array<{ channelName: string; timeoutId?: number }>>([]);

  const [isPending, startTransition] = useTransition();
  const [activeState, setActiveState] = useState<MachineAlert[]>(activeAlerts);
  const [historyState, setHistoryState] = useState<MachineAlert[]>(alertHistory);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'warning' | 'error' | 'info'; text: string } | null>(null);
  const [tempAdjustValue, setTempAdjustValue] = useState<number>(Number(settings.temperatureTarget ?? 38));
  const [commandState, setCommandState] = useState<Record<CommandType, CommandProgress | null>>(() => {
    const base: Record<CommandType, CommandProgress | null> = {
      LOCKDOWN: null,
      UNLOCK: null,
      REBOOT: null,
      TEMP_ADJUST: null,
    };

    for (const row of commandHistory) {
      if ((row.status === 'pending' || row.status === 'acknowledged') && !base[row.type]) {
        base[row.type] = {
          commandId: row.id,
          status: row.status,
          issuedAt: row.issued_at,
          errorMessage: row.error_message,
        };
      }
    }

    return base;
  });

  const temperatureUnit = String(settings.temperatureUnit ?? 'f').toLowerCase() === 'c' ? 'c' : 'f';
  const threshold = Number(settings.tempThreshold ?? 42);
  const temp = Number(machine.temperature ?? 0);
  const gaugePercent = Math.max(0, Math.min(100, (temp / Math.max(threshold, 1)) * 100));

  const chartData = useMemo(
    () =>
      temperatureReadings.map((row) => ({
        recordedAt: row.recorded_at ? new Date(row.recorded_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-',
        temperature: Number(row.temperature ?? 0),
      })),
    [temperatureReadings]
  );

  const lockState = String(settings.lockState ?? 'unlocked').toLowerCase();
  const locked = lockState === 'locked' || lockState === 'locked_pending';
  const connectivityInfo = connectivityBadge(settings.lastConnectivityType as string | null | undefined, (key) => t(`connectivity.${key}`));
  const heartbeatLabel = machine.last_seen_at ? timeSince(machine.last_seen_at) : t('connectivity.never');
  const tempRange = tempRangeForType(machine.type);

  const activeGuide = useMemo(() => {
    const enriched = activeState
      .map((alert) => {
        const guide = errorCodes[alert.type];
        if (!guide) return null;
        return { alert, guide };
      })
      .filter(Boolean) as Array<{ alert: MachineAlert; guide: (typeof errorCodes)[string] }>;

    if (enriched.length === 0) return null;

    return enriched.sort((a, b) => getUrgencyRank(b.guide.urgency) - getUrgencyRank(a.guide.urgency))[0];
  }, [activeState]);

  useEffect(() => {
    if (!feedback) return;
    const timeout = window.setTimeout(() => setFeedback(null), 4500);
    return () => window.clearTimeout(timeout);
  }, [feedback]);

  useEffect(() => {
    const supabase = supabaseRef.current;
    return () => {
      for (const item of activeChannelsRef.current) {
        const channel = supabase.getChannels().find((entry) => entry.topic === item.channelName);
        if (channel) {
          supabase.removeChannel(channel);
        }
        if (item.timeoutId) {
          window.clearTimeout(item.timeoutId);
        }
      }
      activeChannelsRef.current = [];
    };
  }, []);

  const startCommandTracking = (commandId: string, type: CommandType) => {
    const supabase = supabaseRef.current;
    const channelName = `machine-command-${commandId}`;
    const channel = supabase.channel(channelName);
    const trackingEntry: { channelName: string; timeoutId?: number } = { channelName };

    const removeTracking = () => {
      if (trackingEntry.timeoutId) {
        window.clearTimeout(trackingEntry.timeoutId);
      }
      supabase.removeChannel(channel);
      activeChannelsRef.current = activeChannelsRef.current.filter((item) => item.channelName !== channelName);
    };

    channel
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'machine_commands',
          filter: `id=eq.${commandId}`,
        },
        (payload) => {
          const next = payload.new as {
            status: CommandStatus;
            error_message: string | null;
          };

          setCommandState((current) => ({
            ...current,
            [type]: {
              ...(current[type] ?? { commandId, issuedAt: new Date().toISOString() }),
              commandId,
              issuedAt: current[type]?.issuedAt ?? new Date().toISOString(),
              status: next.status,
              errorMessage: next.error_message,
            },
          }));

          if (next.status === 'acknowledged') {
            setFeedback({ tone: 'info', text: t('commandsPanel.feedback.received') });
          }

          if (next.status === 'executed') {
            setFeedback({ tone: 'success', text: t('commandsPanel.feedback.executed') });
            removeTracking();
          }

          if (next.status === 'failed') {
            setFeedback({ tone: 'error', text: next.error_message || t('commandsPanel.feedback.failed') });
            removeTracking();
          }
        }
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          removeTracking();
        }
      });

    const timeoutId = window.setTimeout(() => {
      setCommandState((current) => {
        const currentRow = current[type];
        if (!currentRow || currentRow.commandId !== commandId) return current;
        if (currentRow.status === 'executed' || currentRow.status === 'failed') return current;

        setFeedback({ tone: 'warning', text: t('commandsPanel.feedback.timeout') });

        return {
          ...current,
          [type]: {
            ...currentRow,
            status: 'failed',
            errorMessage: t('commandsPanel.feedback.timeout'),
          },
        };
      });
      removeTracking();
    }, 5 * 60 * 1000);

    trackingEntry.timeoutId = timeoutId;
    activeChannelsRef.current.push(trackingEntry);
  };

  const runCommand = (type: CommandType, payload?: Record<string, unknown>) => {
    startTransition(async () => {
      const result = await issueCommand({
        machineId: machine.id,
        type,
        payload,
      });

      if (!result.ok || !result.id) {
        setFeedback({ tone: 'error', text: result.error ?? t('commandsPanel.feedback.issueError') });
        return;
      }

      setCommandState((current) => ({
        ...current,
        [type]: {
          commandId: result.id as string,
          status: 'pending',
          issuedAt: new Date().toISOString(),
        },
      }));

      setFeedback({ tone: 'info', text: t('commandsPanel.feedback.sending') });
      startCommandTracking(result.id as string, type);
    });
  };

  const resolveAlert = (alert: MachineAlert) => {
    setResolveError(null);

    startTransition(async () => {
      const result = await resolveMachineAlertAction({
        machineId: machine.id,
        alertId: alert.id,
      });

      if (!result.ok) {
        setResolveError(result.error ?? t('alerts.resolveError'));
        return;
      }

      const resolvedAt = new Date().toISOString();
      setActiveState((current) => current.filter((row) => row.id !== alert.id));
      setHistoryState((current) => [{ ...alert, resolved_at: resolvedAt, resolved_by: 'me' }, ...current]);
    });
  };

  const commandProgress = (type: CommandType) => commandState[type];
  const isRunning = (type: CommandType) => {
    const status = commandProgress(type)?.status;
    return status === 'pending' || status === 'acknowledged';
  };

  const supportHref = supportEmail
    ? `mailto:${supportEmail}?subject=${encodeURIComponent(`Support needed: ${machine.name} (${machine.mid})`)}&body=${encodeURIComponent(
        `Machine: ${machine.name}\nMID: ${machine.mid}\nActive alert: ${activeGuide?.alert.type ?? 'N/A'}\n\nPlease assist.`
      )}`
    : null;

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

      {activeGuide ? (
        <details className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm" open>
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-slate-700" />
              <p className="text-sm font-semibold text-slate-900">{activeGuide.guide.title}</p>
              <span
                className={`rounded-full px-2 py-1 text-xs font-semibold ${
                  activeGuide.guide.urgency === 'high'
                    ? 'bg-red-100 text-red-700'
                    : activeGuide.guide.urgency === 'medium'
                      ? 'bg-orange-100 text-orange-700'
                      : 'bg-blue-100 text-blue-700'
                }`}
              >
                {t(`errorGuide.urgency.${activeGuide.guide.urgency}`)}
              </span>
            </div>
            <ChevronDown className="h-4 w-4 text-slate-500" />
          </summary>
          <div className="mt-3 grid gap-4 lg:grid-cols-2">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{t('errorGuide.causes')}</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
                {activeGuide.guide.causes.map((cause) => (
                  <li key={cause}>{cause}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{t('errorGuide.steps')}</p>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-slate-700">
                {activeGuide.guide.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </div>
          </div>
          <div className="mt-3">
            {supportHref ? (
              <a
                href={supportHref}
                className="inline-flex min-h-12 items-center rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                {t('errorGuide.contactSupport')}
              </a>
            ) : (
              <button
                type="button"
                onClick={openHelpFallback}
                className="inline-flex min-h-12 items-center rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                {t('errorGuide.contactSupport')}
              </button>
            )}
          </div>
        </details>
      ) : null}

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="h-auto w-full flex-wrap justify-start gap-1 bg-transparent p-0">
          <TabsTrigger value="overview">{t('tabs.overview')}</TabsTrigger>
          <TabsTrigger value="inventory">{t('tabs.inventory')}</TabsTrigger>
          <TabsTrigger value="restock">{t('tabs.restock')}</TabsTrigger>
          <TabsTrigger value="transactions">{t('tabs.transactions')}</TabsTrigger>
          <TabsTrigger value="financials">{t('tabs.financials')}</TabsTrigger>
          <TabsTrigger value="alerts">{t('tabs.alerts')}</TabsTrigger>
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
              <p className="mb-2 text-sm font-semibold text-slate-800">{t('connectivity.title')}</p>
              <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${connectivityInfo.className}`}>
                <connectivityInfo.icon className="h-3.5 w-3.5" />
                {connectivityInfo.label}
              </div>
              <p className="mt-2 text-xs text-slate-500">
                {t('connectivity.lastHeartbeat')}: {heartbeatLabel}
              </p>
              {connectivityInfo.isCellular ? (
                <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
                  {t('connectivity.cellularBanner')}
                </p>
              ) : null}
            </section>
          </div>

          <section className="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="mb-3 text-sm font-semibold text-slate-800">{t('commandsPanel.title')}</p>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <button
                    type="button"
                    disabled={locked || isRunning('LOCKDOWN') || isPending}
                    className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                  >
                    <Lock className="h-4 w-4" />
                    {isRunning('LOCKDOWN') ? commandText(commandProgress('LOCKDOWN')?.status ?? 'pending', (key) => t(`commandsPanel.${key}`)) : t('commandsPanel.lockMachine')}
                  </button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t('commandsPanel.confirmLockTitle')}</AlertDialogTitle>
                    <AlertDialogDescription>{t('commandsPanel.confirmLockBody')}</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t('commandsPanel.cancel')}</AlertDialogCancel>
                    <AlertDialogAction onClick={() => runCommand('LOCKDOWN')}>{t('commandsPanel.confirm')}</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <button
                    type="button"
                    disabled={!locked || isRunning('UNLOCK') || isPending}
                    className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                  >
                    <Unlock className="h-4 w-4" />
                    {isRunning('UNLOCK') ? commandText(commandProgress('UNLOCK')?.status ?? 'pending', (key) => t(`commandsPanel.${key}`)) : t('commandsPanel.unlockMachine')}
                  </button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t('commandsPanel.confirmUnlockTitle')}</AlertDialogTitle>
                    <AlertDialogDescription>{t('commandsPanel.confirmUnlockBody')}</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t('commandsPanel.cancel')}</AlertDialogCancel>
                    <AlertDialogAction onClick={() => runCommand('UNLOCK')}>{t('commandsPanel.confirm')}</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <button
                    type="button"
                    disabled={isRunning('REBOOT') || isPending}
                    className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                  >
                    <RotateCw className="h-4 w-4" />
                    {isRunning('REBOOT') ? commandText(commandProgress('REBOOT')?.status ?? 'pending', (key) => t(`commandsPanel.${key}`)) : t('commandsPanel.rebootMachine')}
                  </button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t('commandsPanel.confirmRebootTitle')}</AlertDialogTitle>
                    <AlertDialogDescription>{t('commandsPanel.confirmRebootBody')}</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t('commandsPanel.cancel')}</AlertDialogCancel>
                    <AlertDialogAction onClick={() => runCommand('REBOOT')}>{t('commandsPanel.confirm')}</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <button
                    type="button"
                    disabled={!tempRange || isRunning('TEMP_ADJUST') || isPending}
                    className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                  >
                    <Thermometer className="h-4 w-4" />
                    {isRunning('TEMP_ADJUST') ? commandText(commandProgress('TEMP_ADJUST')?.status ?? 'pending', (key) => t(`commandsPanel.${key}`)) : t('commandsPanel.adjustTemp')}
                  </button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t('commandsPanel.confirmTempTitle')}</AlertDialogTitle>
                    <AlertDialogDescription>
                      {tempRange
                        ? t('commandsPanel.tempRange', { min: tempRange.min, max: tempRange.max })
                        : t('commandsPanel.tempUnsupported')}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <input
                    type="number"
                    className="min-h-12 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    value={Number.isFinite(tempAdjustValue) ? tempAdjustValue : ''}
                    min={tempRange?.min}
                    max={tempRange?.max}
                    step="0.1"
                    onChange={(event) => setTempAdjustValue(Number(event.target.value))}
                  />
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t('commandsPanel.cancel')}</AlertDialogCancel>
                    <AlertDialogAction onClick={() => runCommand('TEMP_ADJUST', { targetTempF: tempAdjustValue })}>{t('commandsPanel.confirm')}</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </section>

          <details className="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <summary className="cursor-pointer text-sm font-semibold text-slate-800">{t('commandHistory.title')}</summary>
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-2 py-2">{t('commandHistory.type')}</th>
                    <th className="px-2 py-2">{t('commandHistory.issuedBy')}</th>
                    <th className="px-2 py-2">{t('commandHistory.issuedAt')}</th>
                    <th className="px-2 py-2">{t('commandHistory.status')}</th>
                    <th className="px-2 py-2">{t('commandHistory.executedAt')}</th>
                  </tr>
                </thead>
                <tbody>
                  {commandHistory.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-2 py-3 text-slate-500">
                        {t('commandHistory.empty')}
                      </td>
                    </tr>
                  ) : (
                    commandHistory.map((item) => (
                      <tr key={item.id} className="border-b border-slate-100">
                        <td className="px-2 py-2 font-semibold text-slate-700">{item.type}</td>
                        <td className="px-2 py-2 text-slate-600">{item.issued_by_name ?? '-'}</td>
                        <td className="px-2 py-2 text-slate-600">{new Date(item.issued_at).toLocaleString()}</td>
                        <td className="px-2 py-2">
                          <span className={`rounded-full px-2 py-1 text-xs font-semibold ${commandBadge(item.status)}`}>{item.status}</span>
                        </td>
                        <td className="px-2 py-2 text-slate-600">{item.executed_at ? new Date(item.executed_at).toLocaleString() : '-'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </details>

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

        <TabsContent value="alerts" className="space-y-4">
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="mb-3 text-sm font-semibold text-slate-800">{t('alerts.activeTitle')}</h3>
            <div className="space-y-3">
              {activeState.length === 0 ? (
                <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{t('alerts.noneActive')}</p>
              ) : (
                activeState.map((alert) => (
                  <div key={alert.id} className="rounded-lg border border-slate-200 p-3">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <span className={`rounded-full px-2 py-1 text-xs font-semibold ${resolveBadge(alert.type)}`}>{alert.type}</span>
                      <span className="text-xs text-slate-500">{timeSince(alert.created_at)}</span>
                    </div>
                    <p className="text-sm text-slate-700">{alert.message ?? alert.type}</p>
                    <div className="mt-3">
                      <button
                        type="button"
                        onClick={() => resolveAlert(alert)}
                        disabled={isPending}
                        className="min-h-12 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-70"
                      >
                        {isPending ? <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> : null}
                        {t('alerts.resolve')}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
            {resolveError ? <p className="mt-2 text-sm text-red-600">{resolveError}</p> : null}
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="mb-3 text-sm font-semibold text-slate-800">{t('alerts.historyTitle')}</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-2 py-2">{t('alerts.type')}</th>
                    <th className="px-2 py-2">{t('alerts.message')}</th>
                    <th className="px-2 py-2">{t('alerts.resolvedBy')}</th>
                    <th className="px-2 py-2">{t('alerts.timeToResolve')}</th>
                  </tr>
                </thead>
                <tbody>
                  {historyState.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-2 py-3 text-slate-500">
                        {t('alerts.noneHistory')}
                      </td>
                    </tr>
                  ) : (
                    historyState.map((alert) => {
                      const resolvedBy = alert.resolved_by ? resolverNames[alert.resolved_by] ?? alert.resolved_by : '-';
                      const resolveTime =
                        alert.created_at && alert.resolved_at
                          ? `${Math.max(0, Math.round((new Date(alert.resolved_at).getTime() - new Date(alert.created_at).getTime()) / 60000))}m`
                          : '-';

                      return (
                        <tr key={alert.id} className="border-b border-slate-100">
                          <td className="px-2 py-2 font-semibold text-slate-700">{alert.type}</td>
                          <td className="px-2 py-2 text-slate-600">{alert.message ?? '-'}</td>
                          <td className="px-2 py-2 text-slate-600">{resolvedBy}</td>
                          <td className="px-2 py-2 text-slate-600">{resolveTime}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="mb-3 text-sm font-semibold text-slate-800">{t('alerts.temperature24h')}</h3>
            {chartData.length === 0 ? (
              <p className="text-sm text-slate-500">{t('alerts.noTemperatureData')}</p>
            ) : (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="recordedAt" tick={{ fontSize: 11 }} minTickGap={20} />
                    <YAxis tick={{ fontSize: 11 }} width={36} />
                    <Tooltip formatter={(value) => `${Number(value ?? 0).toFixed(1)}°F`} />
                    <Area type="monotone" dataKey="temperature" stroke="#1565C0" fill="#bfdbfe" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </section>
        </TabsContent>

        <TabsContent value="settings">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <MachineSettingsForm
              machine={machine}
              drivers={drivers}
              teamMembers={teamMembers}
              alertPreferences={alertPreferences}
            />
          </div>
        </TabsContent>
      </Tabs>

      {feedback ? (
        <div
          className={`fixed bottom-4 right-4 z-[60] max-w-sm rounded-xl border px-4 py-3 text-sm shadow-lg ${
            feedback.tone === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : feedback.tone === 'warning'
                ? 'border-amber-200 bg-amber-50 text-amber-700'
                : feedback.tone === 'error'
                  ? 'border-red-200 bg-red-50 text-red-700'
                  : 'border-indigo-200 bg-indigo-50 text-indigo-700'
          }`}
        >
          {feedback.text}
        </div>
      ) : null}
    </div>
  );
}
