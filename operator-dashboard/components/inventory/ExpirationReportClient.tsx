'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { Loader2, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { discardExpiredItemAction } from '@/app/actions/inventory';
import type { ExpirationItem } from '@/components/inventory/types';

type Bucket = 'expired' | 'today' | 'oneToThree' | 'fourToSeven';

function parseDate(date: string | null) {
  if (!date) return null;
  const parsed = new Date(`${date}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function differenceInDays(from: Date, to: Date) {
  const a = new Date(from);
  a.setHours(0, 0, 0, 0);
  const b = new Date(to);
  b.setHours(0, 0, 0, 0);
  const diff = b.getTime() - a.getTime();
  return Math.floor(diff / (24 * 60 * 60 * 1000));
}

function classifyItem(item: ExpirationItem, now: Date): Bucket | null {
  const expiry = parseDate(item.expiration_date);
  if (!expiry) return null;
  const diffDays = differenceInDays(now, expiry);
  if (diffDays < 0) return 'expired';
  if (diffDays === 0) return 'today';
  if (diffDays >= 1 && diffDays <= 3) return 'oneToThree';
  if (diffDays >= 4 && diffDays <= 7) return 'fourToSeven';
  return null;
}

export default function ExpirationReportClient({
  initialItems,
  canWrite,
}: {
  initialItems: ExpirationItem[];
  canWrite: boolean;
}) {
  const t = useTranslations('inventoryExpiration');
  const [items, setItems] = useState(initialItems);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const buckets = useMemo(() => {
    const now = new Date();
    const result: Record<Bucket, ExpirationItem[]> = {
      expired: [],
      today: [],
      oneToThree: [],
      fourToSeven: [],
    };

    for (const item of items) {
      const bucket = classifyItem(item, now);
      if (bucket) result[bucket].push(item);
    }

    for (const key of Object.keys(result) as Bucket[]) {
      result[key].sort((a, b) => {
        const dateA = parseDate(a.expiration_date)?.getTime() ?? Number.MAX_SAFE_INTEGER;
        const dateB = parseDate(b.expiration_date)?.getTime() ?? Number.MAX_SAFE_INTEGER;
        return dateA - dateB;
      });
    }

    return result;
  }, [items]);

  const removeItem = (epc: string) => {
    if (!canWrite) return;
    startTransition(async () => {
      const result = await discardExpiredItemAction({ epc });
      if (!result.ok) {
        setFeedback({ type: 'error', text: result.error ?? t('removeError') });
        return;
      }
      setItems((current) => current.filter((item) => item.epc !== epc));
      setFeedback({ type: 'success', text: t('removeSuccess') });
    });
  };

  const sections: Array<{
    key: Bucket;
    title: string;
    className: string;
    items: ExpirationItem[];
  }> = [
    { key: 'expired', title: t('sections.expired'), className: 'border-red-300 bg-red-100 text-red-900', items: buckets.expired },
    { key: 'today', title: t('sections.today'), className: 'border-orange-300 bg-orange-100 text-orange-900', items: buckets.today },
    { key: 'oneToThree', title: t('sections.oneToThree'), className: 'border-yellow-300 bg-yellow-100 text-yellow-900', items: buckets.oneToThree },
    {
      key: 'fourToSeven',
      title: t('sections.fourToSeven'),
      className: 'border-amber-200 bg-amber-50 text-amber-900',
      items: buckets.fourToSeven,
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('title')}</h1>
          <p className="text-sm text-slate-500">{t('subtitle')}</p>
        </div>
        <Link
          href="/inventory"
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          {t('backToInventory')}
        </Link>
      </div>

      {feedback ? (
        <div
          className={`rounded-lg border p-3 text-sm ${
            feedback.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'border-red-200 bg-red-50 text-red-700'
          }`}
        >
          {feedback.text}
        </div>
      ) : null}

      {sections.map((section) => (
        <section key={section.key} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className={`border-b px-4 py-3 text-sm font-bold ${section.className}`}>{section.title}</div>
          <div className="overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">{t('table.product')}</th>
                  <th className="px-3 py-2">EPC</th>
                  <th className="px-3 py-2">{t('table.machine')}</th>
                  <th className="px-3 py-2">{t('table.expiry')}</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {section.items.map((item) => (
                  <tr key={item.epc} className="border-t border-slate-100">
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <div className="h-9 w-9 overflow-hidden rounded-md border border-slate-200 bg-slate-100">
                          {item.product_photo_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={item.product_photo_url} alt={item.product_name ?? item.epc} className="h-full w-full object-cover" />
                          ) : null}
                        </div>
                        <span className="font-medium text-slate-800">{item.product_name ?? '-'}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{item.epc}</td>
                    <td className="px-3 py-2">{item.machine_name ?? '-'}</td>
                    <td className="px-3 py-2">{item.expiration_date ?? '-'}</td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        disabled={!canWrite || isPending}
                        onClick={() => removeItem(item.epc)}
                        className="inline-flex items-center gap-1 rounded-md border border-red-200 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-70"
                      >
                        {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                        {t('table.remove')}
                      </button>
                    </td>
                  </tr>
                ))}

                {section.items.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-sm text-slate-500">
                      {t('table.emptySection')}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}
