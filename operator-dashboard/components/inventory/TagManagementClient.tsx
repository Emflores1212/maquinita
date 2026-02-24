'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Package,
  Server,
  ShieldAlert,
  Tag,
  Truck,
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  compareInventoryAction,
  createTagOrderAction,
  lookupDetachedTagAction,
  markMissingTagLostAction,
  processScannedEpcAction,
  registerUnexpectedTagAction,
  repurposeTagAction,
  resolveDetachedTagAction,
} from '@/app/actions/inventory-tags';
import type { InventoryMachine, InventoryProduct, ShippingAddress, TagOrder } from '@/components/inventory/types';

const TAG_TYPE_OPTIONS = [
  { value: 'sticker', label: 'Sticker', icon: Tag },
  { value: 'hard_tag', label: 'Hard Tag', icon: ShieldAlert },
  { value: 'laundry', label: 'Laundry', icon: Package },
  { value: 'metal_mount', label: 'Metal Mount', icon: Server },
] as const;

type ScanFeedback = {
  type: 'success' | 'error';
  text: string;
};

type DetachedLookup = {
  epc: string;
  productId: string | null;
  productName: string | null;
  productPhoto: string | null;
  machineName: string | null;
  status: string | null;
};

export default function TagManagementClient({
  products,
  machines,
  initialTagOrders,
  canWrite,
  defaultShippingAddress,
}: {
  products: InventoryProduct[];
  machines: InventoryMachine[];
  initialTagOrders: TagOrder[];
  canWrite: boolean;
  defaultShippingAddress: ShippingAddress;
}) {
  const t = useTranslations('inventoryTags');
  const scannerInputRef = useRef<HTMLInputElement | null>(null);

  const [activeTab, setActiveTab] = useState('assign');
  const [productSearch, setProductSearch] = useState('');
  const [selectedProductId, setSelectedProductId] = useState(products[0]?.id ?? '');
  const [selectedTagType, setSelectedTagType] = useState<string>(TAG_TYPE_OPTIONS[0]?.value ?? 'sticker');
  const [expirationDate, setExpirationDate] = useState('');
  const [scanInput, setScanInput] = useState('');
  const [scanActive, setScanActive] = useState(true);
  const [scanFeedback, setScanFeedback] = useState<ScanFeedback | null>(null);
  const [sessionCounts, setSessionCounts] = useState<Record<string, number>>({});
  const [sessionLog, setSessionLog] = useState<Array<{ epc: string; productId: string; at: number }>>([]);
  const [showSessionSummary, setShowSessionSummary] = useState(false);
  const [repurposeDialog, setRepurposeDialog] = useState<{ epc: string; previousProductName: string | null } | null>(null);
  const [repurposeProductId, setRepurposeProductId] = useState(products[0]?.id ?? '');
  const [tagOrders, setTagOrders] = useState(initialTagOrders);

  const [detachedInput, setDetachedInput] = useState('');
  const [detachedInfo, setDetachedInfo] = useState<DetachedLookup | null>(null);
  const [detachedOption, setDetachedOption] = useState<'same' | 'different' | 'lost'>('same');
  const [detachedNewProductId, setDetachedNewProductId] = useState('');
  const [detachedFeedback, setDetachedFeedback] = useState<ScanFeedback | null>(null);

  const [orderTagType, setOrderTagType] = useState<string>(TAG_TYPE_OPTIONS[0]?.value ?? 'sticker');
  const [orderQuantity, setOrderQuantity] = useState(250);
  const [orderAddress, setOrderAddress] = useState<ShippingAddress>(defaultShippingAddress);
  const [orderNotes, setOrderNotes] = useState('');
  const [orderFeedback, setOrderFeedback] = useState<ScanFeedback | null>(null);

  const [verifyMachineId, setVerifyMachineId] = useState(machines[0]?.id ?? '');
  const [verifyInput, setVerifyInput] = useState('');
  const [verifyFeedback, setVerifyFeedback] = useState<ScanFeedback | null>(null);
  const [compareData, setCompareData] = useState<{
    expectedCount: number;
    scannedCount: number;
    missing: Array<{ epc: string; productName: string | null; status: string | null }>;
    unexpected: Array<{ epc: string; productName: string | null; status: string | null; knownInSystem: boolean }>;
  } | null>(null);

  const [isProcessingScan, startProcessScan] = useTransition();
  const [isRepurposing, startRepurpose] = useTransition();
  const [isLookingUpDetached, startLookupDetached] = useTransition();
  const [isResolvingDetached, startResolveDetached] = useTransition();
  const [isSubmittingOrder, startSubmitOrder] = useTransition();
  const [isComparing, startCompare] = useTransition();
  const [isApplyingDiff, startApplyDiff] = useTransition();

  const selectedProduct = useMemo(
    () => products.find((product) => product.id === selectedProductId) ?? null,
    [products, selectedProductId]
  );

  const filteredProducts = useMemo(() => {
    const search = productSearch.trim().toLowerCase();
    if (!search) return products;
    return products.filter((product) => product.name.toLowerCase().includes(search));
  }, [products, productSearch]);

  const sessionTotals = useMemo(() => {
    const entries = Object.entries(sessionCounts).map(([productId, count]) => ({
      productId,
      count,
      productName: products.find((product) => product.id === productId)?.name ?? productId,
    }));
    const total = entries.reduce((sum, entry) => sum + entry.count, 0);
    return { entries, total };
  }, [sessionCounts, products]);

  useEffect(() => {
    if (!selectedProductId) return;
    const key = `maquinita:last-expiration:${selectedProductId}`;
    const stored = typeof window !== 'undefined' ? window.localStorage.getItem(key) : null;
    setExpirationDate(stored ?? '');
  }, [selectedProductId]);

  useEffect(() => {
    if (!selectedProductId || !expirationDate) return;
    const key = `maquinita:last-expiration:${selectedProductId}`;
    window.localStorage.setItem(key, expirationDate);
  }, [selectedProductId, expirationDate]);

  useEffect(() => {
    if (activeTab !== 'assign' || !scanActive || !canWrite) return;
    const timer = window.setTimeout(() => {
      scannerInputRef.current?.focus();
    }, 50);
    return () => window.clearTimeout(timer);
  }, [activeTab, scanActive, selectedProductId, canWrite]);

  const incrementSession = (productId: string, epc: string) => {
    setSessionCounts((current) => ({
      ...current,
      [productId]: (current[productId] ?? 0) + 1,
    }));
    setSessionLog((current) => [{ epc, productId, at: Date.now() }, ...current].slice(0, 40));
  };

  const handleProcessEpc = (rawEpc: string) => {
    if (!canWrite) return;
    const epc = rawEpc.trim();
    if (!epc) return;

    if (!selectedProductId) {
      setScanFeedback({ type: 'error', text: t('assign.selectProductFirst') });
      return;
    }

    startProcessScan(async () => {
      const result = await processScannedEpcAction({
        epc,
        productId: selectedProductId,
        tagType: selectedTagType,
        expirationDate: expirationDate || null,
      });

      if (result.ok) {
        incrementSession(selectedProductId, result.epc as string);
        setScanFeedback({ type: 'success', text: t('assign.scanSuccess', { epc: result.epc as string }) });
        setScanInput('');
        scannerInputRef.current?.focus();
        return;
      }

      if (result.type === 'needs_repurpose') {
        setRepurposeDialog({
          epc,
          previousProductName: (result.previousProductName as string | null) ?? null,
        });
        setRepurposeProductId(selectedProductId);
        setScanInput('');
        scannerInputRef.current?.focus();
        return;
      }

      if (result.type === 'in_machine') {
        const machineName = (result.machineName as string | null) ?? null;
        setScanFeedback({
          type: 'error',
          text: machineName ? t('assign.inMachineWithName', { machine: machineName }) : t('assign.inMachine'),
        });
      } else {
        setScanFeedback({ type: 'error', text: (result.error as string) ?? t('assign.scanError') });
      }

      setScanInput('');
      scannerInputRef.current?.focus();
    });
  };

  const handleRepurpose = () => {
    if (!repurposeDialog || !repurposeProductId) return;
    startRepurpose(async () => {
      const result = await repurposeTagAction({
        epc: repurposeDialog.epc,
        productId: repurposeProductId,
        tagType: selectedTagType,
        expirationDate: expirationDate || null,
      });

      if (!result.ok) {
        setScanFeedback({ type: 'error', text: result.error ?? t('assign.repurposeError') });
        return;
      }

      incrementSession(repurposeProductId, repurposeDialog.epc);
      setScanFeedback({ type: 'success', text: t('assign.repurposeSuccess', { epc: repurposeDialog.epc }) });
      setRepurposeDialog(null);
      scannerInputRef.current?.focus();
    });
  };

  const handleLookupDetached = () => {
    if (!canWrite) return;
    const epc = detachedInput.trim();
    if (!epc) return;

    startLookupDetached(async () => {
      const result = await lookupDetachedTagAction({ epc });
      if (!result.ok || !result.item) {
        setDetachedInfo(null);
        setDetachedFeedback({ type: 'error', text: result.error ?? t('detached.lookupError') });
        return;
      }
      setDetachedInfo(result.item as DetachedLookup);
      setDetachedOption('same');
      setDetachedNewProductId('');
      setDetachedFeedback(null);
    });
  };

  const handleResolveDetached = () => {
    if (!canWrite || !detachedInfo) return;
    startResolveDetached(async () => {
      const result = await resolveDetachedTagAction({
        epc: detachedInfo.epc,
        option: detachedOption,
        newProductId: detachedOption === 'different' ? detachedNewProductId : null,
      });
      if (!result.ok) {
        setDetachedFeedback({ type: 'error', text: result.error ?? t('detached.resolveError') });
        return;
      }
      setDetachedFeedback({ type: 'success', text: t('detached.resolveSuccess') });
      setDetachedInfo((current) => (current ? { ...current, status: detachedOption === 'lost' ? 'lost' : 'available' } : current));
    });
  };

  const submitOrder = () => {
    if (!canWrite) return;
    startSubmitOrder(async () => {
      const result = await createTagOrderAction({
        tagType: orderTagType,
        quantity: orderQuantity as 100 | 250 | 500 | 1000 | 2500,
        shippingAddress: {
          line1: orderAddress.line1,
          line2: orderAddress.line2 || null,
          city: orderAddress.city,
          state: orderAddress.state,
          postalCode: orderAddress.postalCode,
          country: orderAddress.country,
          contactName: orderAddress.contactName || null,
          phone: orderAddress.phone || null,
        },
        notes: orderNotes || null,
      });

      if (!result.ok) {
        setOrderFeedback({ type: 'error', text: result.error ?? t('order.submitError') });
        return;
      }

      setTagOrders((current) => [
        {
          id: result.id as string,
          tag_type: orderTagType,
          quantity: orderQuantity,
          status: 'pending',
          created_at: new Date().toISOString(),
        },
        ...current,
      ]);
      setOrderFeedback({
        type: 'success',
        text: result.emailSent ? t('order.submitSuccessEmail') : t('order.submitSuccessNoEmail'),
      });
      setOrderNotes('');
    });
  };

  const compareInventory = () => {
    if (!canWrite || !verifyMachineId) return;
    const scannedEpcs = verifyInput
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    startCompare(async () => {
      const result = await compareInventoryAction({
        machineId: verifyMachineId,
        scannedEpcs,
      });

      if (!result.ok) {
        setVerifyFeedback({ type: 'error', text: result.error ?? t('verify.compareError') });
        return;
      }

      setCompareData({
        expectedCount: result.expectedCount ?? 0,
        scannedCount: result.scannedCount ?? scannedEpcs.length,
        missing: result.missing ?? [],
        unexpected: result.unexpected ?? [],
      });
      setVerifyFeedback({ type: 'success', text: t('verify.compareSuccess') });
    });
  };

  const markLost = (epc: string) => {
    if (!canWrite || !verifyMachineId) return;
    startApplyDiff(async () => {
      const result = await markMissingTagLostAction({
        machineId: verifyMachineId,
        epc,
      });
      if (!result.ok) {
        setVerifyFeedback({ type: 'error', text: result.error ?? t('verify.markLostError') });
        return;
      }
      setCompareData((current) =>
        current
          ? {
              ...current,
              missing: current.missing.filter((row) => row.epc !== epc),
            }
          : current
      );
    });
  };

  const registerUnexpected = (epc: string) => {
    if (!canWrite || !verifyMachineId) return;
    startApplyDiff(async () => {
      const result = await registerUnexpectedTagAction({
        machineId: verifyMachineId,
        epc,
      });
      if (!result.ok) {
        setVerifyFeedback({ type: 'error', text: result.error ?? t('verify.registerError') });
        return;
      }
      setCompareData((current) =>
        current
          ? {
              ...current,
              unexpected: current.unexpected.filter((row) => row.epc !== epc),
            }
          : current
      );
    });
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t('title')}</h1>
        <p className="text-sm text-slate-500">{t('subtitle')}</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="h-auto w-full flex-wrap justify-start gap-1 bg-transparent p-0">
          <TabsTrigger value="assign">{t('tabs.assign')}</TabsTrigger>
          <TabsTrigger value="order">{t('tabs.order')}</TabsTrigger>
          <TabsTrigger value="orders">{t('tabs.orders')}</TabsTrigger>
          <TabsTrigger value="verify">{t('tabs.verify')}</TabsTrigger>
        </TabsList>

        <TabsContent value="assign" className="space-y-4">
          {!canWrite ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">{t('readOnlyMessage')}</div>
          ) : null}

          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold text-slate-800">{t('assign.step1Title')}</h2>
            <input
              value={productSearch}
              onChange={(event) => setProductSearch(event.target.value)}
              placeholder={t('assign.productSearch')}
              className="mb-3 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-[#1565C0] focus:bg-white"
            />
            <div className="max-h-48 space-y-2 overflow-auto pr-1">
              {filteredProducts.map((product) => {
                const selected = product.id === selectedProductId;
                return (
                  <button
                    type="button"
                    key={product.id}
                    onClick={() => setSelectedProductId(product.id)}
                    className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left ${
                      selected ? 'border-[#0D2B4E] bg-[#0D2B4E]/5' : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className="h-10 w-10 overflow-hidden rounded-md border border-slate-200 bg-slate-100">
                      {product.photo_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={product.photo_url} alt={product.name} className="h-full w-full object-cover" />
                      ) : null}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{product.name}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-semibold text-slate-800">{t('assign.step2Title')}</h3>
              <div className="space-y-2">
                {TAG_TYPE_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setSelectedTagType(option.value)}
                    className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                      selectedTagType === option.value
                        ? 'border-[#0D2B4E] bg-[#0D2B4E]/5 text-[#0D2B4E]'
                        : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <option.icon className="h-4 w-4" />
                    <span>{option.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-semibold text-slate-800">{t('assign.step3Title')}</h3>
              <input
                type="date"
                value={expirationDate}
                onChange={(event) => setExpirationDate(event.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#1565C0]"
              />
              <p className="mt-2 text-xs text-slate-500">{t('assign.expirationHint')}</p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="mb-2 text-sm font-semibold text-slate-800">{t('assign.productPreview')}</h3>
              {selectedProduct ? (
                <div className="flex items-center gap-3">
                  <div className="h-14 w-14 overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
                    {selectedProduct.photo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={selectedProduct.photo_url} alt={selectedProduct.name} className="h-full w-full object-cover" />
                    ) : null}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{selectedProduct.name}</p>
                    <p className="text-xs text-slate-500">{t('assign.readyToScan')}</p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-slate-500">{t('assign.noProductSelected')}</p>
              )}
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-800">{t('assign.step4Title')}</h3>
              <div className="flex items-center gap-2">
                {scanActive ? (
                  <button
                    type="button"
                    onClick={() => {
                      setScanActive(false);
                      setShowSessionSummary(true);
                    }}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    {t('assign.doneScanning')}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setScanActive(true);
                      setShowSessionSummary(false);
                      scannerInputRef.current?.focus();
                    }}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    {t('assign.resumeScanning')}
                  </button>
                )}
              </div>
            </div>

            <input
              ref={scannerInputRef}
              value={scanInput}
              disabled={!scanActive || !canWrite}
              onChange={(event) => setScanInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  handleProcessEpc(scanInput);
                }
              }}
              placeholder={t('assign.scanPlaceholder')}
              className={`w-full rounded-lg border px-3 py-3 text-sm outline-none ${
                scanFeedback?.type === 'success'
                  ? 'border-emerald-300 bg-emerald-50 focus:border-emerald-400'
                  : 'border-slate-200 bg-white focus:border-[#1565C0]'
              }`}
              autoFocus
            />

            {scanFeedback ? (
              <div
                className={`mt-3 rounded-lg border p-2 text-sm ${
                  scanFeedback.type === 'success'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : 'border-red-200 bg-red-50 text-red-700'
                }`}
              >
                {scanFeedback.text}
              </div>
            ) : null}

            <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{t('assign.runningTally')}</p>
                <div className="space-y-2">
                  {sessionTotals.entries.length === 0 ? (
                    <p className="text-sm text-slate-500">{t('assign.noSessionScans')}</p>
                  ) : (
                    sessionTotals.entries.map((entry) => (
                      <div key={entry.productId} className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2 text-sm">
                        <span>{entry.productName}</span>
                        <span className="font-semibold">{entry.count}</span>
                      </div>
                    ))
                  )}
                </div>
                <p className="mt-2 text-sm font-semibold text-slate-700">
                  {t('assign.totalAssigned')}: {sessionTotals.total}
                </p>
              </div>

              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{t('assign.latestScans')}</p>
                <div className="space-y-2">
                  {sessionLog.length === 0 ? (
                    <p className="text-sm text-slate-500">{t('assign.noLatestScans')}</p>
                  ) : (
                    sessionLog.slice(0, 8).map((item) => (
                      <div key={`${item.epc}-${item.at}`} className="rounded-md border border-slate-200 px-3 py-2 text-xs font-mono text-slate-700">
                        {item.epc}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {showSessionSummary ? (
              <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                <p className="font-semibold">{t('assign.sessionSummaryTitle')}</p>
                <p>{t('assign.sessionSummaryBody', { count: sessionTotals.total })}</p>
              </div>
            ) : null}

            {isProcessingScan ? (
              <div className="mt-3 inline-flex items-center gap-2 text-xs text-slate-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {t('assign.processing')}
              </div>
            ) : null}
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="mb-3 text-sm font-semibold text-slate-800">{t('detached.title')}</h3>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                value={detachedInput}
                onChange={(event) => setDetachedInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    handleLookupDetached();
                  }
                }}
                placeholder={t('detached.lookupPlaceholder')}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#1565C0]"
              />
              <button
                type="button"
                disabled={isLookingUpDetached || !canWrite}
                onClick={handleLookupDetached}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-70"
              >
                {isLookingUpDetached ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {t('detached.lookup')}
              </button>
            </div>

            {detachedInfo ? (
              <div className="mt-4 rounded-lg border border-slate-200 p-3">
                <div className="flex items-start gap-3">
                  <div className="h-14 w-14 overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
                    {detachedInfo.productPhoto ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={detachedInfo.productPhoto} alt={detachedInfo.productName ?? 'product'} className="h-full w-full object-cover" />
                    ) : null}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{detachedInfo.productName ?? '-'}</p>
                    <p className="text-xs text-slate-500">
                      {t('detached.lastMachine')}: {detachedInfo.machineName ?? '-'}
                    </p>
                    <p className="text-xs text-slate-500">
                      {t('detached.currentStatus')}: {detachedInfo.status ?? '-'}
                    </p>
                  </div>
                </div>

                <div className="mt-3 space-y-2">
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="radio"
                      checked={detachedOption === 'same'}
                      onChange={() => setDetachedOption('same')}
                    />
                    {t('detached.optionSame')}
                  </label>
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="radio"
                      checked={detachedOption === 'different'}
                      onChange={() => setDetachedOption('different')}
                    />
                    {t('detached.optionDifferent')}
                  </label>
                  {detachedOption === 'different' ? (
                    <select
                      value={detachedNewProductId}
                      onChange={(event) => setDetachedNewProductId(event.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#1565C0]"
                    >
                      <option value="">{t('detached.selectProduct')}</option>
                      {products.map((product) => (
                        <option key={product.id} value={product.id}>
                          {product.name}
                        </option>
                      ))}
                    </select>
                  ) : null}
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="radio"
                      checked={detachedOption === 'lost'}
                      onChange={() => setDetachedOption('lost')}
                    />
                    {t('detached.optionLost')}
                  </label>
                </div>

                <button
                  type="button"
                  disabled={isResolvingDetached || !canWrite || (detachedOption === 'different' && !detachedNewProductId)}
                  onClick={handleResolveDetached}
                  className="mt-3 inline-flex items-center gap-2 rounded-lg bg-[#0D2B4E] px-3 py-2 text-sm font-semibold text-white hover:bg-[#0A2240] disabled:opacity-70"
                >
                  {isResolvingDetached ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {t('detached.apply')}
                </button>
              </div>
            ) : null}

            {detachedFeedback ? (
              <div
                className={`mt-3 rounded-lg border p-2 text-sm ${
                  detachedFeedback.type === 'success'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : 'border-red-200 bg-red-50 text-red-700'
                }`}
              >
                {detachedFeedback.text}
              </div>
            ) : null}
          </section>

          {repurposeDialog ? (
            <>
              <div className="fixed inset-0 z-40 bg-black/40" onClick={() => setRepurposeDialog(null)} />
              <div className="fixed left-1/2 top-1/2 z-50 w-[92vw] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-slate-200 bg-white p-5 shadow-xl">
                <h4 className="text-base font-semibold text-slate-900">{t('assign.repurposeTitle')}</h4>
                <p className="mt-1 text-sm text-slate-600">
                  {t('assign.repurposeBody', {
                    product: repurposeDialog.previousProductName ?? t('assign.unknownProduct'),
                  })}
                </p>

                <select
                  value={repurposeProductId}
                  onChange={(event) => setRepurposeProductId(event.target.value)}
                  className="mt-3 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#1565C0]"
                >
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name}
                    </option>
                  ))}
                </select>

                <div className="mt-4 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                    onClick={() => setRepurposeDialog(null)}
                  >
                    {t('common.cancel')}
                  </button>
                  <button
                    type="button"
                    disabled={isRepurposing}
                    className="inline-flex items-center gap-2 rounded-lg bg-[#0D2B4E] px-3 py-2 text-sm font-semibold text-white hover:bg-[#0A2240] disabled:opacity-70"
                    onClick={handleRepurpose}
                  >
                    {isRepurposing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    {t('assign.repurposeAction')}
                  </button>
                </div>
              </div>
            </>
          ) : null}
        </TabsContent>

        <TabsContent value="order" className="space-y-4">
          {!canWrite ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">{t('readOnlyMessage')}</div>
          ) : null}
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold text-slate-800">{t('order.title')}</h2>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-700">{t('order.tagType')}</label>
                <div className="grid grid-cols-2 gap-2">
                  {TAG_TYPE_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setOrderTagType(option.value)}
                      className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                        orderTagType === option.value
                          ? 'border-[#0D2B4E] bg-[#0D2B4E]/5 text-[#0D2B4E]'
                          : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <option.icon className="h-4 w-4" />
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-700">{t('order.quantity')}</label>
                <select
                  value={orderQuantity}
                  onChange={(event) => setOrderQuantity(Number(event.target.value))}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#1565C0]"
                >
                  {[100, 250, 500, 1000, 2500].map((quantity) => (
                    <option key={quantity} value={quantity}>
                      {quantity}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-700">{t('order.address.line1')}</label>
                <input
                  value={orderAddress.line1}
                  onChange={(event) => setOrderAddress((current) => ({ ...current, line1: event.target.value }))}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#1565C0]"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-700">{t('order.address.line2')}</label>
                <input
                  value={orderAddress.line2}
                  onChange={(event) => setOrderAddress((current) => ({ ...current, line2: event.target.value }))}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#1565C0]"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-700">{t('order.address.city')}</label>
                <input
                  value={orderAddress.city}
                  onChange={(event) => setOrderAddress((current) => ({ ...current, city: event.target.value }))}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#1565C0]"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-700">{t('order.address.state')}</label>
                <input
                  value={orderAddress.state}
                  onChange={(event) => setOrderAddress((current) => ({ ...current, state: event.target.value }))}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#1565C0]"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-700">{t('order.address.postalCode')}</label>
                <input
                  value={orderAddress.postalCode}
                  onChange={(event) => setOrderAddress((current) => ({ ...current, postalCode: event.target.value }))}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#1565C0]"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-700">{t('order.address.country')}</label>
                <input
                  value={orderAddress.country}
                  onChange={(event) => setOrderAddress((current) => ({ ...current, country: event.target.value }))}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#1565C0]"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-700">{t('order.address.contactName')}</label>
                <input
                  value={orderAddress.contactName}
                  onChange={(event) => setOrderAddress((current) => ({ ...current, contactName: event.target.value }))}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#1565C0]"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-700">{t('order.address.phone')}</label>
                <input
                  value={orderAddress.phone}
                  onChange={(event) => setOrderAddress((current) => ({ ...current, phone: event.target.value }))}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#1565C0]"
                />
              </div>
            </div>

            <div className="mt-3">
              <label className="mb-1 block text-sm font-semibold text-slate-700">{t('order.notes')}</label>
              <textarea
                value={orderNotes}
                onChange={(event) => setOrderNotes(event.target.value)}
                rows={3}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#1565C0]"
              />
            </div>

            <div className="mt-4 flex items-center justify-end">
              <button
                type="button"
                disabled={isSubmittingOrder || !canWrite}
                onClick={submitOrder}
                className="inline-flex items-center gap-2 rounded-lg bg-[#0D2B4E] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0A2240] disabled:opacity-70"
              >
                {isSubmittingOrder ? <Loader2 className="h-4 w-4 animate-spin" /> : <Truck className="h-4 w-4" />}
                {t('order.submit')}
              </button>
            </div>

            {orderFeedback ? (
              <div
                className={`mt-3 rounded-lg border p-2 text-sm ${
                  orderFeedback.type === 'success'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : 'border-red-200 bg-red-50 text-red-700'
                }`}
              >
                {orderFeedback.text}
              </div>
            ) : null}
          </section>
        </TabsContent>

        <TabsContent value="orders">
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold text-slate-800">{t('orders.title')}</h2>
            <div className="overflow-hidden rounded-lg border border-slate-200">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-3 py-2">{t('orders.id')}</th>
                    <th className="px-3 py-2">{t('orders.type')}</th>
                    <th className="px-3 py-2">{t('orders.quantity')}</th>
                    <th className="px-3 py-2">{t('orders.status')}</th>
                    <th className="px-3 py-2">{t('orders.created')}</th>
                  </tr>
                </thead>
                <tbody>
                  {tagOrders.map((order) => (
                    <tr key={order.id} className="border-t border-slate-100">
                      <td className="px-3 py-2 font-mono text-xs">{order.id}</td>
                      <td className="px-3 py-2">{order.tag_type ?? '-'}</td>
                      <td className="px-3 py-2">{order.quantity ?? '-'}</td>
                      <td className="px-3 py-2">
                        <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
                          {order.status ?? 'pending'}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-500">
                        {order.created_at ? new Date(order.created_at).toLocaleString() : '-'}
                      </td>
                    </tr>
                  ))}
                  {tagOrders.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-3 py-6 text-center text-sm text-slate-500">
                        {t('orders.empty')}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>
        </TabsContent>

        <TabsContent value="verify" className="space-y-4">
          {!canWrite ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">{t('readOnlyMessage')}</div>
          ) : null}
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold text-slate-800">{t('verify.title')}</h2>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-700">{t('verify.machine')}</label>
                <select
                  value={verifyMachineId}
                  onChange={(event) => setVerifyMachineId(event.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#1565C0]"
                >
                  {machines.map((machine) => (
                    <option key={machine.id} value={machine.id}>
                      {machine.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-700">{t('verify.scanned')}</label>
                <textarea
                  value={verifyInput}
                  onChange={(event) => setVerifyInput(event.target.value)}
                  rows={4}
                  placeholder={t('verify.placeholder')}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-mono outline-none focus:border-[#1565C0]"
                />
              </div>
            </div>

            <div className="mt-3 flex items-center justify-end">
              <button
                type="button"
                disabled={isComparing || !canWrite || !verifyMachineId}
                onClick={compareInventory}
                className="inline-flex items-center gap-2 rounded-lg bg-[#0D2B4E] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0A2240] disabled:opacity-70"
              >
                {isComparing ? <Loader2 className="h-4 w-4 animate-spin" /> : <AlertTriangle className="h-4 w-4" />}
                {t('verify.compare')}
              </button>
            </div>

            {verifyFeedback ? (
              <div
                className={`mt-3 rounded-lg border p-2 text-sm ${
                  verifyFeedback.type === 'success'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                    : 'border-red-200 bg-red-50 text-red-700'
                }`}
              >
                {verifyFeedback.text}
              </div>
            ) : null}

            {compareData ? (
              <div className="mt-4 space-y-4">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                  {t('verify.summary', {
                    expected: compareData.expectedCount,
                    scanned: compareData.scannedCount,
                    missing: compareData.missing.length,
                    unexpected: compareData.unexpected.length,
                  })}
                </div>

                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                    <p className="mb-2 text-sm font-semibold text-red-800">{t('verify.missing')}</p>
                    <div className="space-y-2">
                      {compareData.missing.length === 0 ? (
                        <p className="text-xs text-red-700">{t('verify.none')}</p>
                      ) : (
                        compareData.missing.map((row) => (
                          <div key={row.epc} className="rounded-md border border-red-200 bg-white p-2 text-xs text-red-800">
                            <p className="font-mono">{row.epc}</p>
                            <p>{row.productName ?? '-'}</p>
                            <button
                              type="button"
                              disabled={isApplyingDiff || !canWrite}
                              onClick={() => markLost(row.epc)}
                              className="mt-1 inline-flex items-center gap-1 rounded-md border border-red-200 px-2 py-1 text-[11px] font-semibold text-red-700 hover:bg-red-50 disabled:opacity-70"
                            >
                              <ShieldAlert className="h-3 w-3" />
                              {t('verify.markLost')}
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                    <p className="mb-2 text-sm font-semibold text-amber-800">{t('verify.unexpected')}</p>
                    <div className="space-y-2">
                      {compareData.unexpected.length === 0 ? (
                        <p className="text-xs text-amber-800">{t('verify.none')}</p>
                      ) : (
                        compareData.unexpected.map((row) => (
                          <div key={row.epc} className="rounded-md border border-amber-200 bg-white p-2 text-xs text-amber-900">
                            <p className="font-mono">{row.epc}</p>
                            <p>{row.productName ?? '-'}</p>
                            <button
                              type="button"
                              disabled={isApplyingDiff || !canWrite}
                              onClick={() => registerUnexpected(row.epc)}
                              className="mt-1 inline-flex items-center gap-1 rounded-md border border-amber-200 px-2 py-1 text-[11px] font-semibold text-amber-800 hover:bg-amber-50 disabled:opacity-70"
                            >
                              <CheckCircle2 className="h-3 w-3" />
                              {t('verify.register')}
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </section>
        </TabsContent>
      </Tabs>
    </div>
  );
}
