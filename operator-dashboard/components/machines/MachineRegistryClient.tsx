'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Search, Plus, LayoutGrid, List, MapPinned } from 'lucide-react';
import { useTranslations } from 'next-intl';
import PermissionGuard from '@/components/auth/PermissionGuard';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import type { MachineListItem } from '@/components/machines/types';
import { sortMachines, statusColor, statusDot } from '@/components/machines/helpers';
import MachineMapView from '@/components/machines/MachineMapView';

export default function MachineRegistryClient({ machines }: { machines: MachineListItem[] }) {
  const t = useTranslations('machines');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [mapView, setMapView] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | 'online' | 'offline' | 'warning' | 'error'>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | 'fridge' | 'pantry' | 'freezer'>('all');
  const [sortBy, setSortBy] = useState<'problems' | 'name' | 'revenue'>('problems');
  const [searchInput, setSearchInput] = useState('');

  const debouncedSearch = useDebouncedValue(searchInput, 320);

  const filteredMachines = useMemo(() => {
    const search = debouncedSearch.trim().toLowerCase();

    const base = machines.filter((machine) => {
      const normalizedStatus = (machine.status ?? '').toLowerCase();
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'warning' && normalizedStatus.includes('warning')) ||
        (statusFilter === 'error' && normalizedStatus.includes('error')) ||
        normalizedStatus === statusFilter;

      const matchesType = typeFilter === 'all' || machine.type === typeFilter;

      const matchesSearch =
        search.length === 0 ||
        machine.name.toLowerCase().includes(search) ||
        machine.mid.toLowerCase().includes(search) ||
        (machine.location_name ?? '').toLowerCase().includes(search) ||
        (machine.address ?? '').toLowerCase().includes(search);

      return matchesStatus && matchesType && matchesSearch;
    });

    return sortMachines(base, sortBy);
  }, [machines, debouncedSearch, statusFilter, typeFilter, sortBy]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('title')}</h1>
          <p className="text-sm text-slate-500">{t('subtitle')}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold ${
              mapView ? 'border-[#0D2B4E] bg-[#0D2B4E] text-white' : 'border-slate-200 bg-white text-slate-700'
            }`}
            onClick={() => setMapView((current) => !current)}
          >
            <MapPinned className="h-4 w-4" />
            {t('mapView')}
          </button>

          <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1">
            <button
              type="button"
              className={`rounded-md px-2 py-1 text-xs font-semibold ${viewMode === 'grid' ? 'bg-slate-900 text-white' : 'text-slate-600'}`}
              onClick={() => setViewMode('grid')}
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              type="button"
              className={`rounded-md px-2 py-1 text-xs font-semibold ${viewMode === 'list' ? 'bg-slate-900 text-white' : 'text-slate-600'}`}
              onClick={() => setViewMode('list')}
            >
              <List className="h-4 w-4" />
            </button>
          </div>

          <PermissionGuard module="machines" action="w">
            <Link
              href="/machines/new"
              className="inline-flex items-center gap-2 rounded-lg bg-[#0D2B4E] px-3 py-2 text-sm font-semibold text-white hover:bg-[#0A2240]"
            >
              <Plus className="h-4 w-4" />
              {t('addMachine')}
            </Link>
          </PermissionGuard>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-4 lg:grid-cols-4">
        <label className="relative lg:col-span-2">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder={t('searchPlaceholder')}
            className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm outline-none focus:border-[#1565C0] focus:bg-white"
          />
        </label>

        <select
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#1565C0]"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}
        >
          <option value="all">{t('statusAll')}</option>
          <option value="online">{t('statusOnline')}</option>
          <option value="offline">{t('statusOffline')}</option>
          <option value="warning">{t('statusWarning')}</option>
          <option value="error">{t('statusError')}</option>
        </select>

        <select
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#1565C0]"
          value={typeFilter}
          onChange={(event) => setTypeFilter(event.target.value as typeof typeFilter)}
        >
          <option value="all">{t('typeAll')}</option>
          <option value="fridge">{t('typeFridge')}</option>
          <option value="pantry">{t('typePantry')}</option>
          <option value="freezer">{t('typeFreezer')}</option>
        </select>

        <select
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#1565C0]"
          value={sortBy}
          onChange={(event) => setSortBy(event.target.value as typeof sortBy)}
        >
          <option value="problems">{t('sortProblems')}</option>
          <option value="name">{t('sortName')}</option>
          <option value="revenue">{t('sortRevenue')}</option>
        </select>
      </div>

      {mapView ? <MachineMapView machines={filteredMachines} /> : null}

      {viewMode === 'grid' ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredMachines.map((machine) => (
            <Link
              key={machine.id}
              href={`/machines/${machine.id}`}
              className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-colors hover:bg-slate-50"
            >
              <div className="mb-2 flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-slate-900">{machine.name}</p>
                  <p className="text-xs text-slate-500">{machine.mid}</p>
                </div>
                <span className={`rounded-full px-2 py-1 text-xs font-bold ${statusColor(machine.status)}`}>{machine.status ?? '-'}</span>
              </div>
              <p className="text-xs text-slate-500">{machine.location_name ?? machine.address ?? '-'}</p>
              <div className="mt-3 flex items-center justify-between text-xs text-slate-600">
                <span>{statusDot(machine.status)}</span>
                <span>
                  {t('revenue')}: ${machine.todayRevenue.toFixed(2)}
                </span>
              </div>
            </Link>
          ))}

          {filteredMachines.length === 0 ? (
            <div className="col-span-full rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-500">{t('empty')}</div>
          ) : null}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">{t('tableName')}</th>
                <th className="px-4 py-3">MID</th>
                <th className="px-4 py-3">{t('tableType')}</th>
                <th className="px-4 py-3">{t('tableStatus')}</th>
                <th className="px-4 py-3">{t('tableRevenue')}</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filteredMachines.map((machine) => (
                <tr key={machine.id} className="border-t border-slate-100">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-slate-900">{machine.name}</p>
                    <p className="text-xs text-slate-500">{machine.location_name ?? '-'}</p>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{machine.mid}</td>
                  <td className="px-4 py-3 capitalize">{machine.type}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-1 text-xs font-bold ${statusColor(machine.status)}`}>{machine.status ?? '-'}</span>
                  </td>
                  <td className="px-4 py-3 font-semibold">${machine.todayRevenue.toFixed(2)}</td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/machines/${machine.id}`} className="text-xs font-semibold text-[#1565C0] hover:text-[#0D2B4E]">
                      {t('openMachine')}
                    </Link>
                  </td>
                </tr>
              ))}

              {filteredMachines.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-sm text-slate-500">
                    {t('empty')}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
