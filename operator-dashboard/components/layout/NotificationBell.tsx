'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bell, AlertTriangle, AlertCircle, Thermometer, PackageMinus, WifiOff, X } from 'lucide-react';
import { useTranslations, useLocale } from 'next-intl';
import { createBrowserClient } from '@/lib/supabase-browser';
import { useAuth } from '@/components/providers/AuthProvider';

type AlertRecord = {
  id: string;
  operator_id: string;
  machine_id: string | null;
  type: string;
  severity: string | null;
  message: string | null;
  created_at: string | null;
  resolved_at: string | null;
};

function formatTimeAgo(value: string | null, locale: string, justNow: string, since: string) {
  if (!value) return justNow;
  const diffMs = Date.now() - new Date(value).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return justNow;
  if (diffMin < 60) return `${diffMin}m ${since}`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ${since}`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ${since}`;
}

function alertIcon(type: string) {
  switch (type) {
    case 'OFFLINE':
      return <WifiOff className="h-4 w-4 text-red-500" />;
    case 'TOO_WARM':
      return <Thermometer className="h-4 w-4 text-orange-500" />;
    case 'LOW_STOCK':
      return <PackageMinus className="h-4 w-4 text-blue-500" />;
    case 'RFID_ERROR':
      return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
    default:
      return <AlertCircle className="h-4 w-4 text-slate-500" />;
  }
}

export default function NotificationBell() {
  const t = useTranslations('notifications');
  const tCommon = useTranslations('common');
  const locale = useLocale();
  const { operatorId } = useAuth();
  const [open, setOpen] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [alerts, setAlerts] = useState<AlertRecord[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const sheetRef = useRef<HTMLElement | null>(null);

  const closeSheet = () => {
    setOpen(false);
    window.requestAnimationFrame(() => {
      triggerRef.current?.focus();
    });
  };

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!operatorId) return;

    const supabase = createBrowserClient();

    const fetchAlerts = async () => {
      const { data } = await supabase
        .from('alerts')
        .select('*')
        .eq('operator_id', operatorId)
        .order('created_at', { ascending: false })
        .limit(20);

      setAlerts(((data as AlertRecord[] | null) ?? []).slice(0, 20));
    };

    void fetchAlerts();

    const channel = supabase
      .channel(`notification-alerts-${operatorId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'alerts',
          filter: `operator_id=eq.${operatorId}`,
        },
        (payload) => {
          setAlerts((prev) => {
            const incoming = payload.new as AlertRecord;
            const oldRow = payload.old as AlertRecord;

            if (payload.eventType === 'INSERT') {
              if (incoming.type === 'OFFLINE_SYNC') {
                setToastMessage(incoming.message ?? t('offlineSyncToast'));
              }
              const deduped = [incoming, ...prev.filter((item) => item.id !== incoming.id)];
              return deduped.slice(0, 20);
            }

            if (payload.eventType === 'UPDATE') {
              return prev.map((item) => (item.id === incoming.id ? incoming : item));
            }

            if (payload.eventType === 'DELETE') {
              return prev.filter((item) => item.id !== oldRow.id);
            }

            return prev;
          });
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [operatorId, t]);

  useEffect(() => {
    if (!toastMessage) return;
    const timeout = window.setTimeout(() => setToastMessage(null), 4500);
    return () => window.clearTimeout(timeout);
  }, [toastMessage]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeSheet();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    window.requestAnimationFrame(() => {
      closeRef.current?.focus();
      if (document.activeElement !== closeRef.current) {
        sheetRef.current?.focus();
      }
    });
  }, [open]);

  const unreadCount = useMemo(() => alerts.filter((alert) => !readIds.has(alert.id)).length, [alerts, readIds]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        className="relative rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
        aria-label={t('title')}
        aria-expanded={open}
        aria-controls="notification-sheet"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 ? (
          <span className="absolute -right-1 -top-1 rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
            {unreadCount}
          </span>
        ) : null}
      </button>

      {isMounted
        ? createPortal(
            <>
              <div
                className={`fixed inset-0 z-[110] bg-black/30 transition-opacity ${open ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
                onClick={closeSheet}
              />
              <aside
                id="notification-sheet"
                ref={sheetRef}
                tabIndex={-1}
                className={`fixed right-0 top-0 z-[120] h-full w-full max-w-md border-l border-slate-200 bg-white shadow-xl transition-transform duration-200 ${
                  open ? 'translate-x-0' : 'translate-x-full'
                }`}
              >
                <div className="flex items-center justify-between border-b border-slate-200 p-4">
                  <h3 className="font-semibold text-slate-900">{t('title')}</h3>
                  <button ref={closeRef} className="rounded-md p-1 hover:bg-slate-100" type="button" onClick={closeSheet}>
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="flex items-center justify-between px-4 py-2">
                  <p className="text-sm text-slate-500">{alerts.length}</p>
                  <button
                    type="button"
                    className="text-xs font-semibold text-[#1565C0]"
                    onClick={() => setReadIds(new Set(alerts.map((alert) => alert.id)))}
                  >
                    {t('markAllRead')}
                  </button>
                </div>

                <div className="h-[calc(100%-98px)] overflow-y-auto px-4 pb-6">
                  {alerts.length === 0 ? (
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">{t('empty')}</div>
                  ) : (
                    <div className="space-y-3">
                      {alerts.map((alert) => (
                        <div key={alert.id} className="rounded-xl border border-slate-200 p-3">
                          <div className="mb-2 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              {alertIcon(alert.type)}
                              <p className="text-sm font-semibold text-slate-900">{alert.type}</p>
                            </div>
                            {!readIds.has(alert.id) ? <span className="h-2 w-2 rounded-full bg-red-500" /> : null}
                          </div>
                          <p className="text-sm text-slate-700">{alert.message ?? alert.type}</p>
                          <p className="mt-2 text-xs text-slate-400">
                            {formatTimeAgo(alert.created_at, locale, tCommon('justNow'), tCommon('since'))}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </aside>

              {toastMessage ? (
                <div className="fixed bottom-4 right-4 z-[130] max-w-sm rounded-xl border border-indigo-200 bg-white px-4 py-3 shadow-lg">
                  <p className="text-sm font-semibold text-indigo-800">{toastMessage}</p>
                </div>
              ) : null}
            </>,
            document.body
          )
        : null}
    </>
  );
}
