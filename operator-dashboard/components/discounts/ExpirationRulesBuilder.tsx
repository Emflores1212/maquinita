'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2 } from 'lucide-react';
import { createExpirationRuleAction } from '@/app/actions/discounts';
import type { DiscountTargetOption } from '@/components/discounts/types';

type TierInput = {
  days_remaining: number;
  discount_pct: number;
};

function toggle(selected: string[], id: string) {
  return selected.includes(id) ? selected.filter((value) => value !== id) : [...selected, id];
}

export default function ExpirationRulesBuilder({
  products,
  categories,
}: {
  products: DiscountTargetOption[];
  categories: DiscountTargetOption[];
}) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [targetProductIds, setTargetProductIds] = useState<string[]>([]);
  const [targetCategoryIds, setTargetCategoryIds] = useState<string[]>([]);
  const [tiers, setTiers] = useState<TierInput[]>([
    { days_remaining: 3, discount_pct: 20 },
    { days_remaining: 1, discount_pct: 40 },
    { days_remaining: 0, discount_pct: 60 },
  ]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const submit = () => {
    setError(null);

    if (!name.trim()) {
      setError('Rule name is required');
      return;
    }

    startTransition(async () => {
      const result = await createExpirationRuleAction({
        name,
        targetProductIds,
        targetCategoryIds,
        tiers,
        isActive: true,
      });

      if (!result.ok) {
        setError(result.error ?? 'Failed to create expiration rule');
        return;
      }

      router.push('/discounts');
      router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Expiration Rules Builder</h1>
        <p className="text-sm text-slate-500">Define tiered discount rules by days remaining to expiration.</p>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <label className="space-y-1">
          <span className="text-sm font-medium text-slate-700">Rule Name</span>
          <input
            className="min-h-12 w-full rounded-lg border border-slate-200 px-3"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Example: Fresh food markdown"
          />
        </label>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-800">Tiers</h2>
          <button
            type="button"
            onClick={() => setTiers((current) => [...current, { days_remaining: 0, discount_pct: 0 }])}
            className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-700"
          >
            <Plus className="h-4 w-4" /> Add Tier
          </button>
        </div>

        <div className="space-y-2">
          {tiers.map((tier, index) => (
            <div key={`tier-${index}`} className="grid grid-cols-[1fr_1fr_auto] items-center gap-2">
              <input
                type="number"
                min="0"
                value={tier.days_remaining}
                onChange={(event) =>
                  setTiers((current) =>
                    current.map((row, rowIndex) => (rowIndex === index ? { ...row, days_remaining: Number(event.target.value) } : row))
                  )
                }
                className="min-h-12 rounded-lg border border-slate-200 px-3"
                placeholder="Days remaining"
              />
              <input
                type="number"
                min="0"
                max="100"
                value={tier.discount_pct}
                onChange={(event) =>
                  setTiers((current) =>
                    current.map((row, rowIndex) => (rowIndex === index ? { ...row, discount_pct: Number(event.target.value) } : row))
                  )
                }
                className="min-h-12 rounded-lg border border-slate-200 px-3"
                placeholder="Discount %"
              />
              <button
                type="button"
                onClick={() => setTiers((current) => current.filter((_, rowIndex) => rowIndex !== index))}
                className="inline-flex min-h-12 items-center justify-center rounded-lg border border-red-200 px-3 text-red-600"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-2 text-sm font-semibold text-slate-800">Target Products</h2>
          <div className="max-h-64 space-y-1 overflow-auto pr-1">
            {products.length === 0 ? <p className="text-sm text-slate-500">No products available.</p> : null}
            {products.map((product) => (
              <label key={product.id} className="flex min-h-12 items-center gap-3 rounded-md px-2 hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={targetProductIds.includes(product.id)}
                  onChange={() => setTargetProductIds((current) => toggle(current, product.id))}
                />
                <span className="text-sm text-slate-700">{product.name}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-2 text-sm font-semibold text-slate-800">Target Categories</h2>
          <div className="max-h-64 space-y-1 overflow-auto pr-1">
            {categories.length === 0 ? <p className="text-sm text-slate-500">No categories available.</p> : null}
            {categories.map((category) => (
              <label key={category.id} className="flex min-h-12 items-center gap-3 rounded-md px-2 hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={targetCategoryIds.includes(category.id)}
                  onChange={() => setTargetCategoryIds((current) => toggle(current, category.id))}
                />
                <span className="text-sm text-slate-700">{category.name}</span>
              </label>
            ))}
          </div>
        </div>
      </section>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="flex flex-wrap justify-end gap-2">
        <button
          type="button"
          onClick={() => router.push('/discounts')}
          className="min-h-12 rounded-lg border border-slate-200 px-4 text-sm font-semibold text-slate-700"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={isPending}
          className="min-h-12 rounded-lg bg-[#0D2B4E] px-4 text-sm font-semibold text-white disabled:opacity-60"
        >
          {isPending ? 'Saving...' : 'Activate Rule'}
        </button>
      </div>
    </div>
  );
}
