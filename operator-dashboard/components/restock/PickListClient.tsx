'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Download, Play } from 'lucide-react';
import { useTranslations } from 'next-intl';

export type RestockPickMachine = {
  id: string;
  name: string;
  status: string | null;
};

export type RestockPickItem = {
  productId: string;
  name: string;
  photoUrl: string | null;
  par: number;
  currentCount: number;
  bring: number;
  wasteRate: number;
};

function wasteRatePercent(value: number) {
  return Math.round(value * 100);
}

export default function PickListClient({
  machines,
  selectedMachineId,
  items,
}: {
  machines: RestockPickMachine[];
  selectedMachineId: string | null;
  items: RestockPickItem[];
}) {
  const router = useRouter();
  const t = useTranslations('restockPicklist');

  const selectedMachine = machines.find((machine) => machine.id === selectedMachineId) ?? null;
  const totalBring = items.reduce((sum, item) => sum + item.bring, 0);

  const downloadPdf = () => {
    if (!selectedMachine) return;

    const rows = items
      .map(
        (item) =>
          `<tr>
            <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;">${item.name}</td>
            <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;text-align:right;">${item.bring}</td>
            <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;text-align:right;">${item.currentCount}</td>
            <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;text-align:right;">${item.par}</td>
          </tr>`
      )
      .join('');

    const html = `<!doctype html>
      <html>
      <head>
        <meta charset="utf-8" />
        <title>Restock Picklist</title>
      </head>
      <body style="font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding:24px; color:#0f172a;">
        <h1 style="margin:0 0 8px;font-size:28px;">${t('pdfTitle')}</h1>
        <p style="margin:0 0 4px;font-size:16px;"><strong>${t('machine')}:</strong> ${selectedMachine.name}</p>
        <p style="margin:0 0 16px;font-size:16px;"><strong>${t('totalBring')}:</strong> ${totalBring}</p>
        <table style="width:100%; border-collapse:collapse; font-size:14px;">
          <thead>
            <tr>
              <th style="text-align:left; padding:8px 10px; border-bottom:2px solid #cbd5e1;">${t('product')}</th>
              <th style="text-align:right; padding:8px 10px; border-bottom:2px solid #cbd5e1;">${t('bring')}</th>
              <th style="text-align:right; padding:8px 10px; border-bottom:2px solid #cbd5e1;">${t('current')}</th>
              <th style="text-align:right; padding:8px 10px; border-bottom:2px solid #cbd5e1;">${t('par')}</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </body>
      </html>`;

    const printWindow = window.open('', '_blank', 'noopener,noreferrer');
    if (!printWindow) return;
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  return (
    <div className="space-y-4 pb-24">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">{t('title')}</h1>
        <p className="mt-1 text-sm text-slate-600">{t('subtitle')}</p>

        <label className="mt-4 block text-sm font-semibold text-slate-700">{t('machine')}</label>
        <select
          value={selectedMachineId ?? ''}
          onChange={(event) => router.push(`/restock/picklist?machineId=${event.target.value}`)}
          className="mt-2 h-14 w-full rounded-xl border border-slate-300 bg-white px-4 text-lg font-semibold text-slate-900 focus:border-[#1565C0] focus:outline-none focus:ring-2 focus:ring-[#1565C0]/20"
        >
          {machines.map((machine) => (
            <option key={machine.id} value={machine.id}>
              {machine.name}
            </option>
          ))}
        </select>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={downloadPdf}
            disabled={!selectedMachine}
            className="inline-flex h-14 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-base font-semibold text-slate-800 disabled:opacity-50"
          >
            <Download className="h-5 w-5" />
            {t('downloadPdf')}
          </button>

          <Link
            href={selectedMachine ? `/restock/session?machineId=${selectedMachine.id}` : '/restock/picklist'}
            className="inline-flex h-14 items-center justify-center gap-2 rounded-xl bg-[#0D2B4E] px-4 text-base font-bold text-white"
          >
            <Play className="h-5 w-5" />
            {t('startRestock')}
          </Link>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">{t('recommended')}</h2>
          <span className="text-sm font-semibold text-slate-700">
            {t('totalBring')}: <span className="text-[#0D2B4E]">{totalBring}</span>
          </span>
        </div>

        <div className="space-y-3">
          {items.map((item) => (
            <article key={item.productId} className="rounded-xl border border-slate-200 p-3">
              <div className="flex items-start gap-3">
                <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
                  {item.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.photoUrl} alt={item.name} className="h-full w-full object-cover" />
                  ) : null}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="text-base font-semibold text-slate-900">{item.name}</p>
                  <p className="mt-1 text-2xl font-extrabold text-[#0D2B4E]">
                    {t('bring')}: {item.bring}
                  </p>
                  <p className="text-sm text-slate-600">
                    {t('current')}: {item.currentCount} | {t('par')}: {item.par}
                  </p>
                </div>
              </div>

              {item.wasteRate > 0.3 ? (
                <div className="mt-3 inline-flex rounded-full bg-orange-100 px-3 py-1 text-xs font-bold text-orange-700">
                  {t('wasteRisk')}: {wasteRatePercent(item.wasteRate)}%
                </div>
              ) : null}
            </article>
          ))}

          {items.length === 0 ? <p className="py-6 text-center text-sm text-slate-500">{t('empty')}</p> : null}
        </div>
      </div>
    </div>
  );
}
