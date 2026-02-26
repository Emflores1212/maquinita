'use client';

import { useMemo, useState, useTransition } from 'react';
import { Loader2, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  awardCreditsAction,
  getConsumerCreditLedgerAction,
  searchConsumersByPhoneAction,
} from '@/app/actions/marketing';

type ConsumerSearchResult = {
  id: string;
  fullName: string | null;
  phone: string | null;
  creditBalance: number;
  purchaseCount: number;
};

type LedgerEntry = {
  id: string;
  type: string;
  amount: number;
  note: string | null;
  referenceId: string | null;
  createdAt: string;
};

function asCurrency(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(value);
}

export default function CreditsPageClient() {
  const t = useTranslations('marketing.credits');
  const [isPending, startTransition] = useTransition();

  const [phoneQuery, setPhoneQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ConsumerSearchResult[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [selectedConsumer, setSelectedConsumer] = useState<ConsumerSearchResult | null>(null);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('manual_adjustment');
  const [note, setNote] = useState('');
  const [awardMessage, setAwardMessage] = useState<string | null>(null);
  const [awardError, setAwardError] = useState<string | null>(null);

  const [ledgerOpen, setLedgerOpen] = useState(false);
  const [ledgerBalance, setLedgerBalance] = useState<number>(0);
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>([]);
  const [ledgerError, setLedgerError] = useState<string | null>(null);

  const selectedLabel = useMemo(() => {
    if (!selectedConsumer) return '-';
    return selectedConsumer.fullName || selectedConsumer.phone || selectedConsumer.id;
  }, [selectedConsumer]);

  const search = () => {
    setSearchError(null);
    setAwardMessage(null);
    setAwardError(null);

    startTransition(async () => {
      const response = await searchConsumersByPhoneAction({ phone: phoneQuery });
      if (!response.ok) {
        setSearchResults([]);
        setSearchError(response.error);
        return;
      }
      setSearchResults(response.consumers);
    });
  };

  const openLedger = (consumer: ConsumerSearchResult) => {
    setLedgerOpen(true);
    setLedgerError(null);
    setSelectedConsumer(consumer);
    startTransition(async () => {
      const response = await getConsumerCreditLedgerAction({ consumerId: consumer.id });
      if (!response.ok) {
        setLedgerEntries([]);
        setLedgerError(response.error);
        return;
      }
      setLedgerBalance(response.creditBalance);
      setLedgerEntries(response.entries);
    });
  };

  const award = () => {
    if (!selectedConsumer?.id) {
      setAwardError(t('selectConsumerError'));
      return;
    }
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setAwardError(t('invalidAmount'));
      return;
    }

    setAwardError(null);
    setAwardMessage(null);

    startTransition(async () => {
      const response = await awardCreditsAction({
        consumerId: selectedConsumer.id,
        amount: numericAmount,
        reason,
        note: note.trim() || null,
      });

      if (!response.ok) {
        setAwardError(response.error ?? t('awardError'));
        return;
      }

      setAmount('');
      setNote('');
      setAwardMessage(t('awardSuccess'));
      search();
    });
  };

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">{t('searchTitle')}</h2>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <input
            value={phoneQuery}
            onChange={(event) => setPhoneQuery(event.target.value)}
            placeholder={t('phonePlaceholder')}
            className="h-12 flex-1 rounded-lg border border-slate-300 px-3 text-sm"
          />
          <button
            type="button"
            disabled={isPending}
            onClick={search}
            className="inline-flex h-12 min-w-[120px] items-center justify-center gap-2 rounded-lg bg-[#0D2B4E] px-4 text-sm font-semibold text-white disabled:opacity-60"
          >
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {t('searchAction')}
          </button>
        </div>
        {searchError ? <p className="mt-2 text-sm font-medium text-red-700">{searchError}</p> : null}

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500">
                <th className="px-3 py-2">{t('nameCol')}</th>
                <th className="px-3 py-2">{t('phoneCol')}</th>
                <th className="px-3 py-2">{t('balanceCol')}</th>
                <th className="px-3 py-2">{t('purchasesCol')}</th>
                <th className="px-3 py-2">{t('actionsCol')}</th>
              </tr>
            </thead>
            <tbody>
              {searchResults.map((consumer) => (
                <tr key={consumer.id} className="border-b border-slate-100">
                  <td className="px-3 py-2 font-medium text-slate-900">{consumer.fullName || '-'}</td>
                  <td className="px-3 py-2 text-slate-600">{consumer.phone || '-'}</td>
                  <td className="px-3 py-2 text-slate-600">{asCurrency(consumer.creditBalance)}</td>
                  <td className="px-3 py-2 text-slate-600">{consumer.purchaseCount}</td>
                  <td className="px-3 py-2">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="h-10 rounded-lg border border-slate-300 px-3 text-xs font-semibold text-slate-700"
                        onClick={() => setSelectedConsumer(consumer)}
                      >
                        {t('selectAction')}
                      </button>
                      <button
                        type="button"
                        className="h-10 rounded-lg border border-slate-300 px-3 text-xs font-semibold text-slate-700"
                        onClick={() => openLedger(consumer)}
                      >
                        {t('ledgerAction')}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {searchResults.length === 0 ? (
                <tr>
                  <td className="px-3 py-4 text-slate-500" colSpan={5}>
                    {t('emptyResults')}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">{t('awardTitle')}</h2>
        <p className="mt-1 text-sm text-slate-600">
          {t('selectedConsumer')}: <span className="font-semibold text-slate-900">{selectedLabel}</span>
        </p>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <label className="block text-sm font-medium text-slate-700">
            {t('amountLabel')}
            <input
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              inputMode="decimal"
              placeholder="10.00"
              className="mt-1 h-12 w-full rounded-lg border border-slate-300 px-3 text-sm"
            />
          </label>

          <label className="block text-sm font-medium text-slate-700">
            {t('reasonLabel')}
            <select
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              className="mt-1 h-12 w-full rounded-lg border border-slate-300 px-3 text-sm"
            >
              <option value="manual_adjustment">{t('reasonManual')}</option>
              <option value="service_recovery">{t('reasonService')}</option>
              <option value="promotion">{t('reasonPromo')}</option>
            </select>
          </label>

          <label className="block text-sm font-medium text-slate-700">
            {t('noteLabel')}
            <input
              value={note}
              onChange={(event) => setNote(event.target.value)}
              className="mt-1 h-12 w-full rounded-lg border border-slate-300 px-3 text-sm"
            />
          </label>
        </div>

        <button
          type="button"
          disabled={isPending}
          onClick={award}
          className="mt-4 inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-[#0D2B4E] px-4 text-sm font-semibold text-white disabled:opacity-60"
        >
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {t('awardAction')}
        </button>

        {awardMessage ? <p className="mt-2 text-sm font-medium text-emerald-700">{awardMessage}</p> : null}
        {awardError ? <p className="mt-2 text-sm font-medium text-red-700">{awardError}</p> : null}
      </section>

      {ledgerOpen ? (
        <>
          <div className="fixed inset-0 z-40 bg-black/35" onClick={() => setLedgerOpen(false)} />
          <aside className="fixed right-0 top-0 z-50 h-full w-full max-w-lg overflow-y-auto border-l border-slate-200 bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900">{t('ledgerTitle')}</h3>
              <button
                type="button"
                onClick={() => setLedgerOpen(false)}
                className="rounded-md p-1 text-slate-500 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mb-4 text-sm text-slate-600">
              {t('currentBalance')}: <span className="font-semibold text-slate-900">{asCurrency(ledgerBalance)}</span>
            </p>
            {ledgerError ? <p className="mb-2 text-sm font-medium text-red-700">{ledgerError}</p> : null}

            <div className="space-y-2">
              {ledgerEntries.map((entry) => (
                <article key={entry.id} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold uppercase text-slate-700">{entry.type}</span>
                    <span className="text-sm font-semibold text-slate-900">{asCurrency(entry.amount)}</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-600">{entry.note || entry.referenceId || '-'}</p>
                  <p className="mt-1 text-xs text-slate-500">{new Date(entry.createdAt).toLocaleString()}</p>
                </article>
              ))}
              {ledgerEntries.length === 0 ? <p className="text-sm text-slate-500">{t('ledgerEmpty')}</p> : null}
            </div>
          </aside>
        </>
      ) : null}
    </div>
  );
}
