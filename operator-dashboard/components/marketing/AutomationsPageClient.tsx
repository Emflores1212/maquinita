'use client';

import { useState, useTransition } from 'react';
import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { createAutomationRuleAction, toggleAutomationRuleAction } from '@/app/actions/marketing';

type AutomationRuleRow = {
  id: string;
  name: string;
  triggerType: 'welcome' | 'nth_purchase' | 'spend_threshold';
  triggerValue: number | null;
  rewardCredits: number;
  isActive: boolean;
  createdAt: string;
};

export default function AutomationsPageClient({ rules }: { rules: AutomationRuleRow[] }) {
  const t = useTranslations('marketing.automations');
  const [isPending, startTransition] = useTransition();

  const [name, setName] = useState('');
  const [triggerType, setTriggerType] = useState<'welcome' | 'nth_purchase' | 'spend_threshold'>('welcome');
  const [triggerValue, setTriggerValue] = useState('');
  const [rewardCredits, setRewardCredits] = useState('');
  const [createMessage, setCreateMessage] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);

  const createRule = () => {
    const reward = Number(rewardCredits);
    const triggerNumeric = Number(triggerValue);

    setCreateMessage(null);
    setCreateError(null);

    startTransition(async () => {
      const response = await createAutomationRuleAction({
        name,
        triggerType,
        triggerValue: triggerType === 'welcome' ? null : triggerNumeric,
        rewardCredits: reward,
        isActive: true,
      });

      if (!response.ok) {
        setCreateError(response.error ?? t('createError'));
        return;
      }

      setCreateMessage(t('createSuccess'));
      setName('');
      setTriggerValue('');
      setRewardCredits('');
      setTriggerType('welcome');
    });
  };

  const toggleRule = (rule: AutomationRuleRow) => {
    startTransition(async () => {
      await toggleAutomationRuleAction({
        ruleId: rule.id,
        isActive: !rule.isActive,
      });
    });
  };

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">{t('createTitle')}</h2>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <label className="block text-sm font-medium text-slate-700">
            {t('nameLabel')}
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="mt-1 h-12 w-full rounded-lg border border-slate-300 px-3 text-sm"
            />
          </label>

          <label className="block text-sm font-medium text-slate-700">
            {t('triggerTypeLabel')}
            <select
              value={triggerType}
              onChange={(event) => setTriggerType(event.target.value as 'welcome' | 'nth_purchase' | 'spend_threshold')}
              className="mt-1 h-12 w-full rounded-lg border border-slate-300 px-3 text-sm"
            >
              <option value="welcome">{t('triggerWelcome')}</option>
              <option value="nth_purchase">{t('triggerNth')}</option>
              <option value="spend_threshold">{t('triggerSpend')}</option>
            </select>
          </label>

          {triggerType !== 'welcome' ? (
            <label className="block text-sm font-medium text-slate-700">
              {t('triggerValueLabel')}
              <input
                value={triggerValue}
                onChange={(event) => setTriggerValue(event.target.value)}
                inputMode="decimal"
                className="mt-1 h-12 w-full rounded-lg border border-slate-300 px-3 text-sm"
              />
            </label>
          ) : null}

          <label className="block text-sm font-medium text-slate-700">
            {t('rewardCreditsLabel')}
            <input
              value={rewardCredits}
              onChange={(event) => setRewardCredits(event.target.value)}
              inputMode="decimal"
              className="mt-1 h-12 w-full rounded-lg border border-slate-300 px-3 text-sm"
            />
          </label>
        </div>

        <button
          type="button"
          disabled={isPending}
          onClick={createRule}
          className="mt-4 inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-[#0D2B4E] px-4 text-sm font-semibold text-white disabled:opacity-60"
        >
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {t('activateAction')}
        </button>

        {createMessage ? <p className="mt-2 text-sm font-medium text-emerald-700">{createMessage}</p> : null}
        {createError ? <p className="mt-2 text-sm font-medium text-red-700">{createError}</p> : null}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">{t('rulesTitle')}</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500">
                <th className="px-3 py-2">{t('colName')}</th>
                <th className="px-3 py-2">{t('colTrigger')}</th>
                <th className="px-3 py-2">{t('colReward')}</th>
                <th className="px-3 py-2">{t('colStatus')}</th>
                <th className="px-3 py-2">{t('colCreated')}</th>
                <th className="px-3 py-2">{t('colActions')}</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => (
                <tr key={rule.id} className="border-b border-slate-100">
                  <td className="px-3 py-2 font-medium text-slate-900">{rule.name}</td>
                  <td className="px-3 py-2 text-slate-600">
                    {rule.triggerType}
                    {rule.triggerValue !== null ? ` (${rule.triggerValue})` : ''}
                  </td>
                  <td className="px-3 py-2 text-slate-600">${rule.rewardCredits.toFixed(2)}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-2 py-1 text-xs font-semibold ${rule.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-700'}`}>
                      {rule.isActive ? t('active') : t('paused')}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-slate-600">{new Date(rule.createdAt).toLocaleString()}</td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => toggleRule(rule)}
                      disabled={isPending}
                      className="h-10 rounded-lg border border-slate-300 px-3 text-xs font-semibold text-slate-700"
                    >
                      {rule.isActive ? t('deactivateAction') : t('activateAgainAction')}
                    </button>
                  </td>
                </tr>
              ))}
              {rules.length === 0 ? (
                <tr>
                  <td className="px-3 py-4 text-slate-500" colSpan={6}>
                    {t('rulesEmpty')}
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
