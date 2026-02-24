'use client';

import Link from 'next/link';
import { GoogleMap, InfoWindow, Marker, useJsApiLoader } from '@react-google-maps/api';
import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { MachineListItem } from '@/components/machines/types';

const libraries: ('places')[] = ['places'];

function markerIconUrl(status: string | null) {
  const normalized = (status ?? '').toLowerCase();

  if (normalized.includes('error') || normalized === 'offline') {
    return 'http://maps.google.com/mapfiles/ms/icons/red-dot.png';
  }

  if (normalized.includes('warning')) {
    return 'http://maps.google.com/mapfiles/ms/icons/orange-dot.png';
  }

  if (normalized === 'online') {
    return 'http://maps.google.com/mapfiles/ms/icons/green-dot.png';
  }

  return 'http://maps.google.com/mapfiles/ms/icons/blue-dot.png';
}

function findDefaultCenter(machines: MachineListItem[]) {
  const firstWithCoords = machines.find((machine) => machine.lat !== null && machine.lng !== null);

  if (!firstWithCoords) {
    return { lat: 25.7617, lng: -80.1918 };
  }

  return { lat: Number(firstWithCoords.lat), lng: Number(firstWithCoords.lng) };
}

export default function MachineMapView({ machines }: { machines: MachineListItem[] }) {
  const t = useTranslations('machines');
  const [selectedMachineId, setSelectedMachineId] = useState<string | null>(null);

  const googleMapsApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;

  const { isLoaded } = useJsApiLoader({
    id: 'machines-map-script',
    googleMapsApiKey: googleMapsApiKey ?? '',
    libraries,
  });

  const center = useMemo(() => findDefaultCenter(machines), [machines]);

  const markers = machines.filter((machine) => machine.lat !== null && machine.lng !== null);
  const selected = markers.find((machine) => machine.id === selectedMachineId) ?? null;

  if (!googleMapsApiKey) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-medium text-amber-700">
        {t('mapMissingKey')}
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
        {t('loadingMap')}
      </div>
    );
  }

  return (
    <div className="h-[460px] overflow-hidden rounded-xl border border-slate-200">
      <GoogleMap mapContainerStyle={{ width: '100%', height: '100%' }} center={center} zoom={11}>
        {markers.map((machine) => (
          <Marker
            key={machine.id}
            position={{ lat: Number(machine.lat), lng: Number(machine.lng) }}
            icon={markerIconUrl(machine.status)}
            onClick={() => setSelectedMachineId(machine.id)}
          />
        ))}

        {selected ? (
          <InfoWindow
            position={{ lat: Number(selected.lat), lng: Number(selected.lng) }}
            onCloseClick={() => setSelectedMachineId(null)}
          >
            <div className="min-w-[180px] p-1">
              <p className="text-sm font-bold text-slate-900">{selected.name}</p>
              <p className="text-xs text-slate-500">{selected.status ?? '-'}</p>
              <Link href={`/machines/${selected.id}`} className="mt-2 inline-block text-xs font-semibold text-[#1565C0] hover:text-[#0D2B4E]">
                {t('openMachine')}
              </Link>
            </div>
          </InfoWindow>
        ) : null}
      </GoogleMap>
    </div>
  );
}
