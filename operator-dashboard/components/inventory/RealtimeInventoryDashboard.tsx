'use client';

import Link from 'next/link';
import { Fragment, useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, ChevronRight, Loader2, RefreshCw, SlidersHorizontal } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { createBrowserClient } from '@/lib/supabase-browser';
import { upsertParLevelAction } from '@/app/actions/inventory';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { InventoryItemInMachine, InventoryMachine, InventoryProduct, ParLevel } from '@/components/inventory/types';

type ProductRow = {
  machineId: string;
  productId: string;
  name: string;
  photoUrl: string | null;
  count: number;
  parLevel: number;
  nextExpiry: string | null;
  status: 'STOCKED' | 'LOW' | 'OUT' | 'EXPIRING';
};

type MachineSummary = {
  machineId: string;
  machineName: string;
  machineStatus: string | null;
  totalItems: number;
  expiring: number;
  expired: number;
  lowStock: number;
  rows: ProductRow[];
};

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(`${value}T23:59:59`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function keyFor(machineId: string, productId: string) {
  return `${machineId}::${productId}`;
}

function minutesSince(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  return Math.max(0, Math.floor(diffMs / 60000));
}

function productStatus(params: {
  count: number;
  parLevel: number;
  nextExpiry: Date | null;
  soonThreshold: Date;
}): ProductRow['status'] {
  if (params.count <= 0) return 'OUT';
  if (params.parLevel > 0 && params.count < params.parLevel) return 'LOW';
  if (params.nextExpiry && params.nextExpiry.getTime() <= params.soonThreshold.getTime()) return 'EXPIRING';
  return 'STOCKED';
}

export default function RealtimeInventoryDashboard({
  operatorId,
  canWrite,
  machines,
  products,
  initialItems,
  initialParLevels,
  initialLastUpdatedAt,
}: {
  operatorId: string;
  canWrite: boolean;
  machines: InventoryMachine[];
  products: InventoryProduct[];
  initialItems: InventoryItemInMachine[];
  initialParLevels: ParLevel[];
  initialLastUpdatedAt: string;
}) {
  const t = useTranslations('inventoryDashboard');
  const tStatus = useTranslations('status');
  const router = useRouter();
  const [items, setItems] = useState<InventoryItemInMachine[]>(initialItems);
  const [parLevels, setParLevels] = useState<ParLevel[]>(initialParLevels);
  const [isLive, setIsLive] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState(initialLastUpdatedAt);
  const [expandedMachines, setExpandedMachines] = useState<Set<string>>(new Set());
  const [parDrafts, setParDrafts] = useState<Record<string, string>>({});
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isSavingPar, startSavingPar] = useTransition();

  useEffect(() => {
    const supabase = createBrowserClient();

    const channel = supabase
      .channel('inventory')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'rfid_items',
          filter: `operator_id=eq.${operatorId}`,
        },
        (payload) => {
          setItems((current) => {
            const map = new Map(current.map((row) => [row.epc, row]));

            const nextRow = payload.new as InventoryItemInMachine;
            const oldRow = payload.old as InventoryItemInMachine;

            if (payload.eventType === 'INSERT') {
              if (nextRow?.status === 'in_machine') {
                map.set(nextRow.epc, nextRow);
              }
            } else if (payload.eventType === 'UPDATE') {
              if (oldRow?.epc) {
                map.delete(oldRow.epc);
              }
              if (nextRow?.status === 'in_machine') {
                map.set(nextRow.epc, nextRow);
              }
            } else if (payload.eventType === 'DELETE') {
              if (oldRow?.epc) {
                map.delete(oldRow.epc);
              }
            }

            return Array.from(map.values());
          });

          setLastUpdatedAt(new Date().toISOString());
        }
      )
      .subscribe((status) => {
        setIsLive(status === 'SUBSCRIBED');
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [operatorId]);

  const data = useMemo(() => {
    const now = new Date();
    const soonThreshold = new Date(now.getTime() + 72 * 60 * 60 * 1000);
    const productMap = new Map(products.map((product) => [product.id, product]));
    const parMap = new Map(parLevels.map((level) => [keyFor(level.machine_id, level.product_id), level.quantity]));

    const comboCounts = new Map<
      string,
      {
        machineId: string;
        productId: string;
        count: number;
        nextExpiry: Date | null;
        expiringCount: number;
        expiredCount: number;
      }
    >();

    const machineTotals = new Map<string, { total: number; expiring: number; expired: number }>();

    for (const item of items) {
      if (item.status !== 'in_machine' || !item.machine_id || !item.product_id) continue;

      const comboKey = keyFor(item.machine_id, item.product_id);
      const expiry = parseDate(item.expiration_date);
      const expiring = expiry ? expiry.getTime() >= now.getTime() && expiry.getTime() <= soonThreshold.getTime() : false;
      const expired = expiry ? expiry.getTime() < now.getTime() : false;

      const currentCombo = comboCounts.get(comboKey) ?? {
        machineId: item.machine_id,
        productId: item.product_id,
        count: 0,
        nextExpiry: null,
        expiringCount: 0,
        expiredCount: 0,
      };
      currentCombo.count += 1;
      if (expiring) currentCombo.expiringCount += 1;
      if (expired) currentCombo.expiredCount += 1;
      if (expiry && (!currentCombo.nextExpiry || expiry.getTime() < currentCombo.nextExpiry.getTime())) {
        currentCombo.nextExpiry = expiry;
      }
      comboCounts.set(comboKey, currentCombo);

      const totals = machineTotals.get(item.machine_id) ?? { total: 0, expiring: 0, expired: 0 };
      totals.total += 1;
      if (expiring) totals.expiring += 1;
      if (expired) totals.expired += 1;
      machineTotals.set(item.machine_id, totals);
    }

    const machineSummaries: MachineSummary[] = machines.map((machine) => {
      const relevantCombos = new Set<string>();

      for (const comboKey of comboCounts.keys()) {
        if (comboKey.startsWith(`${machine.id}::`)) relevantCombos.add(comboKey);
      }
      for (const parLevel of parLevels) {
        if (parLevel.machine_id === machine.id) relevantCombos.add(keyFor(parLevel.machine_id, parLevel.product_id));
      }

      const rows: ProductRow[] = Array.from(relevantCombos)
        .map((comboKey) => {
          const [machineId, productId] = comboKey.split('::');
          const combo = comboCounts.get(comboKey);
          const product = productMap.get(productId);
          const parLevel = Number(parMap.get(comboKey) ?? 0);
          const count = combo?.count ?? 0;
          const nextExpiry = combo?.nextExpiry ?? null;
          const status = productStatus({ count, parLevel, nextExpiry, soonThreshold });

          return {
            machineId,
            productId,
            name: product?.name ?? productId,
            photoUrl: product?.photo_url ?? null,
            count,
            parLevel,
            nextExpiry: nextExpiry ? nextExpiry.toISOString() : null,
            status,
          };
        })
        .sort((a, b) => {
          const rank = { OUT: 0, LOW: 1, EXPIRING: 2, STOCKED: 3 } as const;
          const diff = rank[a.status] - rank[b.status];
          if (diff !== 0) return diff;
          return a.name.localeCompare(b.name);
        });

      const totals = machineTotals.get(machine.id) ?? { total: 0, expiring: 0, expired: 0 };
      const lowStock = rows.filter((row) => row.parLevel > 0 && row.count < row.parLevel).length;

      return {
        machineId: machine.id,
        machineName: machine.name,
        machineStatus: machine.status ?? null,
        totalItems: totals.total,
        expiring: totals.expiring,
        expired: totals.expired,
        lowStock,
        rows,
      };
    });

    const summary = {
      totalInMachines: machineSummaries.reduce((sum, machine) => sum + machine.totalItems, 0),
      expiringSoon: machineSummaries.reduce((sum, machine) => sum + machine.expiring, 0),
      expired: machineSummaries.reduce((sum, machine) => sum + machine.expired, 0),
      lowStockCombos: machineSummaries.reduce((sum, machine) => sum + machine.lowStock, 0),
    };

    return { machineSummaries, summary };
  }, [items, parLevels, products, machines]);

  const toggleExpanded = (machineId: string) => {
    setExpandedMachines((current) => {
      const next = new Set(current);
      if (next.has(machineId)) next.delete(machineId);
      else next.add(machineId);
      return next;
    });
  };

  const saveParLevel = (machineId: string, productId: string, rawValue: string) => {
    if (!canWrite) return;
    const quantity = Number(rawValue);
    if (!Number.isFinite(quantity) || quantity < 0) {
      setActionMessage({ type: 'error', text: t('table.parInvalid') });
      return;
    }

    startSavingPar(async () => {
      const result = await upsertParLevelAction({
        machineId,
        productId,
        quantity: Math.floor(quantity),
      });

      if (!result.ok) {
        setActionMessage({ type: 'error', text: result.error ?? t('table.parSaveError') });
        return;
      }

      setParLevels((current) => {
        const key = keyFor(machineId, productId);
        const filtered = current.filter((level) => keyFor(level.machine_id, level.product_id) !== key);
        if (Math.floor(quantity) === 0) return filtered;
        return [...filtered, { machine_id: machineId, product_id: productId, quantity: Math.floor(quantity) }];
      });
      setLastUpdatedAt(new Date().toISOString());
      setActionMessage({ type: 'success', text: t('table.parSaveSuccess') });
    });
  };

  const renderStatusBadge = (status: ProductRow['status']) => {
    if (status === 'STOCKED') {
      return <span className="rounded-full bg-emerald-100 px-2 py-1 text-[11px] font-semibold text-emerald-700">{t('table.statusStocked')}</span>;
    }
    if (status === 'LOW') {
      return <span className="rounded-full bg-amber-100 px-2 py-1 text-[11px] font-semibold text-amber-700">{t('table.statusLow')}</span>;
    }
    if (status === 'OUT') {
      return <span className="rounded-full bg-red-100 px-2 py-1 text-[11px] font-semibold text-red-700">{t('table.statusOut')}</span>;
    }
    return <span className="rounded-full bg-orange-100 px-2 py-1 text-[11px] font-semibold text-orange-700">{t('table.statusExpiring')}</span>;
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('title')}</h1>
          <p className="text-sm text-slate-500">{t('subtitle')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/inventory/expiration"
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            {t('actions.expirationReport')}
          </Link>
          <Link
            href="/inventory/tags"
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            {t('actions.manageTags')}
          </Link>
          <Link
            href="/inventory/activity"
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            {t('actions.activityLog')}
          </Link>
        </div>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-base font-bold text-slate-900">{t('summary.title')}</h3>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
              <span className={`h-2 w-2 rounded-full ${isLive ? 'bg-emerald-500' : 'bg-slate-300'}`} />
              {isLive ? tStatus('live') : t('summary.offline')}
            </div>
            {!isLive ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">{t('summary.lastUpdated', { minutes: minutesSince(lastUpdatedAt) })}</span>
                <button
                  type="button"
                  onClick={() => router.refresh()}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  {t('summary.refresh')}
                </button>
              </div>
            ) : null}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="rounded-xl border border-slate-200 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('summary.totalItems')}</p>
            <p className="mt-2 text-2xl font-bold text-slate-900">{data.summary.totalInMachines}</p>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">{t('summary.expiringSoon')}</p>
            <p className="mt-2 text-2xl font-bold text-amber-800">{data.summary.expiringSoon}</p>
          </div>
          <div className="rounded-xl border border-red-200 bg-red-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-red-700">{t('summary.expired')}</p>
            <p className="mt-2 text-2xl font-bold text-red-800">{data.summary.expired}</p>
          </div>
          <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-yellow-700">{t('summary.lowStock')}</p>
            <p className="mt-2 text-2xl font-bold text-yellow-800">{data.summary.lowStockCombos}</p>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="mb-3 text-base font-bold text-slate-900">{t('table.title')}</h3>

        {actionMessage ? (
          <div
            className={`mb-3 rounded-lg border p-2 text-sm ${
              actionMessage.type === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : 'border-red-200 bg-red-50 text-red-700'
            }`}
          >
            {actionMessage.text}
          </div>
        ) : null}

        <div className="overflow-hidden rounded-xl border border-slate-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="w-[42px] px-3 py-3" />
                <th className="px-3 py-3">{t('table.machineName')}</th>
                <th className="px-3 py-3">{t('table.machineStatus')}</th>
                <th className="px-3 py-3">{t('table.totalItems')}</th>
                <th className="px-3 py-3">{t('table.expiring')}</th>
                <th className="px-3 py-3">{t('table.expired')}</th>
                <th className="px-3 py-3">{t('table.lowStock')}</th>
              </tr>
            </thead>
            <tbody>
              {data.machineSummaries.map((machine) => {
                const expanded = expandedMachines.has(machine.machineId);
                return (
                  <Fragment key={machine.machineId}>
                    <tr className="border-t border-slate-100">
                      <td className="px-3 py-3">
                        <button
                          type="button"
                          onClick={() => toggleExpanded(machine.machineId)}
                          className="rounded-md p-1 text-slate-600 hover:bg-slate-100"
                        >
                          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </button>
                      </td>
                      <td className="px-3 py-3 font-semibold text-slate-900">{machine.machineName}</td>
                      <td className="px-3 py-3">
                        <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
                          {machine.machineStatus ?? '-'}
                        </span>
                      </td>
                      <td className="px-3 py-3 font-semibold">{machine.totalItems}</td>
                      <td className="px-3 py-3 text-amber-700">{machine.expiring}</td>
                      <td className="px-3 py-3 text-red-700">{machine.expired}</td>
                      <td className="px-3 py-3 text-yellow-700">{machine.lowStock}</td>
                    </tr>
                    {expanded ? (
                      <tr className="border-t border-slate-100 bg-slate-50/60">
                        <td colSpan={7} className="px-3 py-3">
                          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                            <table className="w-full text-left text-sm">
                              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                                <tr>
                                  <th className="px-3 py-2">{t('table.product')}</th>
                                  <th className="px-3 py-2">{t('table.count')}</th>
                                  <th className="px-3 py-2">{t('table.parLevel')}</th>
                                  <th className="px-3 py-2">{t('table.nextExpiry')}</th>
                                  <th className="px-3 py-2">{t('table.productStatus')}</th>
                                  <th className="px-3 py-2">{t('table.quickActions')}</th>
                                </tr>
                              </thead>
                              <tbody>
                                {machine.rows.map((row) => {
                                  const comboKey = keyFor(row.machineId, row.productId);
                                  const draftValue = parDrafts[comboKey] ?? String(row.parLevel);
                                  return (
                                    <tr key={comboKey} className="border-t border-slate-100">
                                      <td className="px-3 py-2">
                                        <div className="flex items-center gap-2">
                                          <div className="h-8 w-8 overflow-hidden rounded-md border border-slate-200 bg-slate-100">
                                            {row.photoUrl ? (
                                              // eslint-disable-next-line @next/next/no-img-element
                                              <img src={row.photoUrl} alt={row.name} className="h-full w-full object-cover" />
                                            ) : null}
                                          </div>
                                          <span className="text-sm font-medium text-slate-800">{row.name}</span>
                                        </div>
                                      </td>
                                      <td className="px-3 py-2 font-semibold">{row.count}</td>
                                      <td className="px-3 py-2">{row.parLevel}</td>
                                      <td className="px-3 py-2 text-xs text-slate-600">
                                        {row.nextExpiry ? new Date(row.nextExpiry).toLocaleDateString() : '-'}
                                      </td>
                                      <td className="px-3 py-2">{renderStatusBadge(row.status)}</td>
                                      <td className="px-3 py-2">
                                        <Popover>
                                          <PopoverTrigger asChild>
                                            <button
                                              type="button"
                                              disabled={!canWrite}
                                              className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                                            >
                                              <SlidersHorizontal className="h-3.5 w-3.5" />
                                              {t('table.setParLevel')}
                                            </button>
                                          </PopoverTrigger>
                                          <PopoverContent align="end" className="w-52">
                                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('table.parLevel')}</p>
                                            <input
                                              type="number"
                                              min={0}
                                              value={draftValue}
                                              onChange={(event) =>
                                                setParDrafts((current) => ({
                                                  ...current,
                                                  [comboKey]: event.target.value,
                                                }))
                                              }
                                              className="mt-2 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-[#1565C0]"
                                            />
                                            <button
                                              type="button"
                                              disabled={isSavingPar}
                                              onClick={() => saveParLevel(row.machineId, row.productId, draftValue)}
                                              className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-md bg-[#0D2B4E] px-2 py-1.5 text-xs font-semibold text-white hover:bg-[#0A2240] disabled:opacity-70"
                                            >
                                              {isSavingPar ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                                              {t('table.saveParLevel')}
                                            </button>
                                          </PopoverContent>
                                        </Popover>
                                      </td>
                                    </tr>
                                  );
                                })}

                                {machine.rows.length === 0 ? (
                                  <tr>
                                    <td colSpan={6} className="px-3 py-4 text-center text-sm text-slate-500">
                                      {t('table.noProductsForMachine')}
                                    </td>
                                  </tr>
                                ) : null}
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
