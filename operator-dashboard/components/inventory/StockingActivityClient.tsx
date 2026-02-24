'use client';

import { useMemo, useState, useTransition } from 'react';
import { Camera, Loader2, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { transferItemAction } from '@/app/actions/restock';

type ActivityMachine = {
  id: string;
  name: string;
};

type ActivityAddedItem = {
  epc: string | null;
  productId: string | null;
  productName: string | null;
};

type ActivityRemovedItem = {
  mode: 'epc' | 'product';
  epc: string | null;
  productId: string | null;
  productName: string | null;
  quantity: number;
  reason: 'expired' | 'damaged' | 'quality_issue' | 'other';
  otherReason: string | null;
};

type ActivityPhysicalCount = {
  productId: string;
  productName: string | null;
  expected: number;
  counted: number;
  status: 'matches_expected' | 'correction' | 'unconfirmed';
};

type ActivitySession = {
  id: string;
  startedAt: string | null;
  completedAt: string | null;
  machineId: string;
  machineName: string;
  operatorName: string;
  status: string | null;
  addedCount: number;
  removedCount: number;
  discrepancyCount: number;
  notes: string | null;
  photoUrls: string[];
  itemsAdded: ActivityAddedItem[];
  itemsRemoved: ActivityRemovedItem[];
  physicalCounts: ActivityPhysicalCount[];
};

function formatDate(value: string | null, locale: string) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export default function StockingActivityClient({
  sessions,
  machines,
  canTransfer,
}: {
  sessions: ActivitySession[];
  machines: ActivityMachine[];
  canTransfer: boolean;
}) {
  const t = useTranslations('stockingActivity');
  const [openSessionId, setOpenSessionId] = useState<string | null>(null);
  const [transferDraft, setTransferDraft] = useState<{ epc: string; fromMachineId: string } | null>(null);
  const [targetMachineId, setTargetMachineId] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isTransferring, startTransfer] = useTransition();

  const openSession = useMemo(() => sessions.find((session) => session.id === openSessionId) ?? null, [sessions, openSessionId]);
  const targetMachines = useMemo(() => {
    if (!transferDraft) return [];
    return machines.filter((machine) => machine.id !== transferDraft.fromMachineId);
  }, [machines, transferDraft]);

  const startTransferFlow = (epc: string, fromMachineId: string) => {
    setTransferDraft({ epc, fromMachineId });
    const nextTarget = machines.find((machine) => machine.id !== fromMachineId)?.id ?? '';
    setTargetMachineId(nextTarget);
  };

  const confirmTransfer = () => {
    if (!transferDraft || !targetMachineId) return;
    startTransfer(async () => {
      const result = await transferItemAction({
        epc: transferDraft.epc,
        fromMachineId: transferDraft.fromMachineId,
        toMachineId: targetMachineId,
      });

      if (!result.ok) {
        setFeedback({ type: 'error', text: result.error ?? t('transfer.error') });
        return;
      }

      setFeedback({ type: 'success', text: t('transfer.success') });
      setTransferDraft(null);
      setTargetMachineId('');
    });
  };

  return (
    <div className="space-y-4">
      {feedback ? (
        <div
          className={`rounded-xl border px-4 py-3 text-sm font-semibold ${
            feedback.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'border-red-200 bg-red-50 text-red-700'
          }`}
        >
          {feedback.text}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">{t('table.date')}</th>
                <th className="px-4 py-3">{t('table.machine')}</th>
                <th className="px-4 py-3">{t('table.operator')}</th>
                <th className="px-4 py-3">{t('table.added')}</th>
                <th className="px-4 py-3">{t('table.removed')}</th>
                <th className="px-4 py-3">{t('table.photos')}</th>
                <th className="px-4 py-3 text-right">{t('table.details')}</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((session) => (
                <tr key={session.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 text-slate-700">{formatDate(session.startedAt, 'en-US')}</td>
                  <td className="px-4 py-3 font-semibold text-slate-900">{session.machineName}</td>
                  <td className="px-4 py-3 text-slate-700">{session.operatorName}</td>
                  <td className="px-4 py-3 font-bold text-emerald-700">{session.addedCount}</td>
                  <td className="px-4 py-3 font-bold text-red-700">{session.removedCount}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
                      <Camera className="h-3.5 w-3.5" />
                      {session.photoUrls.length}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => setOpenSessionId(session.id)}
                      className="inline-flex h-12 items-center rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-800"
                    >
                      {t('table.open')}
                    </button>
                  </td>
                </tr>
              ))}

              {sessions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-500">
                    {t('empty')}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {openSession ? (
        <>
          <div className="fixed inset-0 z-40 bg-black/40" onClick={() => setOpenSessionId(null)} />
          <aside className="fixed right-0 top-0 z-50 h-full w-full max-w-xl overflow-auto border-l border-slate-200 bg-white p-4 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900">{t('drawer.title')}</h3>
              <button
                type="button"
                onClick={() => setOpenSessionId(null)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-300"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
              <p>
                <span className="font-semibold">{t('drawer.machine')}:</span> {openSession.machineName}
              </p>
              <p>
                <span className="font-semibold">{t('drawer.started')}:</span> {formatDate(openSession.startedAt, 'en-US')}
              </p>
              <p>
                <span className="font-semibold">{t('drawer.completed')}:</span> {formatDate(openSession.completedAt, 'en-US')}
              </p>
              <p>
                <span className="font-semibold">{t('drawer.discrepancies')}:</span> {openSession.discrepancyCount}
              </p>
            </div>

            <section className="mt-4">
              <h4 className="text-base font-bold text-slate-900">{t('drawer.addedItems')}</h4>
              <div className="mt-2 space-y-2">
                {openSession.itemsAdded.map((item, index) => (
                  <div key={`${item.epc ?? item.productId ?? 'row'}-${index}`} className="rounded-xl border border-slate-200 p-3">
                    <p className="text-sm font-semibold text-slate-900">{item.productName ?? item.productId ?? '-'}</p>
                    <p className="font-mono text-xs text-slate-600">{item.epc ?? '-'}</p>
                    {canTransfer && item.epc ? (
                      <button
                        type="button"
                        onClick={() => startTransferFlow(item.epc as string, openSession.machineId)}
                        className="mt-2 inline-flex h-11 items-center rounded-lg border border-[#0D2B4E] px-3 text-sm font-semibold text-[#0D2B4E]"
                      >
                        {t('transfer.button')}
                      </button>
                    ) : null}
                  </div>
                ))}
                {openSession.itemsAdded.length === 0 ? <p className="text-sm text-slate-500">{t('drawer.emptyAdded')}</p> : null}
              </div>
            </section>

            <section className="mt-4">
              <h4 className="text-base font-bold text-slate-900">{t('drawer.removedItems')}</h4>
              <div className="mt-2 space-y-2">
                {openSession.itemsRemoved.map((item, index) => (
                  <div key={`${item.mode}-${item.epc ?? item.productId ?? 'row'}-${index}`} className="rounded-xl border border-slate-200 p-3">
                    <p className="text-sm font-semibold text-slate-900">
                      {item.productName ?? item.productId ?? item.epc ?? '-'} x{item.quantity}
                    </p>
                    <p className="text-xs text-slate-600">
                      {t(`reasons.${item.reason}`)}
                      {item.otherReason ? ` - ${item.otherReason}` : ''}
                    </p>
                  </div>
                ))}
                {openSession.itemsRemoved.length === 0 ? <p className="text-sm text-slate-500">{t('drawer.emptyRemoved')}</p> : null}
              </div>
            </section>

            <section className="mt-4">
              <h4 className="text-base font-bold text-slate-900">{t('drawer.counts')}</h4>
              <div className="mt-2 space-y-2">
                {openSession.physicalCounts.map((row) => (
                  <div key={row.productId} className="rounded-xl border border-slate-200 p-3 text-sm">
                    <p className="font-semibold text-slate-900">{row.productName ?? row.productId}</p>
                    <p className="text-slate-700">
                      {t('drawer.expected')}: {row.expected} | {t('drawer.counted')}: {row.counted}
                    </p>
                    <p className="text-xs text-slate-600">{t(`countStatus.${row.status}`)}</p>
                  </div>
                ))}
                {openSession.physicalCounts.length === 0 ? <p className="text-sm text-slate-500">{t('drawer.emptyCounts')}</p> : null}
              </div>
            </section>

            <section className="mt-4">
              <h4 className="text-base font-bold text-slate-900">{t('drawer.notes')}</h4>
              <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{openSession.notes ?? '-'}</p>
            </section>

            <section className="mt-4">
              <h4 className="text-base font-bold text-slate-900">{t('drawer.photos')}</h4>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {openSession.photoUrls.map((url, index) => (
                  <a
                    key={`${url}-${index}`}
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="block h-28 overflow-hidden rounded-lg border border-slate-200 bg-slate-100"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt={`session-photo-${index + 1}`} className="h-full w-full object-cover" />
                  </a>
                ))}
                {openSession.photoUrls.length === 0 ? <p className="text-sm text-slate-500">{t('drawer.emptyPhotos')}</p> : null}
              </div>
            </section>
          </aside>
        </>
      ) : null}

      {transferDraft ? (
        <div className="fixed inset-0 z-[60] bg-black/50 px-4 py-8">
          <div className="mx-auto max-w-md rounded-2xl bg-white p-4 shadow-xl">
            <h4 className="text-lg font-bold text-slate-900">{t('transfer.title')}</h4>
            <p className="mt-1 text-sm text-slate-600">
              EPC: <span className="font-mono">{transferDraft.epc}</span>
            </p>

            <label className="mt-3 block text-sm font-semibold text-slate-700">{t('transfer.toMachine')}</label>
            <select
              value={targetMachineId}
              onChange={(event) => setTargetMachineId(event.target.value)}
              className="mt-2 h-12 w-full rounded-lg border border-slate-300 px-3 text-base"
            >
              {targetMachines.map((machine) => (
                <option key={machine.id} value={machine.id}>
                  {machine.name}
                </option>
              ))}
            </select>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setTransferDraft(null);
                  setTargetMachineId('');
                }}
                className="h-12 rounded-lg border border-slate-300 bg-white text-sm font-semibold text-slate-700"
              >
                {t('transfer.cancel')}
              </button>
              <button
                type="button"
                disabled={isTransferring || !targetMachineId}
                onClick={confirmTransfer}
                className="h-12 rounded-lg bg-[#0D2B4E] text-sm font-bold text-white disabled:opacity-60"
              >
                {isTransferring ? <Loader2 className="mx-auto h-5 w-5 animate-spin" /> : t('transfer.confirm')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
