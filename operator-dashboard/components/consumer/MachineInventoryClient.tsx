'use client';

import { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { createBrowserClient } from '@/lib/supabase-browser';
import type { ConsumerProductInventoryRow } from '@/components/consumer/types';

const ALLERGEN_ICON: Record<string, string> = {
  gluten: '🌾',
  dairy: '🥛',
  nuts: '🥜',
  soy: '🫘',
  eggs: '🥚',
  fish: '🐟',
  shellfish: '🦐',
  sesame: '⚪',
};

function money(value: number, locale = 'en-US') {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(value);
}

export default function MachineInventoryClient({
  operatorId,
  machineId,
  happyHourActive,
  initialProducts,
}: {
  operatorId: string;
  machineId: string;
  happyHourActive: boolean;
  initialProducts: ConsumerProductInventoryRow[];
}) {
  const t = useTranslations('consumer.inventory');

  const [products, setProducts] = useState<ConsumerProductInventoryRow[]>(initialProducts);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);

  const productById = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
  const selectedProduct = selectedProductId ? productById.get(selectedProductId) ?? null : null;

  useEffect(() => {
    const supabase = createBrowserClient();

    const refreshInventory = async () => {
      const { data: activeProductsData } = await supabase
        .from('products')
        .select('id, name, photo_url, base_price, category_id, nutritional, allergens, product_categories(name)')
        .eq('operator_id', operatorId)
        .eq('status', 'active')
        .order('name', { ascending: true });

      const activeProducts =
        (activeProductsData as Array<{
          id: string;
          name: string;
          photo_url: string | null;
          base_price: number | null;
          category_id: string | null;
          nutritional: Record<string, unknown> | null;
          allergens: string[] | null;
          product_categories: { name?: string | null } | null;
        }> | null) ?? [];

      const { data: inventoryRowsData } = await supabase
        .from('rfid_items')
        .select('product_id, current_discount')
        .eq('operator_id', operatorId)
        .eq('machine_id', machineId)
        .eq('status', 'in_machine');

      const inventoryRows =
        (inventoryRowsData as Array<{ product_id: string | null; current_discount: number | null }> | null) ?? [];

      const aggregates = new Map<string, { count: number; maxDiscount: number }>();
      for (const row of inventoryRows) {
        if (!row.product_id) continue;
        const current = aggregates.get(row.product_id) ?? { count: 0, maxDiscount: 0 };
        current.count += 1;
        current.maxDiscount = Math.max(current.maxDiscount, Number(row.current_discount ?? 0));
        aggregates.set(row.product_id, current);
      }

      const next = activeProducts.map((product) => {
        const aggregate = aggregates.get(product.id) ?? { count: 0, maxDiscount: 0 };
        const basePrice = Number(product.base_price ?? 0);
        const discountPct = Number(aggregate.maxDiscount ?? 0);
        const finalPrice = basePrice * Math.max(0, 1 - discountPct / 100);

        return {
          id: product.id,
          name: product.name,
          photoUrl: product.photo_url,
          basePrice,
          categoryId: product.category_id,
          categoryName: product.product_categories?.name ?? t('uncategorized'),
          nutritional: (product.nutritional as Record<string, unknown> | null) ?? {},
          allergens: product.allergens ?? [],
          count: aggregate.count,
          discountPct,
          finalPrice,
          onSale: discountPct > 0,
        } satisfies ConsumerProductInventoryRow;
      });

      setProducts(next);
    };

    const channel = supabase
      .channel(`consumer-machine-${machineId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'rfid_items',
          filter: `machine_id=eq.${machineId}`,
        },
        () => {
          void refreshInventory();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [machineId, operatorId, t]);

  const grouped = useMemo(() => {
    const map = new Map<string, ConsumerProductInventoryRow[]>();
    for (const product of products) {
      const key = product.categoryName;
      const list = map.get(key) ?? [];
      list.push(product);
      map.set(key, list);
    }

    return [...map.entries()]
      .map(([category, list]) => ({
        category,
        products: list.sort((a, b) => a.name.localeCompare(b.name)),
      }))
      .sort((a, b) => a.category.localeCompare(b.category));
  }, [products]);

  return (
    <div className="space-y-4">
      {happyHourActive ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
          {t('happyHourActive')}
        </div>
      ) : null}

      {grouped.map((group) => (
        <section key={group.category} className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{group.category}</h2>
          <div className="grid grid-cols-2 gap-3">
            {group.products.map((product) => (
              <button
                key={product.id}
                type="button"
                onClick={() => setSelectedProductId(product.id)}
                className={`relative overflow-hidden rounded-xl border border-slate-200 bg-white text-left shadow-sm ${
                  product.count === 0 ? 'opacity-55' : 'opacity-100'
                }`}
              >
                {product.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={product.photoUrl} alt={product.name} className="h-28 w-full object-cover" />
                ) : (
                  <div className="h-28 w-full bg-slate-100" />
                )}

                {product.count === 0 ? (
                  <div className="absolute inset-0 flex items-center justify-center bg-slate-900/45 px-2 text-center text-xs font-bold text-white">
                    {t('outOfStock')}
                  </div>
                ) : null}

                <div className="p-2">
                  <p className="line-clamp-2 text-sm font-semibold text-slate-900">{product.name}</p>
                  {product.onSale ? (
                    <p className="mt-1 text-xs font-semibold text-amber-700">{t('onSale', { discount: product.discountPct.toFixed(0) })}</p>
                  ) : null}
                  <div className="mt-1 flex items-center gap-2">
                    {product.onSale ? <span className="text-xs text-slate-400 line-through">{money(product.basePrice)}</span> : null}
                    <span className="text-sm font-bold text-slate-900">{money(product.onSale ? product.finalPrice : product.basePrice)}</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </section>
      ))}

      {selectedProduct ? (
        <div className="fixed inset-0 z-50 flex items-end bg-black/50 sm:items-center sm:justify-center" onClick={() => setSelectedProductId(null)}>
          <div
            className="w-full max-w-lg rounded-t-2xl bg-white p-4 sm:rounded-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-lg font-bold text-slate-900">{selectedProduct.name}</h3>
                <p className="text-sm text-slate-500">{selectedProduct.categoryName}</p>
              </div>
              <button type="button" onClick={() => setSelectedProductId(null)} className="rounded-md p-1 text-slate-500 hover:bg-slate-100">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
              {Object.entries(selectedProduct.nutritional ?? {}).map(([key, value]) => (
                <div key={key} className="rounded-lg border border-slate-200 px-2 py-1 text-slate-700">
                  <span className="font-semibold text-slate-800">{key}:</span> {String(value)}
                </div>
              ))}
              {Object.keys(selectedProduct.nutritional ?? {}).length === 0 ? <p className="text-slate-500">{t('noNutritionData')}</p> : null}
            </div>

            <div className="mt-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t('allergens')}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {selectedProduct.allergens.length === 0 ? <p className="text-sm text-slate-500">{t('noAllergens')}</p> : null}
                {selectedProduct.allergens.map((allergen) => (
                  <span key={allergen} className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-700">
                    <span>{ALLERGEN_ICON[allergen.toLowerCase()] ?? '•'}</span>
                    <span>{allergen}</span>
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
