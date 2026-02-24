'use client';

import { useMemo, useState, useTransition } from 'react';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { updateMachineSettingsAction } from '@/app/actions/machines';
import type { DriverProfile, MachineDetailData } from '@/components/machines/types';
import { PermissionGuardWithDenied } from '@/components/auth/PermissionGuard';

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

export default function MachineSettingsForm({
  machine,
  drivers,
}: {
  machine: MachineDetailData;
  drivers: DriverProfile[];
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

  const onSubmit = (values: SettingsValues) => {
    setResultMessage(null);

    startTransition(async () => {
      const result = await updateMachineSettingsAction({
        machineId: machine.id,
        ...values,
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
        <div>
          <label className="mb-1 block text-sm font-semibold text-slate-700">{t('displayName')}</label>
          <input
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-[#1565C0]"
            {...register('displayName')}
          />
          {errors.displayName ? <p className="mt-1 text-xs text-red-600">{t('required')}</p> : null}
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">{t('preAuthAmount')}</label>
            <input type="number" step="0.01" className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-[#1565C0]" {...register('preAuthAmount', { valueAsNumber: true })} />
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">{t('taxRate')}</label>
            <input type="number" step="0.01" className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-[#1565C0]" {...register('taxRate', { valueAsNumber: true })} />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">{t('temperatureTarget')}</label>
            <input type="number" step="0.1" className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-[#1565C0]" {...register('temperatureTarget', { valueAsNumber: true })} />
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-700">{t('temperatureUnit')}</label>
            <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1">
              <button
                type="button"
                className={`rounded-md px-3 py-1 text-xs font-semibold ${watch('temperatureUnit') === 'f' ? 'bg-slate-900 text-white' : 'text-slate-600'}`}
                onClick={() => setValue('temperatureUnit', 'f', { shouldDirty: true })}
              >
                °F
              </button>
              <button
                type="button"
                className={`rounded-md px-3 py-1 text-xs font-semibold ${watch('temperatureUnit') === 'c' ? 'bg-slate-900 text-white' : 'text-slate-600'}`}
                onClick={() => setValue('temperatureUnit', 'c', { shouldDirty: true })}
              >
                °C
              </button>
            </div>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-semibold text-slate-700">{t('alertThreshold')}</label>
          <input type="number" step="0.1" className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-[#1565C0]" {...register('alertThreshold', { valueAsNumber: true })} />
        </div>

        <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
          <input type="checkbox" {...register('autoLockdown')} />
          {t('autoLockdown')}
        </label>

        <div>
          <p className="mb-2 text-sm font-semibold text-slate-700">{t('assignedDrivers')}</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {drivers.map((driver) => {
              const checked = selectedDrivers?.includes(driver.id) ?? false;

              return (
                <label key={driver.id} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700">
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
            className="inline-flex items-center gap-2 rounded-lg bg-[#0D2B4E] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0A2240] disabled:opacity-70"
          >
            {isSubmitting || isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {t('save')}
          </button>
        </div>
      </form>
    </PermissionGuardWithDenied>
  );
}
