'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Camera, CheckCircle2, ChevronLeft, ChevronRight, Loader2, Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  assignUnknownRestockEpcAction,
  completeRestockSessionAction,
  scanRestockEpcAction,
} from '@/app/actions/restock';
import { createBrowserClient } from '@/lib/supabase-browser';

type SessionProduct = {
  id: string;
  name: string;
  photo_url: string | null;
  par: number;
  currentCount: number;
};

type RemovalInput =
  | {
      mode: 'epc';
      epc: string;
      reason: 'expired' | 'damaged' | 'quality_issue' | 'other';
      otherReason?: string | null;
    }
  | {
      mode: 'product';
      productId: string;
      quantity: number;
      reason: 'expired' | 'damaged' | 'quality_issue' | 'other';
      otherReason?: string | null;
    };

type PhysicalCountInput = {
  productId: string;
  expected: number;
  counted: number;
  status: 'matches_expected' | 'correction' | 'unconfirmed';
};

type FlashInfo = {
  productName: string;
  photoUrl: string | null;
};

function normalizeEpc(value: string) {
  return value.replace(/\s+/g, '').toUpperCase();
}

function uniquePush(current: string[], value: string) {
  if (current.includes(value)) return current;
  return [...current, value];
}

function buildCountMap(products: SessionProduct[], addedByProduct: Map<string, number>) {
  const map = new Map<string, number>();
  for (const product of products) {
    map.set(product.id, (product.currentCount ?? 0) + (addedByProduct.get(product.id) ?? 0));
  }
  return map;
}

export default function RestockSessionClient({
  operatorId,
  sessionId,
  machineId,
  machineName,
  products,
}: {
  operatorId: string;
  sessionId: string;
  machineId: string;
  machineName: string;
  products: SessionProduct[];
}) {
  const router = useRouter();
  const t = useTranslations('restockSession');
  const scannerInputRef = useRef<HTMLInputElement | null>(null);

  const [step, setStep] = useState(1);
  const [scanInput, setScanInput] = useState('');
  const [scanFeedback, setScanFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [flash, setFlash] = useState<FlashInfo | null>(null);
  const [addedEpcs, setAddedEpcs] = useState<string[]>([]);
  const [addedByProduct, setAddedByProduct] = useState<Map<string, number>>(new Map());
  const [unknownEpc, setUnknownEpc] = useState<string | null>(null);
  const [assignProductId, setAssignProductId] = useState(products[0]?.id ?? '');
  const [assignTagType, setAssignTagType] = useState('sticker');

  const [countDrafts, setCountDrafts] = useState<Record<string, string>>({});
  const [physicalCounts, setPhysicalCounts] = useState<PhysicalCountInput[] | null>(null);
  const [removals, setRemovals] = useState<RemovalInput[]>([]);
  const [showRemovalModal, setShowRemovalModal] = useState(false);
  const [removalMode, setRemovalMode] = useState<'epc' | 'product'>('epc');
  const [removalEpc, setRemovalEpc] = useState('');
  const [removalProductId, setRemovalProductId] = useState(products[0]?.id ?? '');
  const [removalQuantity, setRemovalQuantity] = useState('1');
  const [removalReason, setRemovalReason] = useState<'expired' | 'damaged' | 'quality_issue' | 'other'>('expired');
  const [removalOtherReason, setRemovalOtherReason] = useState('');

  const [notes, setNotes] = useState('');
  const [photoPaths, setPhotoPaths] = useState<string[]>([]);
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);

  const [isScanning, startScanning] = useTransition();
  const [isAssigningUnknown, startAssigningUnknown] = useTransition();
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [isCompleting, startCompleting] = useTransition();

  useEffect(() => {
    if (step !== 1) return;
    const timer = window.setTimeout(() => scannerInputRef.current?.focus(), 80);
    return () => window.clearTimeout(timer);
  }, [step]);

  useEffect(() => {
    if (!flash) return;
    const timer = window.setTimeout(() => setFlash(null), 500);
    return () => window.clearTimeout(timer);
  }, [flash]);

  const productById = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
  const productCountsAfterScan = useMemo(() => buildCountMap(products, addedByProduct), [products, addedByProduct]);

  const addedSummary = useMemo(() => {
    return Array.from(addedByProduct.entries())
      .map(([productId, count]) => ({
        productId,
        count,
        name: productById.get(productId)?.name ?? productId,
      }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [addedByProduct, productById]);

  const removalCount = useMemo(
    () =>
      removals.reduce((sum, removal) => {
        if (removal.mode === 'epc') return sum + 1;
        return sum + removal.quantity;
      }, 0),
    [removals]
  );

  const discrepancyPreview = useMemo(() => {
    if (!physicalCounts) return 0;
    return physicalCounts.reduce((sum, row) => (row.status === 'unconfirmed' ? sum : sum + Math.abs(row.expected - row.counted)), 0);
  }, [physicalCounts]);

  const belowParPreview = useMemo(() => {
    const removedByProduct = new Map<string, number>();
    for (const removal of removals) {
      if (removal.mode === 'product') {
        removedByProduct.set(removal.productId, (removedByProduct.get(removal.productId) ?? 0) + removal.quantity);
      }
    }

    return products
      .map((product) => {
        const predicted = (product.currentCount ?? 0) + (addedByProduct.get(product.id) ?? 0) - (removedByProduct.get(product.id) ?? 0);
        return {
          id: product.id,
          name: product.name,
          par: product.par,
          predicted,
        };
      })
      .filter((row) => row.par > 0 && row.predicted < row.par)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [products, addedByProduct, removals]);

  const processScan = (rawValue: string) => {
    const epc = normalizeEpc(rawValue);
    if (!epc) return;
    if (addedEpcs.includes(epc)) {
      setScanFeedback({ type: 'error', text: t('scan.duplicateInSession') });
      setScanInput('');
      return;
    }

    startScanning(async () => {
      const result = await scanRestockEpcAction({
        sessionId,
        machineId,
        epc,
      });

      if (!result.ok) {
        if ('type' in result && result.type === 'not_found') {
          setUnknownEpc(epc);
          setAssignProductId(products[0]?.id ?? '');
          setScanInput('');
          return;
        }
        if ('type' in result && result.type === 'already_in_machine') {
          setScanFeedback({ type: 'error', text: t('scan.alreadyInMachine') });
          setScanInput('');
          return;
        }
        if ('type' in result && result.type === 'in_other_machine') {
          const machineNameFromResult = (result.machineName as string | null) ?? t('scan.unknownMachine');
          setScanFeedback({
            type: 'error',
            text: t('scan.inOtherMachine', { machine: machineNameFromResult }),
          });
          setScanInput('');
          return;
        }
        const errorMessage = 'error' in result && result.error ? result.error : t('scan.genericError');
        setScanFeedback({ type: 'error', text: errorMessage });
        setScanInput('');
        return;
      }

      const resolvedProductId = (result.productId as string | null) ?? null;
      if (!resolvedProductId) {
        setUnknownEpc(epc);
        setAssignProductId(products[0]?.id ?? '');
        setScanInput('');
        return;
      }

      setAddedEpcs((current) => uniquePush(current, epc));
      setAddedByProduct((current) => {
        const next = new Map(current);
        next.set(resolvedProductId, (next.get(resolvedProductId) ?? 0) + 1);
        return next;
      });
      setFlash({
        productName: (result.productName as string | null) ?? productById.get(resolvedProductId)?.name ?? epc,
        photoUrl: (result.productPhotoUrl as string | null) ?? productById.get(resolvedProductId)?.photo_url ?? null,
      });
      setScanFeedback({ type: 'success', text: t('scan.success', { epc }) });
      setScanInput('');
    });
  };

  const assignUnknownEpc = () => {
    if (!unknownEpc || !assignProductId) return;

    startAssigningUnknown(async () => {
      const result = await assignUnknownRestockEpcAction({
        sessionId,
        machineId,
        epc: unknownEpc,
        productId: assignProductId,
        tagType: assignTagType,
      });

      if (!result.ok) {
        setScanFeedback({ type: 'error', text: result.error ?? t('scan.assignUnknownError') });
        return;
      }

      const epc = (result.epc as string) ?? unknownEpc;
      const resolvedProductId = (result.productId as string) ?? assignProductId;

      setAddedEpcs((current) => uniquePush(current, epc));
      setAddedByProduct((current) => {
        const next = new Map(current);
        next.set(resolvedProductId, (next.get(resolvedProductId) ?? 0) + 1);
        return next;
      });
      setFlash({
        productName: (result.productName as string | null) ?? productById.get(resolvedProductId)?.name ?? epc,
        photoUrl: (result.productPhotoUrl as string | null) ?? productById.get(resolvedProductId)?.photo_url ?? null,
      });
      setScanFeedback({ type: 'success', text: t('scan.assignedUnknownSuccess', { epc }) });
      setUnknownEpc(null);
      setScanInput('');
      scannerInputRef.current?.focus();
    });
  };

  const confirmCounts = () => {
    const next: PhysicalCountInput[] = products
      .filter((product) => (product.par ?? 0) > 0 || (productCountsAfterScan.get(product.id) ?? 0) > 0)
      .map((product) => {
        const expected = productCountsAfterScan.get(product.id) ?? 0;
        const draft = countDrafts[product.id];
        const counted = draft && draft.trim().length > 0 ? Math.max(0, Math.floor(Number(draft))) : expected;
        return {
          productId: product.id,
          expected,
          counted: Number.isFinite(counted) ? counted : expected,
          status: counted === expected ? 'matches_expected' : 'correction',
        };
      });

    setPhysicalCounts(next);
    setStep(3);
  };

  const skipCounts = () => {
    const next: PhysicalCountInput[] = products
      .filter((product) => (product.par ?? 0) > 0 || (productCountsAfterScan.get(product.id) ?? 0) > 0)
      .map((product) => {
        const expected = productCountsAfterScan.get(product.id) ?? 0;
        return {
          productId: product.id,
          expected,
          counted: expected,
          status: 'unconfirmed',
        };
      });

    setPhysicalCounts(next);
    setStep(3);
  };

  const addRemoval = () => {
    if (removalMode === 'epc') {
      const epc = normalizeEpc(removalEpc);
      if (!epc) return;
      setRemovals((current) => [
        ...current,
        {
          mode: 'epc',
          epc,
          reason: removalReason,
          otherReason: removalReason === 'other' ? removalOtherReason.trim() : null,
        },
      ]);
    } else {
      const quantity = Math.max(1, Math.floor(Number(removalQuantity)));
      if (!removalProductId || !Number.isFinite(quantity)) return;
      setRemovals((current) => [
        ...current,
        {
          mode: 'product',
          productId: removalProductId,
          quantity,
          reason: removalReason,
          otherReason: removalReason === 'other' ? removalOtherReason.trim() : null,
        },
      ]);
    }

    setRemovalEpc('');
    setRemovalQuantity('1');
    setRemovalOtherReason('');
    setRemovalReason('expired');
    setShowRemovalModal(false);
  };

  const uploadPhotos = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setIsUploadingPhoto(true);
    const supabase = createBrowserClient();
    const nextPaths: string[] = [];
    const nextPreviews: string[] = [];

    for (const file of Array.from(files)) {
      const ext = (file.name.split('.').pop() ?? 'jpg').toLowerCase();
      const path = `${operatorId}/${sessionId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await supabase.storage.from('cabinet-photos').upload(path, file, { upsert: false });
      if (!error) {
        nextPaths.push(path);
        nextPreviews.push(URL.createObjectURL(file));
      }
    }

    setPhotoPaths((current) => [...current, ...nextPaths]);
    setPhotoPreviews((current) => [...current, ...nextPreviews]);
    setIsUploadingPhoto(false);
  };

  const completeSession = () => {
    const ensuredPhysicalCounts =
      physicalCounts ??
      products
        .filter((product) => (product.par ?? 0) > 0 || (productCountsAfterScan.get(product.id) ?? 0) > 0)
        .map((product) => {
          const expected = productCountsAfterScan.get(product.id) ?? 0;
          return {
            productId: product.id,
            expected,
            counted: expected,
            status: 'unconfirmed' as const,
          };
        });

    startCompleting(async () => {
      const result = await completeRestockSessionAction({
        sessionId,
        machineId,
        addedEpcs,
        removals,
        physicalCounts: ensuredPhysicalCounts,
        notes,
        photoPaths,
      });

      if (!result.ok) {
        setScanFeedback({ type: 'error', text: result.error ?? t('complete.error') });
        return;
      }

      router.push(`/restock/picklist?machineId=${machineId}`);
      router.refresh();
    });
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-8">
      <div className="sticky top-0 z-20 border-b border-slate-200 bg-white px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          {t('machine')}: {machineName}
        </p>
        <h1 className="text-xl font-bold text-slate-900">{t('title')}</h1>
        <p className="text-sm text-slate-600">
          {t('stepLabel', { step, total: 4 })} - {t(`steps.${step}`)}
        </p>
      </div>

      <div className="mx-auto w-full max-w-3xl px-4 pt-4">
        {flash ? (
          <div className="mb-4 flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
            <div className="h-12 w-12 overflow-hidden rounded-lg border border-emerald-200 bg-white">
              {flash.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={flash.photoUrl} alt={flash.productName} className="h-full w-full object-cover" />
              ) : null}
            </div>
            <p className="text-base font-bold text-emerald-800">{flash.productName}</p>
          </div>
        ) : null}

        {scanFeedback ? (
          <div
            className={`mb-4 rounded-xl border px-4 py-3 text-sm font-semibold ${
              scanFeedback.type === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : 'border-red-200 bg-red-50 text-red-700'
            }`}
          >
            {scanFeedback.text}
          </div>
        ) : null}

        {step === 1 ? (
          <section className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-sm font-semibold text-slate-700">{t('scan.title')}</p>
              <input
                ref={scannerInputRef}
                autoFocus
                value={scanInput}
                onChange={(event) => setScanInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter') return;
                  event.preventDefault();
                  processScan(scanInput);
                }}
                placeholder={t('scan.placeholder')}
                className="mt-2 h-16 w-full rounded-xl border border-slate-300 px-4 text-2xl font-semibold text-slate-900 focus:border-[#1565C0] focus:outline-none focus:ring-2 focus:ring-[#1565C0]/20"
              />
              <p className="mt-2 text-xs text-slate-500">{t('scan.hint')}</p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="text-base font-bold text-slate-900">{t('scan.runningTally')}</h3>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {addedSummary.map((row) => (
                  <div key={row.productId} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="truncate text-sm font-semibold text-slate-800">{row.name}</p>
                    <p className="mt-1 text-3xl font-extrabold text-[#0D2B4E]">{row.count}</p>
                  </div>
                ))}
              </div>
              {addedSummary.length === 0 ? <p className="mt-3 text-sm text-slate-500">{t('scan.empty')}</p> : null}
            </div>
          </section>
        ) : null}

        {step === 2 ? (
          <section className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-lg font-bold text-slate-900">{t('counts.title')}</h2>
              <div className="mt-3 space-y-3">
                {products
                  .filter((product) => (product.par ?? 0) > 0 || (productCountsAfterScan.get(product.id) ?? 0) > 0)
                  .map((product, index) => {
                    const expected = productCountsAfterScan.get(product.id) ?? 0;
                    return (
                      <article key={product.id} className="rounded-xl border border-slate-200 p-3">
                        <p className="text-base font-semibold text-slate-900">{product.name}</p>
                        <p className="text-sm text-slate-600">{t('counts.expected', { count: expected })}</p>
                        <input
                          autoFocus={index === 0}
                          inputMode="numeric"
                          value={countDrafts[product.id] ?? ''}
                          onChange={(event) =>
                            setCountDrafts((current) => ({
                              ...current,
                              [product.id]: event.target.value.replace(/[^\d]/g, ''),
                            }))
                          }
                          placeholder={String(expected)}
                          className="mt-2 h-14 w-full rounded-xl border border-slate-300 px-4 text-2xl font-bold text-slate-900 focus:border-[#1565C0] focus:outline-none focus:ring-2 focus:ring-[#1565C0]/20"
                        />
                      </article>
                    );
                  })}
              </div>
            </div>
          </section>
        ) : null}

        {step === 3 ? (
          <section className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-lg font-bold text-slate-900">{t('removals.title')}</h2>
              <button
                type="button"
                onClick={() => setShowRemovalModal(true)}
                className="mt-3 inline-flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-[#0D2B4E] px-4 text-base font-bold text-white"
              >
                <Plus className="h-5 w-5" />
                {t('removals.addButton')}
              </button>

              <div className="mt-3 space-y-2">
                {removals.map((removal, index) => (
                  <div key={`${removal.mode}-${index}`} className="flex items-center justify-between rounded-xl border border-slate-200 p-3">
                    <div className="min-w-0">
                      {removal.mode === 'epc' ? (
                        <p className="text-sm font-semibold text-slate-900">
                          EPC <span className="font-mono">{removal.epc}</span>
                        </p>
                      ) : (
                        <p className="text-sm font-semibold text-slate-900">
                          {(productById.get(removal.productId)?.name ?? removal.productId) + ` x${removal.quantity}`}
                        </p>
                      )}
                      <p className="text-xs text-slate-600">{t(`reasons.${removal.reason}`)}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setRemovals((current) => current.filter((_, currentIndex) => currentIndex !== index))}
                      className="inline-flex h-12 w-12 items-center justify-center rounded-lg border border-red-200 text-red-700"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        {step === 4 ? (
          <section className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-lg font-bold text-slate-900">{t('complete.title')}</h2>
              <div className="mt-3 grid grid-cols-3 gap-3">
                <div className="rounded-xl border border-slate-200 p-3 text-center">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('complete.added')}</p>
                  <p className="text-2xl font-extrabold text-[#0D2B4E]">{addedEpcs.length}</p>
                </div>
                <div className="rounded-xl border border-slate-200 p-3 text-center">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('complete.removed')}</p>
                  <p className="text-2xl font-extrabold text-[#0D2B4E]">{removalCount}</p>
                </div>
                <div className="rounded-xl border border-slate-200 p-3 text-center">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('complete.discrepancies')}</p>
                  <p className="text-2xl font-extrabold text-[#0D2B4E]">{discrepancyPreview}</p>
                </div>
              </div>

              <div className="mt-4">
                <p className="text-sm font-semibold text-slate-700">{t('complete.belowPar')}</p>
                <div className="mt-2 space-y-2">
                  {belowParPreview.map((row) => (
                    <div key={row.id} className="rounded-xl border border-yellow-300 bg-yellow-50 p-3 text-sm font-semibold text-yellow-900">
                      {row.name}: {row.predicted} / {row.par}
                    </div>
                  ))}
                  {belowParPreview.length === 0 ? <p className="text-sm text-slate-500">{t('complete.noBelowPar')}</p> : null}
                </div>
              </div>

              <label className="mt-4 block text-sm font-semibold text-slate-700">{t('complete.notes')}</label>
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                rows={5}
                className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 text-base text-slate-900 focus:border-[#1565C0] focus:outline-none focus:ring-2 focus:ring-[#1565C0]/20"
              />

              <label className="mt-4 inline-flex h-14 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-base font-semibold text-slate-800">
                {isUploadingPhoto ? <Loader2 className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5" />}
                {t('complete.takePhoto')}
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  multiple
                  className="hidden"
                  onChange={(event) => {
                    void uploadPhotos(event.target.files);
                    event.currentTarget.value = '';
                  }}
                />
              </label>

              {photoPreviews.length > 0 ? (
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {photoPreviews.map((photo, index) => (
                    <div key={photoPaths[index] ?? photo} className="h-24 overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={photo} alt={`session-photo-${index + 1}`} className="h-full w-full object-cover" />
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </section>
        ) : null}
      </div>

      <div className="sticky bottom-0 z-20 border-t border-slate-200 bg-white px-4 py-3">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-3">
          <button
            type="button"
            onClick={() => setStep((current) => Math.max(1, current - 1))}
            disabled={step === 1 || isCompleting}
            className="inline-flex h-14 flex-1 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-base font-semibold text-slate-800 disabled:opacity-50"
          >
            <ChevronLeft className="h-5 w-5" />
            {t('actions.back')}
          </button>

          {step < 4 ? (
            <button
              type="button"
              onClick={() => {
                if (step === 1) {
                  setStep(2);
                  return;
                }
                if (step === 2) {
                  confirmCounts();
                  return;
                }
                if (step === 3) {
                  setStep(4);
                }
              }}
              className="inline-flex h-14 flex-1 items-center justify-center gap-2 rounded-xl bg-[#0D2B4E] px-4 text-base font-bold text-white"
            >
              {step === 2 ? t('actions.confirmCounts') : t('actions.next')}
              <ChevronRight className="h-5 w-5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={completeSession}
              disabled={isCompleting}
              className="inline-flex h-14 flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-base font-bold text-white disabled:opacity-60"
            >
              {isCompleting ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}
              {t('actions.complete')}
            </button>
          )}
        </div>

        {step === 2 ? (
          <button
            type="button"
            onClick={skipCounts}
            className="mx-auto mt-2 block text-sm font-semibold text-slate-600 underline underline-offset-2"
          >
            {t('counts.skip')}
          </button>
        ) : null}
      </div>

      {unknownEpc ? (
        <div className="fixed inset-0 z-40 bg-black/40 px-4 py-8">
          <div className="mx-auto max-w-md rounded-2xl bg-white p-4 shadow-xl">
            <h3 className="text-lg font-bold text-slate-900">{t('scan.assignUnknownTitle')}</h3>
            <p className="mt-1 text-sm text-slate-600">
              {t('scan.assignUnknownBody')}: <span className="font-mono">{unknownEpc}</span>
            </p>

            <label className="mt-3 block text-sm font-semibold text-slate-700">{t('scan.assignProduct')}</label>
            <select
              value={assignProductId}
              onChange={(event) => setAssignProductId(event.target.value)}
              className="mt-2 h-12 w-full rounded-lg border border-slate-300 px-3 text-base"
            >
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name}
                </option>
              ))}
            </select>

            <label className="mt-3 block text-sm font-semibold text-slate-700">{t('scan.tagType')}</label>
            <select
              value={assignTagType}
              onChange={(event) => setAssignTagType(event.target.value)}
              className="mt-2 h-12 w-full rounded-lg border border-slate-300 px-3 text-base"
            >
              <option value="sticker">Sticker</option>
              <option value="hard_tag">Hard Tag</option>
              <option value="laundry">Laundry</option>
              <option value="metal_mount">Metal Mount</option>
            </select>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setUnknownEpc(null)}
                className="h-12 rounded-lg border border-slate-300 bg-white text-sm font-semibold text-slate-700"
              >
                {t('actions.cancel')}
              </button>
              <button
                type="button"
                disabled={isAssigningUnknown}
                onClick={assignUnknownEpc}
                className="h-12 rounded-lg bg-[#0D2B4E] text-sm font-bold text-white disabled:opacity-60"
              >
                {isAssigningUnknown ? <Loader2 className="mx-auto h-5 w-5 animate-spin" /> : t('scan.assignAction')}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showRemovalModal ? (
        <div className="fixed inset-0 z-40 bg-black/40 px-4 py-8">
          <div className="mx-auto max-w-md rounded-2xl bg-white p-4 shadow-xl">
            <h3 className="text-lg font-bold text-slate-900">{t('removals.modalTitle')}</h3>

            <label className="mt-3 block text-sm font-semibold text-slate-700">{t('removals.mode')}</label>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setRemovalMode('epc')}
                className={`h-12 rounded-lg border text-sm font-semibold ${
                  removalMode === 'epc' ? 'border-[#0D2B4E] bg-[#0D2B4E] text-white' : 'border-slate-300 bg-white text-slate-700'
                }`}
              >
                EPC
              </button>
              <button
                type="button"
                onClick={() => setRemovalMode('product')}
                className={`h-12 rounded-lg border text-sm font-semibold ${
                  removalMode === 'product' ? 'border-[#0D2B4E] bg-[#0D2B4E] text-white' : 'border-slate-300 bg-white text-slate-700'
                }`}
              >
                {t('removals.productMode')}
              </button>
            </div>

            {removalMode === 'epc' ? (
              <>
                <label className="mt-3 block text-sm font-semibold text-slate-700">EPC</label>
                <input
                  autoFocus
                  value={removalEpc}
                  onChange={(event) => setRemovalEpc(event.target.value)}
                  className="mt-2 h-12 w-full rounded-lg border border-slate-300 px-3 text-base font-mono"
                />
              </>
            ) : (
              <>
                <label className="mt-3 block text-sm font-semibold text-slate-700">{t('removals.product')}</label>
                <select
                  value={removalProductId}
                  onChange={(event) => setRemovalProductId(event.target.value)}
                  className="mt-2 h-12 w-full rounded-lg border border-slate-300 px-3 text-base"
                >
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name}
                    </option>
                  ))}
                </select>

                <label className="mt-3 block text-sm font-semibold text-slate-700">{t('removals.quantity')}</label>
                <input
                  autoFocus
                  inputMode="numeric"
                  value={removalQuantity}
                  onChange={(event) => setRemovalQuantity(event.target.value.replace(/[^\d]/g, ''))}
                  className="mt-2 h-12 w-full rounded-lg border border-slate-300 px-3 text-xl font-bold"
                />
              </>
            )}

            <label className="mt-3 block text-sm font-semibold text-slate-700">{t('removals.reason')}</label>
            <select
              value={removalReason}
              onChange={(event) => setRemovalReason(event.target.value as 'expired' | 'damaged' | 'quality_issue' | 'other')}
              className="mt-2 h-12 w-full rounded-lg border border-slate-300 px-3 text-base"
            >
              <option value="expired">{t('reasons.expired')}</option>
              <option value="damaged">{t('reasons.damaged')}</option>
              <option value="quality_issue">{t('reasons.quality_issue')}</option>
              <option value="other">{t('reasons.other')}</option>
            </select>

            {removalReason === 'other' ? (
              <>
                <label className="mt-3 block text-sm font-semibold text-slate-700">{t('removals.otherReason')}</label>
                <input
                  value={removalOtherReason}
                  onChange={(event) => setRemovalOtherReason(event.target.value)}
                  className="mt-2 h-12 w-full rounded-lg border border-slate-300 px-3 text-base"
                />
              </>
            ) : null}

            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setShowRemovalModal(false)}
                className="h-12 rounded-lg border border-slate-300 bg-white text-sm font-semibold text-slate-700"
              >
                {t('actions.cancel')}
              </button>
              <button
                type="button"
                onClick={addRemoval}
                className="h-12 rounded-lg bg-[#0D2B4E] text-sm font-bold text-white"
              >
                {t('removals.confirm')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
