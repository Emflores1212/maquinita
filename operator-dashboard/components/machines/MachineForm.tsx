'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Refrigerator, Store, Snowflake, Loader2 } from 'lucide-react';
import { useJsApiLoader } from '@react-google-maps/api';
import { useTranslations } from 'next-intl';
import { createMachineAction, updateMachineAction } from '@/app/actions/machines';

type MachineFormProps = {
  mode: 'create' | 'edit';
  machineId?: string;
  defaultValues?: {
    name: string;
    type: 'fridge' | 'pantry' | 'freezer';
    locationName: string;
    address: string;
    lat: number | null;
    lng: number | null;
    notes: string;
    mid?: string;
  };
};

const schema = z.object({
  name: z.string().min(1),
  type: z.enum(['fridge', 'pantry', 'freezer']),
  locationName: z.string().optional(),
  address: z.string().optional(),
  lat: z.number().nullable().optional(),
  lng: z.number().nullable().optional(),
  notes: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

const libraries: ('places')[] = ['places'];

export default function MachineForm({ mode, machineId, defaultValues }: MachineFormProps) {
  const t = useTranslations('machineForm');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState('');
  const [manualCoords, setManualCoords] = useState(Boolean(defaultValues?.lat || defaultValues?.lng));

  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const addressInputRef = useRef<HTMLInputElement | null>(null);

  const googleMapsApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;

  const { isLoaded: placesLoaded } = useJsApiLoader({
    id: 'machine-form-places',
    googleMapsApiKey: googleMapsApiKey ?? '',
    libraries,
  });

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: defaultValues?.name ?? '',
      type: defaultValues?.type ?? 'fridge',
      locationName: defaultValues?.locationName ?? '',
      address: defaultValues?.address ?? '',
      lat: defaultValues?.lat ?? null,
      lng: defaultValues?.lng ?? null,
      notes: defaultValues?.notes ?? '',
    },
  });

  const { ref: addressFieldRef, ...addressFieldProps } = register('address');

  useEffect(() => {
    if (!placesLoaded || !addressInputRef.current || !googleMapsApiKey) {
      return;
    }

    const autocomplete = new window.google.maps.places.Autocomplete(addressInputRef.current, {
      fields: ['formatted_address', 'geometry', 'name'],
    });

    autocompleteRef.current = autocomplete;

    const listener = autocomplete.addListener('place_changed', async () => {
      const place = autocomplete.getPlace();

      if (place.formatted_address) {
        setValue('address', place.formatted_address, { shouldDirty: true });
      }

      if (place.name) {
        const currentLocationName = watch('locationName');
        if (!currentLocationName) {
          setValue('locationName', place.name, { shouldDirty: true });
        }
      }

      const location = place.geometry?.location;
      if (location) {
        setValue('lat', Number(location.lat().toFixed(6)), { shouldDirty: true });
        setValue('lng', Number(location.lng().toFixed(6)), { shouldDirty: true });
      } else {
        const address = place.formatted_address;
        if (address) {
          const geocoder = new window.google.maps.Geocoder();
          geocoder.geocode({ address }, (results, status) => {
            if (status !== 'OK' || !results?.[0]?.geometry?.location) {
              return;
            }
            const coords = results[0].geometry.location;
            setValue('lat', Number(coords.lat().toFixed(6)), { shouldDirty: true });
            setValue('lng', Number(coords.lng().toFixed(6)), { shouldDirty: true });
          });
        }
      }
    });

    return () => {
      window.google.maps.event.removeListener(listener);
      autocompleteRef.current = null;
    };
  }, [placesLoaded, setValue, watch, googleMapsApiKey]);

  const machineType = watch('type');

  const typeOptions = useMemo(
    () => [
      { value: 'fridge' as const, label: t('typeFridge'), icon: Refrigerator },
      { value: 'pantry' as const, label: t('typePantry'), icon: Store },
      { value: 'freezer' as const, label: t('typeFreezer'), icon: Snowflake },
    ],
    [t]
  );

  const onSubmit = (values: FormValues) => {
    setServerError('');

    startTransition(async () => {
      const payload = {
        id: machineId,
        name: values.name,
        type: values.type,
        locationName: values.locationName ?? null,
        address: values.address ?? null,
        lat: values.lat ?? null,
        lng: values.lng ?? null,
        notes: values.notes ?? null,
      };

      const result = mode === 'create' ? await createMachineAction(payload) : await updateMachineAction(payload);

      if (!result.ok) {
        setServerError(result.error ?? t('saveError'));
        return;
      }

      const targetId = result.id ?? machineId;
      if (targetId) {
        router.replace(`/machines/${targetId}`);
      } else {
        router.replace('/machines');
      }
      router.refresh();
    });
  };

  const lat = watch('lat');
  const lng = watch('lng');

  return (
    <div className="mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">{mode === 'create' ? t('createTitle') : t('editTitle')}</h1>
        <p className="mt-1 text-sm text-slate-500">{mode === 'create' ? t('createSubtitle') : t('editSubtitle')}</p>
      </div>

      <form className="space-y-5" onSubmit={handleSubmit(onSubmit)}>
        <div>
          <label className="mb-1 block text-sm font-semibold text-slate-700">{t('name')}</label>
          <input
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-[#1565C0] focus:bg-white"
            {...register('name')}
          />
          {errors.name ? <p className="mt-1 text-xs text-red-600">{t('required')}</p> : null}
        </div>

        <div>
          <p className="mb-2 text-sm font-semibold text-slate-700">{t('type')}</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {typeOptions.map((option) => (
              <label
                key={option.value}
                className={`flex cursor-pointer items-center gap-2 rounded-lg border p-3 text-sm font-semibold ${
                  machineType === option.value ? 'border-[#0D2B4E] bg-[#0D2B4E]/5 text-[#0D2B4E]' : 'border-slate-200 text-slate-700'
                }`}
              >
                <input type="radio" value={option.value} className="hidden" {...register('type')} />
                <option.icon className="h-4 w-4" />
                <span>{option.label}</span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-semibold text-slate-700">{t('locationName')}</label>
          <input
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-[#1565C0] focus:bg-white"
            {...register('locationName')}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-semibold text-slate-700">{t('address')}</label>
          <input
            ref={(node) => {
              addressInputRef.current = node;
              addressFieldRef(node);
            }}
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-[#1565C0] focus:bg-white"
            placeholder={t('addressPlaceholder')}
            {...addressFieldProps}
          />
          {!googleMapsApiKey ? <p className="mt-1 text-xs text-amber-600">{t('mapsKeyMissing')}</p> : null}
        </div>

        <div className="rounded-lg border border-slate-200 p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-700">{t('coordinates')}</p>
            <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600">
              <input type="checkbox" checked={manualCoords} onChange={(event) => setManualCoords(event.target.checked)} />
              {t('override')}
            </label>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-500">LAT</label>
              <input
                type="number"
                step="0.000001"
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-[#1565C0] focus:bg-white disabled:opacity-70"
                disabled={!manualCoords}
                {...register('lat', { valueAsNumber: true })}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-500">LNG</label>
              <input
                type="number"
                step="0.000001"
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-[#1565C0] focus:bg-white disabled:opacity-70"
                disabled={!manualCoords}
                {...register('lng', { valueAsNumber: true })}
              />
            </div>
          </div>

          {!manualCoords && lat !== null && lng !== null ? (
            <p className="mt-2 text-xs text-slate-500">
              {t('autoCoords')}: {lat}, {lng}
            </p>
          ) : null}
        </div>

        <div>
          <label className="mb-1 block text-sm font-semibold text-slate-700">{t('notes')}</label>
          <textarea
            rows={4}
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-[#1565C0] focus:bg-white"
            {...register('notes')}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-semibold text-slate-700">{t('mid')}</label>
          <input
            readOnly
            value={defaultValues?.mid ?? t('midAuto')}
            className="w-full rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-sm font-mono text-slate-600"
          />
        </div>

        {serverError ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{serverError}</div> : null}

        <div className="flex items-center justify-end gap-2">
          <Link href={machineId ? `/machines/${machineId}` : '/machines'} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            {t('cancel')}
          </Link>
          <button
            type="submit"
            disabled={isSubmitting || isPending}
            className="inline-flex items-center gap-2 rounded-lg bg-[#0D2B4E] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0A2240] disabled:opacity-70"
          >
            {isSubmitting || isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {mode === 'create' ? t('create') : t('save')}
          </button>
        </div>
      </form>
    </div>
  );
}
