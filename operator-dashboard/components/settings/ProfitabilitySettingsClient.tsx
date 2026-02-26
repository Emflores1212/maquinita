'use client';

import { useMemo, useState, useTransition, type FormEvent } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  removeCogsSettingAction,
  upsertCategoryCogsAction,
  upsertProductCogsAction,
} from '@/app/actions/analytics';

type CogsSetting = {
  settingId: string;
  cogsPercentage: number;
};

type ProfitabilitySettingsClientProps = {
  canEdit: boolean;
  categories: Array<{ id: string; name: string }>;
  products: Array<{ id: string; name: string; categoryId: string | null }>;
  categoryCogs: Record<string, CogsSetting>;
  productCogs: Record<string, CogsSetting>;
};

type Feedback =
  | {
      tone: 'success' | 'error';
      text: string;
    }
  | null;

function toPercentInput(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '';
  return Number(value).toFixed(2).replace(/\.00$/, '');
}

function parsePercentInput(value: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  if (parsed < 0 || parsed > 100) return null;
  return Number(parsed.toFixed(2));
}

export default function ProfitabilitySettingsClient({
  canEdit,
  categories,
  products,
  categoryCogs,
  productCogs,
}: ProfitabilitySettingsClientProps) {
  const t = useTranslations('profitabilitySettings');

  const [categoryDrafts, setCategoryDrafts] = useState<Record<string, string>>(() => {
    const next: Record<string, string> = {};
    categories.forEach((category) => {
      next[category.id] = toPercentInput(categoryCogs[category.id]?.cogsPercentage);
    });
    return next;
  });

  const [productDrafts, setProductDrafts] = useState<Record<string, string>>(() => {
    const next: Record<string, string> = {};
    products.forEach((product) => {
      next[product.id] = toPercentInput(productCogs[product.id]?.cogsPercentage);
    });
    return next;
  });

  const [feedback, setFeedback] = useState<Feedback>(null);
  const [isPending, startTransition] = useTransition();

  const productsByCategory = useMemo(() => {
    const map = new Map<string, Array<{ id: string; name: string }>>();

    for (const category of categories) {
      map.set(category.id, []);
    }

    for (const product of products) {
      if (!product.categoryId) continue;
      if (!map.has(product.categoryId)) continue;
      map.get(product.categoryId)?.push({ id: product.id, name: product.name });
    }

    for (const list of map.values()) {
      list.sort((a, b) => a.name.localeCompare(b.name));
    }

    return map;
  }, [categories, products]);

  const saveCategory = (event: FormEvent<HTMLFormElement>, categoryId: string) => {
    event.preventDefault();
    if (!canEdit) return;

    const parsed = parsePercentInput(categoryDrafts[categoryId] ?? '');
    if (parsed === null) {
      setFeedback({ tone: 'error', text: t('errors.invalidPercent') });
      return;
    }

    setFeedback(null);

    startTransition(async () => {
      const result = await upsertCategoryCogsAction({
        categoryId,
        cogsPercentage: parsed,
      });

      if (!result.ok) {
        setFeedback({ tone: 'error', text: result.error ?? t('errors.saveFailed') });
        return;
      }

      setFeedback({ tone: 'success', text: t('messages.categorySaved') });
    });
  };

  const saveProduct = (event: FormEvent<HTMLFormElement>, productId: string) => {
    event.preventDefault();
    if (!canEdit) return;

    const parsed = parsePercentInput(productDrafts[productId] ?? '');
    if (parsed === null) {
      setFeedback({ tone: 'error', text: t('errors.invalidPercent') });
      return;
    }

    setFeedback(null);

    startTransition(async () => {
      const result = await upsertProductCogsAction({
        productId,
        cogsPercentage: parsed,
      });

      if (!result.ok) {
        setFeedback({ tone: 'error', text: result.error ?? t('errors.saveFailed') });
        return;
      }

      setFeedback({ tone: 'success', text: t('messages.productSaved') });
    });
  };

  const clearCategory = (categoryId: string) => {
    if (!canEdit) return;
    const existing = categoryCogs[categoryId];
    if (!existing?.settingId) return;

    setFeedback(null);

    startTransition(async () => {
      const result = await removeCogsSettingAction({ settingId: existing.settingId });
      if (!result.ok) {
        setFeedback({ tone: 'error', text: result.error ?? t('errors.deleteFailed') });
        return;
      }

      setFeedback({ tone: 'success', text: t('messages.categoryCleared') });
      setCategoryDrafts((current) => ({ ...current, [categoryId]: '' }));
    });
  };

  const clearProduct = (productId: string) => {
    if (!canEdit) return;
    const existing = productCogs[productId];
    if (!existing?.settingId) return;

    setFeedback(null);

    startTransition(async () => {
      const result = await removeCogsSettingAction({ settingId: existing.settingId });
      if (!result.ok) {
        setFeedback({ tone: 'error', text: result.error ?? t('errors.deleteFailed') });
        return;
      }

      setFeedback({ tone: 'success', text: t('messages.productCleared') });
      setProductDrafts((current) => ({ ...current, [productId]: '' }));
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('title')}</h1>
          <p className="mt-1 text-sm text-slate-600">{t('subtitle')}</p>
        </div>

        <Link href="/analytics?tab=profitability" className="inline-flex h-12 items-center rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700">
          {t('viewReport')}
        </Link>
      </div>

      {!canEdit ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">{t('readOnly')}</div>
      ) : null}

      {feedback ? (
        <div
          className={`rounded-lg border px-4 py-3 text-sm font-semibold ${
            feedback.tone === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'border-red-200 bg-red-50 text-red-700'
          }`}
        >
          {feedback.text}
        </div>
      ) : null}

      <div className="space-y-4">
        {categories.map((category) => {
          const categoryProducts = productsByCategory.get(category.id) ?? [];
          const categoryValue = categoryDrafts[category.id] ?? '';
          const categorySetting = categoryCogs[category.id] ?? null;

          return (
            <section key={category.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-base font-semibold text-slate-900">{category.name}</h2>
                  <p className="text-xs text-slate-500">{t('categoryHelp')}</p>
                </div>
                {categorySetting ? (
                  <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
                    {t('activeValue', { value: categorySetting.cogsPercentage.toFixed(2) })}
                  </span>
                ) : null}
              </div>

              <form onSubmit={(event) => saveCategory(event, category.id)} className="mt-3 flex flex-wrap items-end gap-2">
                <label className="min-w-[220px] flex-1 text-sm font-semibold text-slate-700">
                  {t('categoryCogsLabel')}
                  <div className="mt-1 flex h-12 items-center rounded-lg border border-slate-300 px-3">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={0.01}
                      value={categoryValue}
                      disabled={!canEdit}
                      onChange={(event) =>
                        setCategoryDrafts((current) => ({
                          ...current,
                          [category.id]: event.target.value,
                        }))
                      }
                      className="w-full bg-transparent text-sm outline-none disabled:cursor-not-allowed"
                      placeholder="0"
                    />
                    <span className="text-sm text-slate-500">%</span>
                  </div>
                </label>

                <button
                  type="submit"
                  disabled={!canEdit || isPending}
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-[#0D2B4E] px-4 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {t('save')}
                </button>

                <button
                  type="button"
                  disabled={!canEdit || !categorySetting || isPending}
                  onClick={() => clearCategory(category.id)}
                  className="inline-flex h-12 items-center justify-center rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700 disabled:opacity-60"
                >
                  {t('clear')}
                </button>
              </form>

              {categoryProducts.length > 0 ? (
                <details className="mt-4 rounded-lg border border-slate-200 px-3 py-2">
                  <summary className="cursor-pointer text-sm font-semibold text-slate-800">{t('productOverrides')}</summary>

                  <div className="mt-3 space-y-2">
                    {categoryProducts.map((product) => {
                      const productSetting = productCogs[product.id] ?? null;
                      const productValue = productDrafts[product.id] ?? '';

                      return (
                        <form
                          key={product.id}
                          onSubmit={(event) => saveProduct(event, product.id)}
                          className="rounded-lg border border-slate-200 p-3"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-sm font-semibold text-slate-800">{product.name}</p>
                            {productSetting ? (
                              <span className="rounded-full bg-indigo-100 px-2 py-1 text-xs font-semibold text-indigo-700">
                                {t('overrideValue', { value: productSetting.cogsPercentage.toFixed(2) })}
                              </span>
                            ) : null}
                          </div>

                          <div className="mt-2 flex flex-wrap items-end gap-2">
                            <label className="min-w-[220px] flex-1 text-sm font-semibold text-slate-700">
                              {t('productCogsLabel')}
                              <div className="mt-1 flex h-12 items-center rounded-lg border border-slate-300 px-3">
                                <input
                                  type="number"
                                  min={0}
                                  max={100}
                                  step={0.01}
                                  value={productValue}
                                  disabled={!canEdit}
                                  onChange={(event) =>
                                    setProductDrafts((current) => ({
                                      ...current,
                                      [product.id]: event.target.value,
                                    }))
                                  }
                                  className="w-full bg-transparent text-sm outline-none disabled:cursor-not-allowed"
                                  placeholder={categoryValue || '0'}
                                />
                                <span className="text-sm text-slate-500">%</span>
                              </div>
                            </label>

                            <button
                              type="submit"
                              disabled={!canEdit || isPending}
                              className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-[#0D2B4E] px-4 text-sm font-semibold text-white disabled:opacity-60"
                            >
                              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                              {t('saveOverride')}
                            </button>

                            <button
                              type="button"
                              disabled={!canEdit || !productSetting || isPending}
                              onClick={() => clearProduct(product.id)}
                              className="inline-flex h-12 items-center justify-center rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700 disabled:opacity-60"
                            >
                              {t('clear')}
                            </button>
                          </div>
                        </form>
                      );
                    })}
                  </div>
                </details>
              ) : null}
            </section>
          );
        })}
      </div>
    </div>
  );
}
