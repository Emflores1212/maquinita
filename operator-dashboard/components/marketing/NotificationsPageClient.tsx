'use client';

import { useMemo, useState, useTransition } from 'react';
import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { createNotificationSendAction } from '@/app/actions/marketing';

type MachineOption = {
  id: string;
  name: string;
};

type NotificationHistoryRow = {
  id: string;
  title: string;
  body: string;
  target: Record<string, unknown>;
  sentCount: number;
  sentAt: string | null;
  scheduledFor: string | null;
  createdAt: string;
};

function formatDateTime(value: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString();
}

function targetLabel(target: Record<string, unknown>, machineNameById: Map<string, string>, t: (key: string) => string) {
  const type = typeof target.type === 'string' ? target.type : 'all';
  if (type === 'all') return t('targetAll');
  if (type === 'inactive_7d') return t('targetInactive');
  if (type === 'machine') {
    const machineId = typeof target.machineId === 'string' ? target.machineId : '';
    return `${t('targetMachine')}: ${machineNameById.get(machineId) ?? machineId ?? '-'}`;
  }
  if (type === 'custom_sql') return t('targetCustom');
  if (type === 'consumer_ids') return t('targetDirect');
  return type;
}

export default function NotificationsPageClient({
  machines,
  history,
}: {
  machines: MachineOption[];
  history: NotificationHistoryRow[];
}) {
  const t = useTranslations('marketing.notifications');
  const [isPending, startTransition] = useTransition();
  const machineNameById = useMemo(() => new Map(machines.map((machine) => [machine.id, machine.name])), [machines]);

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [targetType, setTargetType] = useState<'all' | 'machine' | 'inactive_7d' | 'custom_sql'>('all');
  const [machineId, setMachineId] = useState('');
  const [deepLinkMachineId, setDeepLinkMachineId] = useState('');
  const [customSql, setCustomSql] = useState('');
  const [mode, setMode] = useState<'now' | 'schedule'>('now');
  const [scheduledFor, setScheduledFor] = useState('');

  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const submit = () => {
    setResultMessage(null);
    setErrorMessage(null);

    startTransition(async () => {
      const response = await createNotificationSendAction({
        title,
        body,
        targetType,
        machineId: targetType === 'machine' ? machineId || null : null,
        customSql: targetType === 'custom_sql' ? customSql || null : null,
        deepLinkMachineId: deepLinkMachineId || null,
        mode,
        scheduledFor: mode === 'schedule' && scheduledFor ? new Date(scheduledFor).toISOString() : null,
      });

      if (!response.ok) {
        setErrorMessage(response.error ?? t('genericError'));
        return;
      }

      if (response.queued) {
        setResultMessage(t('queuedSuccess'));
      } else {
        setResultMessage(t('sentSuccess'));
      }
      setTitle('');
      setBody('');
      setMachineId('');
      setDeepLinkMachineId('');
      setCustomSql('');
      setMode('now');
      setScheduledFor('');
    });
  };

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">{t('composeTitle')}</h2>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="space-y-4">
            <label className="block text-sm font-medium text-slate-700">
              {t('titleLabel')}
              <div className="mt-1 flex items-center gap-2">
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value.slice(0, 50))}
                  maxLength={50}
                  className="h-12 w-full rounded-lg border border-slate-300 px-3 text-sm"
                />
                <span className="text-xs text-slate-500">{title.length}/50</span>
              </div>
            </label>

            <label className="block text-sm font-medium text-slate-700">
              {t('messageLabel')}
              <div className="mt-1">
                <textarea
                  value={body}
                  onChange={(event) => setBody(event.target.value.slice(0, 200))}
                  maxLength={200}
                  rows={4}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
                <div className="mt-1 text-right text-xs text-slate-500">{body.length}/200</div>
              </div>
            </label>

            <label className="block text-sm font-medium text-slate-700">
              {t('targetLabel')}
              <select
                value={targetType}
                onChange={(event) => setTargetType(event.target.value as 'all' | 'machine' | 'inactive_7d' | 'custom_sql')}
                className="mt-1 h-12 w-full rounded-lg border border-slate-300 px-3 text-sm"
              >
                <option value="all">{t('targetAll')}</option>
                <option value="machine">{t('targetMachine')}</option>
                <option value="inactive_7d">{t('targetInactive')}</option>
                <option value="custom_sql">{t('targetCustom')}</option>
              </select>
            </label>

            {targetType === 'machine' ? (
              <label className="block text-sm font-medium text-slate-700">
                {t('targetMachinePicker')}
                <select
                  value={machineId}
                  onChange={(event) => setMachineId(event.target.value)}
                  className="mt-1 h-12 w-full rounded-lg border border-slate-300 px-3 text-sm"
                >
                  <option value="">{t('selectMachine')}</option>
                  {machines.map((machine) => (
                    <option key={machine.id} value={machine.id}>
                      {machine.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            {targetType === 'custom_sql' ? (
              <label className="block text-sm font-medium text-slate-700">
                {t('customSqlLabel')}
                <textarea
                  value={customSql}
                  onChange={(event) => setCustomSql(event.target.value)}
                  rows={3}
                  placeholder="last_purchase_at < now() - interval '14 days'"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </label>
            ) : null}

            <label className="block text-sm font-medium text-slate-700">
              {t('deepLinkLabel')}
              <select
                value={deepLinkMachineId}
                onChange={(event) => setDeepLinkMachineId(event.target.value)}
                className="mt-1 h-12 w-full rounded-lg border border-slate-300 px-3 text-sm"
              >
                <option value="">{t('noDeepLink')}</option>
                {machines.map((machine) => (
                  <option key={machine.id} value={machine.id}>
                    {machine.name}
                  </option>
                ))}
              </select>
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm font-medium text-slate-700">
                {t('scheduleLabel')}
                <select
                  value={mode}
                  onChange={(event) => setMode(event.target.value as 'now' | 'schedule')}
                  className="mt-1 h-12 w-full rounded-lg border border-slate-300 px-3 text-sm"
                >
                  <option value="now">{t('sendNow')}</option>
                  <option value="schedule">{t('scheduleForLater')}</option>
                </select>
              </label>

              {mode === 'schedule' ? (
                <label className="block text-sm font-medium text-slate-700">
                  {t('scheduleAtLabel')}
                  <input
                    type="datetime-local"
                    value={scheduledFor}
                    onChange={(event) => setScheduledFor(event.target.value)}
                    className="mt-1 h-12 w-full rounded-lg border border-slate-300 px-3 text-sm"
                  />
                </label>
              ) : null}
            </div>

            <button
              type="button"
              disabled={isPending}
              onClick={submit}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-[#0D2B4E] px-4 text-sm font-semibold text-white disabled:opacity-60"
            >
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {mode === 'schedule' ? t('scheduleAction') : t('sendAction')}
            </button>

            {resultMessage ? <p className="text-sm font-medium text-emerald-700">{resultMessage}</p> : null}
            {errorMessage ? <p className="text-sm font-medium text-red-700">{errorMessage}</p> : null}
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('previewLabel')}</p>
            <div className="mt-3 rounded-2xl border border-slate-300 bg-white p-3 shadow-sm">
              <p className="text-xs text-slate-500">Maquinita</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">{title || t('previewTitlePlaceholder')}</p>
              <p className="mt-1 text-sm text-slate-600">{body || t('previewBodyPlaceholder')}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">{t('historyTitle')}</h2>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500">
                <th className="px-3 py-2">{t('historyDate')}</th>
                <th className="px-3 py-2">{t('historyTitleCol')}</th>
                <th className="px-3 py-2">{t('historyTarget')}</th>
                <th className="px-3 py-2">{t('historySent')}</th>
                <th className="px-3 py-2">{t('historyScheduled')}</th>
              </tr>
            </thead>
            <tbody>
              {history.map((row) => (
                <tr key={row.id} className="border-b border-slate-100">
                  <td className="px-3 py-2 text-slate-600">{formatDateTime(row.createdAt)}</td>
                  <td className="px-3 py-2">
                    <p className="font-medium text-slate-900">{row.title}</p>
                    <p className="line-clamp-1 text-xs text-slate-500">{row.body}</p>
                  </td>
                  <td className="px-3 py-2 text-slate-600">{targetLabel(row.target, machineNameById, t)}</td>
                  <td className="px-3 py-2 text-slate-600">
                    {row.sentCount} {row.sentAt ? `(${formatDateTime(row.sentAt)})` : ''}
                  </td>
                  <td className="px-3 py-2 text-slate-600">{formatDateTime(row.scheduledFor)}</td>
                </tr>
              ))}
              {history.length === 0 ? (
                <tr>
                  <td className="px-3 py-4 text-slate-500" colSpan={5}>
                    {t('historyEmpty')}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
