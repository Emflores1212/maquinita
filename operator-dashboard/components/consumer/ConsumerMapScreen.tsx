'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { GoogleMap, InfoWindow, Marker, useJsApiLoader } from '@react-google-maps/api';
import { getDistance } from 'geolib';
import { useTranslations } from 'next-intl';
import type { ConsumerMachineRow } from '@/components/consumer/types';

function markerIconUrl(status: string | null) {
  if (status === 'online') {
    return 'https://maps.google.com/mapfiles/ms/icons/green-dot.png';
  }
  if (status === 'warning') {
    return 'https://maps.google.com/mapfiles/ms/icons/orange-dot.png';
  }
  if (status === 'offline') {
    return 'https://maps.google.com/mapfiles/ms/icons/red-dot.png';
  }
  return 'https://maps.google.com/mapfiles/ms/icons/blue-dot.png';
}

function formatDistance(meters: number | null) {
  if (meters === null || !Number.isFinite(meters)) return null;
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

export default function ConsumerMapScreen({
  slug,
  machines,
}: {
  slug: string;
  machines: ConsumerMachineRow[];
}) {
  const t = useTranslations('consumer.map');
  const [selectedMachineId, setSelectedMachineId] = useState<string | null>(null);
  const [currentPosition, setCurrentPosition] = useState<{ lat: number; lng: number } | null>(null);

  const { isLoaded } = useJsApiLoader({
    id: 'maquinita-consumer-map',
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY || '',
  });

  useEffect(() => {
    if (!('geolocation' in navigator)) return;

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCurrentPosition({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
      },
      () => undefined,
      {
        enableHighAccuracy: true,
        maximumAge: 60 * 1000,
      }
    );
  }, []);

  const markers = useMemo(() => machines.filter((machine) => machine.lat !== null && machine.lng !== null), [machines]);
  const selected = markers.find((machine) => machine.id === selectedMachineId) ?? null;

  const center = useMemo(() => {
    if (currentPosition) return currentPosition;
    const first = markers[0];
    if (first?.lat !== null && first?.lng !== null && first?.lat !== undefined && first?.lng !== undefined) {
      return { lat: first.lat, lng: first.lng };
    }
    return { lat: 37.7749, lng: -122.4194 };
  }, [currentPosition, markers]);

  const machineCards = useMemo(() => {
    return [...machines]
      .map((machine) => {
        const distance =
          currentPosition && machine.lat !== null && machine.lng !== null
            ? getDistance(
                { latitude: currentPosition.lat, longitude: currentPosition.lng },
                { latitude: machine.lat, longitude: machine.lng }
              )
            : null;

        return { ...machine, distance };
      })
      .sort((a, b) => {
        if (a.distance === null && b.distance === null) return a.name.localeCompare(b.name);
        if (a.distance === null) return 1;
        if (b.distance === null) return -1;
        return a.distance - b.distance;
      });
  }, [machines, currentPosition]);

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">{t('title')}</h2>
        <div className="mt-3 h-[320px] w-full overflow-hidden rounded-xl border border-slate-200">
          {isLoaded ? (
            <GoogleMap mapContainerStyle={{ width: '100%', height: '100%' }} center={center} zoom={12}>
              {markers.map((machine) => (
                <Marker
                  key={machine.id}
                  position={{ lat: machine.lat as number, lng: machine.lng as number }}
                  icon={markerIconUrl(machine.status)}
                  onClick={() => setSelectedMachineId(machine.id)}
                />
              ))}

              {selected ? (
                <InfoWindow
                  position={{ lat: selected.lat as number, lng: selected.lng as number }}
                  onCloseClick={() => setSelectedMachineId(null)}
                >
                  <div className="max-w-[220px] p-1 text-sm">
                    <p className="font-semibold text-slate-900">{selected.name}</p>
                    <p className="text-xs text-slate-600">{selected.address || selected.locationName || '-'}</p>
                    <Link href={`/${slug}/machine/${selected.id}`} className="mt-2 inline-flex text-xs font-semibold text-[#0D2B4E] underline">
                      {t('viewInventory')}
                    </Link>
                  </div>
                </InfoWindow>
              ) : null}
            </GoogleMap>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-slate-500">{t('loadingMap')}</div>
          )}
        </div>
      </section>

      <section className="space-y-3">
        {machineCards.map((machine) => (
          <Link
            key={machine.id}
            href={`/${slug}/machine/${machine.id}`}
            className="block rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">{machine.name}</p>
                <p className="text-xs text-slate-600">{machine.locationName || machine.address || '-'}</p>
                <p className="mt-1 text-xs text-slate-500">{machine.address || '-'}</p>
              </div>
              <div className="text-right">
                <span
                  className={`inline-flex rounded-full px-2 py-1 text-[11px] font-semibold ${
                    machine.status === 'online'
                      ? 'bg-emerald-100 text-emerald-700'
                      : machine.status === 'warning'
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-red-100 text-red-700'
                  }`}
                >
                  {machine.status || 'offline'}
                </span>
                <p className="mt-2 text-xs font-semibold text-slate-700">{formatDistance(machine.distance) || t('distanceUnknown')}</p>
              </div>
            </div>
          </Link>
        ))}
      </section>
    </div>
  );
}
