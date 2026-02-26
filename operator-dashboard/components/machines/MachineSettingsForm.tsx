'use client';

import { useMemo, useState, useTransition } from 'react';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { updateMachineSettingsAction } from '@/app/actions/machines';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type {
  DriverProfile,
  MachineAlertPreference,
  MachineDetailData,
  TeamMemberProfile,
} from '@/components/machines/types';
import { PermissionGuardWithDenied } from '@/components/auth/PermissionGuard';

const ALERT_TYPES = ['OFFLINE', 'TOO_WARM', 'RFID_ERROR', 'LOW_STOCK'] as const;
type AlertType = (typeof ALERT_TYPES)[number];

type ChannelState = {
  emailEnabled: boolean;
  smsEnabled: boolean;
  pushEnabled: boolean;
};

const schema = z.object({
  displayName: z.string().min(1),
  preAuthAmount: z.number().min(0),
  taxRate: z.number().min(0),
  temperatureTarget: z.number(),
  temperatureUnit: z.enum(['f', 'c']),
  alertThreshold: z.number(),
  autoLockdown: z.boolean(),
  assignedDriverIds: z.array(z.string().uuid()),
});

type SettingsValues = z.infer<typeof schema>;

function toNumber(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function preferenceKey(userId: string, alertType: AlertType) {
  return `${userId}::${alertType}`;
}

export default function MachineSettingsForm({
  machine,
  drivers,
  teamMembers,
  alertPreferences,
}: {
  machine: MachineDetailData;
  drivers: DriverProfile[];
  teamMembers: TeamMemberProfile[];
  alertPreferences: MachineAlertPreference[];
}) {
  const t = useTranslations('machineSettings');
  const [isPending, startTransition] = useTransition();
  const [resultMessage, setResultMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const initialValues = useMemo(() => {
    const settings = machine.settings ?? {};
    return {
      displayName: machine.name,
      preAuthAmount: toNumber(settings.preAuthAmount, 10),
      taxRate: toNumber(settings.taxRate, 0),
      temperatureTarget: toNumber(settings.temperatureTarget, 38),
      temperatureUnit: (settings.temperatureUnit === 'c' ? 'c' : 'f') as 'f' | 'c',
      alertThreshold: toNumber(settings.tempThreshold, 42),
      autoLockdown: Boolean(settings.autoLockdown),
      assignedDriverIds: drivers.filter((driver) => (driver.assigned_machine_ids ?? []).includes(machine.id)).map((driver) => driver.id),
    };
  }, [machine, drivers]);

  const initialChannels = useMemo(() => {
    const channelMap: Record<string, ChannelState> = {};

    for (const member of teamMembers) {
      for (const alertType of ALERT_TYPES) {
        channelMap[preferenceKey(member.id, alertType)] = {
          emailEnabled: true,
          smsEnabled: false,
          pushEnabled: false,
        };
      }
    }

    for (const preference of alertPreferences) {
      const key = preferenceKey(preference.user_id, preference.alert_type);
      channelMap[key] = {
        emailEnabled: Boolean(preference.email_enabled),
        smsEnabled: Boolean(preference.sms_enabled),
        pushEnabled: Boolean(preference.push_enabled),
      };
    }

    return channelMap;
  }, [teamMembers, alertPreferences]);

  const initialDelays = useMemo(() => {
    const delays: Record<AlertType, number> = {
      OFFLINE: 0,
      TOO_WARM: 0,
      RFID_ERROR: 0,
      LOW_STOCK: 0,
    };

    for (const type of ALERT_TYPES) {
      const rows = alertPreferences.filter((preference) => preference.alert_type === type);
      if (rows.length > 0) {
        delays[type] = Math.max(0, Math.min(120, Math.min(...rows.map((row) => Number(row.delay_minutes ?? 0)))));
      }
    }

    return delays;
  }, [alertPreferences]);

  const [channelMap, setChannelMap] = useState<Record<string, ChannelState>>(initialChannels);
  const [delayMap, setDelayMap] = useState<Record<AlertType, number>>(initialDelays);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<SettingsValues>({
    resolver: zodResolver(schema),
    defaultValues: initialValues,
  });

  const selectedDrivers = watch('assignedDriverIds');

  const toggleChannel = (userId: string, alertType: AlertType, channel: keyof ChannelState, value: boolean) => {
    const key = preferenceKey(userId, alertType);
    setChannelMap((current) => ({
      ...current,
      [key]: {
        ...(current[key] ?? { emailEnabled: true, smsEnabled: false, pushEnabled: false }),
        [channel]: value,
      },
    }));
  };

  const updateDelay = (alertType: AlertType, value: number) => {
    const next = Math.max(0, Math.min(120, Number.isFinite(value) ? Math.floor(value) : 0));
    setDelayMap((current) => ({
      ...current,
      [alertType]: next,
    }));
  };

  const onSubmit = (values: SettingsValues) => {
    setResultMessage(null);

    const preferencesPayload = teamMembers.flatMap((member) =>
      ALERT_TYPES.map((alertType) => {
        const key = preferenceKey(member.id, alertType);
        const channels = channelMap[key] ?? { emailEnabled: true, smsEnabled: false, pushEnabled: false };

        return {
          userId: member.id,
          alertType,
          emailEnabled: channels.emailEnabled,
          smsEnabled: channels.smsEnabled,
          pushEnabled: channels.pushEnabled,
          delayMinutes: delayMap[alertType] ?? 0,
        };
      })
    );

    startTransition(async () => {
      const result = await updateMachineSettingsAction({
        machineId: machine.id,
        ...values,
        alertPreferences: preferencesPayload,
      });

      if (!result.ok) {
        setResultMessage({ type: 'error', text: result.error ?? t('saveError') });
        return;
      }

      setResultMessage({ type: 'success', text: t('saveSuccess') });
    });
  };

  return (
    <PermissionGuardWithDenied module="machines" action="w">
      <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
        <Tabs defaultValue="general" className="w-full">
          <TabsList className="h-auto w-full flex-wrap justify-start gap-1 bg-transparent p-0">
            <TabsTrigger value="general">{t('tabs.general')}</TabsTrigger>
            <TabsTrigger value="alerts">{t('tabs.alerts')}</TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-700">{t('displayName')}</label>
              <input
                className="min-h-12 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-[#1565C0]"
                {...register('displayName')}
              />
              {errors.displayName ? <p className="mt-1 text-xs text-red-600">{t('required')}</p> : null}
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-700">{t('preAuthAmount')}</label>
                <input type="number" step="0.01" className="min-h-12 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-[#1565C0]" {...register('preAuthAmount', { valueAsNumber: true })} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-700">{t('taxRate')}</label>
                <input type="number" step="0.01" className="min-h-12 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-[#1565C0]" {...register('taxRate', { valueAsNumber: true })} />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-700">{t('temperatureTarget')}</label>
                <input type="number" step="0.1" className="min-h-12 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-[#1565C0]" {...register('temperatureTarget', { valueAsNumber: true })} />
              </div>

              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-700">{t('temperatureUnit')}</label>
                <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1">
                  <button
                    type="button"
                    className={`min-h-12 rounded-md px-3 py-1 text-xs font-semibold ${watch('temperatureUnit') === 'f' ? 'bg-slate-900 text-white' : 'text-slate-600'}`}
                    onClick={() => setValue('temperatureUnit', 'f', { shouldDirty: true })}
                  >
                    °F
                  </button>
                  <button
                    type="button"
                    className={`min-h-12 rounded-md px-3 py-1 text-xs font-semibold ${watch('temperatureUnit') === 'c' ? 'bg-slate-900 text-white' : 'text-slate-600'}`}
                    onClick={() => setValue('temperatureUnit', 'c', { shouldDirty: true })}
                  >
                    °C
                  </button>
                </div>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-700">{t('alertThreshold')}</label>
              <input type="number" step="0.1" className="min-h-12 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-[#1565C0]" {...register('alertThreshold', { valueAsNumber: true })} />
            </div>

            <label className="inline-flex min-h-12 items-center gap-2 text-sm font-medium text-slate-700">
              <input type="checkbox" {...register('autoLockdown')} />
              {t('autoLockdown')}
            </label>

            <div>
              <p className="mb-2 text-sm font-semibold text-slate-700">{t('assignedDrivers')}</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {drivers.map((driver) => {
                  const checked = selectedDrivers?.includes(driver.id) ?? false;

                  return (
                    <label key={driver.id} className="flex min-h-12 items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(event) => {
                          const next = new Set(selectedDrivers ?? []);

                          if (event.target.checked) {
                            next.add(driver.id);
                          } else {
                            next.delete(driver.id);
                          }

                          setValue('assignedDriverIds', Array.from(next), { shouldDirty: true });
                        }}
                      />
                      <span>{driver.full_name ?? driver.id}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="alerts" className="space-y-4">
            {ALERT_TYPES.map((alertType) => (
              <section key={alertType} className="rounded-xl border border-slate-200 p-3">
                <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm font-semibold text-slate-900">{t(`alerts.types.${alertType}`)}</p>
                  <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
                    {t('alerts.delayLabel')}
                    <input
                      type="range"
                      min={0}
                      max={120}
                      value={delayMap[alertType]}
                      onChange={(event) => updateDelay(alertType, Number(event.target.value))}
                    />
                    <span className="w-10 text-right">{delayMap[alertType]}m</span>
                  </label>
                </div>

                <div className="space-y-2">
                  {teamMembers.map((member) => {
                    const key = preferenceKey(member.id, alertType);
                    const channels = channelMap[key] ?? { emailEnabled: true, smsEnabled: false, pushEnabled: false };

                    return (
                      <div key={key} className="flex flex-col gap-2 rounded-lg border border-slate-200 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-sm font-semibold text-slate-800">{member.full_name ?? member.id}</p>
                          <p className="text-xs uppercase tracking-wide text-slate-500">{member.role ?? 'viewer'}</p>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-xs font-semibold text-slate-700">
                          <label className="flex min-h-12 items-center gap-1 rounded-md border border-slate-200 px-2">
                            <input
                              type="checkbox"
                              checked={channels.emailEnabled}
                              onChange={(event) => toggleChannel(member.id, alertType, 'emailEnabled', event.target.checked)}
                            />
                            {t('alerts.channels.email')}
                          </label>
                          <label className="flex min-h-12 items-center gap-1 rounded-md border border-slate-200 px-2">
                            <input
                              type="checkbox"
                              checked={channels.smsEnabled}
                              onChange={(event) => toggleChannel(member.id, alertType, 'smsEnabled', event.target.checked)}
                            />
                            {t('alerts.channels.sms')}
                          </label>
                          <label className="flex min-h-12 items-center gap-1 rounded-md border border-slate-200 px-2">
                            <input
                              type="checkbox"
                              checked={channels.pushEnabled}
                              onChange={(event) => toggleChannel(member.id, alertType, 'pushEnabled', event.target.checked)}
                            />
                            {t('alerts.channels.push')}
                          </label>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </TabsContent>
        </Tabs>

        {resultMessage ? (
          <div
            className={`rounded-lg border p-3 text-sm ${
              resultMessage.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-700'
            }`}
          >
            {resultMessage.text}
          </div>
        ) : null}

        <div className="pt-2">
          <button
            type="submit"
            disabled={isSubmitting || isPending}
            className="inline-flex min-h-12 items-center gap-2 rounded-lg bg-[#0D2B4E] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0A2240] disabled:opacity-70"
          >
            {isSubmitting || isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {t('save')}
          </button>
        </div>
      </form>
    </PermissionGuardWithDenied>
  );
}
