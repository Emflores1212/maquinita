import Link from 'next/link';
import { notFound } from 'next/navigation';
import MachineInventoryClient from '@/components/consumer/MachineInventoryClient';
import type { ConsumerProductInventoryRow } from '@/components/consumer/types';
import { createServerClient } from '@/lib/supabase';

export default async function ConsumerMachineInventoryPage({
  params,
}: {
  params: { slug: string; id: string };
}) {
  const supabase = createServerClient();

  const { data: operatorData } = await supabase
    .from('operators')
    .select('id, slug')
    .eq('slug', params.slug)
    .maybeSingle();

  const operator = operatorData as { id: string; slug: string } | null;
  if (!operator?.id) {
    notFound();
  }

  const { data: machineData } = await supabase
    .from('machines')
    .select('id, name, location_name, address')
    .eq('operator_id', operator.id)
    .eq('id', params.id)
    .maybeSingle();

  const machine = machineData as { id: string; name: string; location_name: string | null; address: string | null } | null;
  if (!machine?.id) {
    notFound();
  }

  const [productsData, inventoryData, discountsData] = await Promise.all([
    supabase
      .from('products')
      .select('id, name, photo_url, base_price, category_id, nutritional, allergens, product_categories(name)')
      .eq('operator_id', operator.id)
      .eq('status', 'active')
      .order('name', { ascending: true }),
    supabase
      .from('rfid_items')
      .select('product_id, current_discount')
      .eq('operator_id', operator.id)
      .eq('machine_id', machine.id)
      .eq('status', 'in_machine'),
    supabase
      .from('discounts')
      .select('id, target_machine_ids, status, starts_at, ends_at')
      .eq('operator_id', operator.id)
      .eq('type', 'happy_hour')
      .in('status', ['active', 'scheduled', 'paused']),
  ]);

  const inventoryRows =
    ((inventoryData.data as Array<{ product_id: string | null; current_discount: number | null }> | null) ?? []).filter(
      (row) => Boolean(row.product_id)
    );

  const aggregateByProduct = new Map<string, { count: number; maxDiscount: number }>();
  for (const row of inventoryRows) {
    const productId = row.product_id as string;
    const aggregate = aggregateByProduct.get(productId) ?? { count: 0, maxDiscount: 0 };
    aggregate.count += 1;
    aggregate.maxDiscount = Math.max(aggregate.maxDiscount, Number(row.current_discount ?? 0));
    aggregateByProduct.set(productId, aggregate);
  }

  const initialProducts: ConsumerProductInventoryRow[] =
    ((productsData.data as Array<{
      id: string;
      name: string;
      photo_url: string | null;
      base_price: number | null;
      category_id: string | null;
      nutritional: Record<string, unknown> | null;
      allergens: string[] | null;
      product_categories: { name?: string | null } | null;
    }> | null) ?? []).map((product) => {
      const aggregate = aggregateByProduct.get(product.id) ?? { count: 0, maxDiscount: 0 };
      const basePrice = Number(product.base_price ?? 0);
      const discountPct = Number(aggregate.maxDiscount ?? 0);
      const finalPrice = basePrice * Math.max(0, 1 - discountPct / 100);

      return {
        id: product.id,
        name: product.name,
        photoUrl: product.photo_url,
        basePrice,
        categoryId: product.category_id,
        categoryName: product.product_categories?.name ?? 'Uncategorized',
        nutritional: product.nutritional ?? {},
        allergens: product.allergens ?? [],
        count: aggregate.count,
        discountPct,
        finalPrice,
        onSale: discountPct > 0,
      };
    });

  const now = new Date();
  const happyHourActive =
    ((discountsData.data as Array<{
      id: string;
      target_machine_ids: string[] | null;
      status: string | null;
      starts_at: string | null;
      ends_at: string | null;
    }> | null) ?? []).some((discount) => {
      if (discount.status !== 'active') return false;

      const startsAt = discount.starts_at ? new Date(discount.starts_at) : null;
      const endsAt = discount.ends_at ? new Date(discount.ends_at) : null;

      if (startsAt && startsAt > now) return false;
      if (endsAt && endsAt <= now) return false;

      const targets = discount.target_machine_ids ?? [];
      if (targets.length === 0) return true;
      return targets.includes(machine.id);
    });

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-bold text-slate-900">{machine.name}</h2>
        <p className="mt-1 text-sm text-slate-600">{machine.location_name || machine.address || '-'}</p>
        <Link href={`/${params.slug}`} className="mt-2 inline-flex text-sm font-semibold text-[#0D2B4E] underline">
          Back to map
        </Link>
      </div>

      <MachineInventoryClient
        operatorId={operator.id}
        machineId={machine.id}
        happyHourActive={happyHourActive}
        initialProducts={initialProducts}
      />
    </div>
  );
}
