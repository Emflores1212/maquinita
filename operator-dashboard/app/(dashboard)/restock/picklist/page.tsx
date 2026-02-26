import { redirect } from 'next/navigation';
import PickListClient, { type RestockPickItem, type RestockPickMachine } from '@/components/restock/PickListClient';
import { hasPermission, type UserRole } from '@/lib/permissions';
import { createServerClient } from '@/lib/supabase';

function asSingleParam(value: string | string[] | undefined): string | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

export default async function RestockPicklistPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const supabase = createServerClient();
  const db = supabase;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login?returnUrl=/restock/picklist');
  }

  const { data: profileData } = await db
    .from('profiles')
    .select('operator_id, role, assigned_machine_ids')
    .eq('id', user.id)
    .maybeSingle();

  const profile = profileData as
    | {
        operator_id: string | null;
        role: UserRole | null;
        assigned_machine_ids: string[] | null;
      }
    | null;

  if (!profile?.operator_id || !hasPermission(profile.role, 'restock', 'r')) {
    redirect('/dashboard');
  }

  let machinesQuery = db
    .from('machines')
    .select('id, name, status')
    .eq('operator_id', profile.operator_id)
    .neq('status', 'archived')
    .order('name', { ascending: true });

  if (profile.role === 'driver') {
    const assigned = profile.assigned_machine_ids ?? [];
    if (assigned.length === 0) {
      machinesQuery = machinesQuery.in('id', ['00000000-0000-0000-0000-000000000000']);
    } else {
      machinesQuery = machinesQuery.in('id', assigned);
    }
  }

  const { data: machineRows } = await machinesQuery;
  const machines = (machineRows as RestockPickMachine[] | null) ?? [];

  const requestedMachineId = asSingleParam(searchParams.machineId);
  const selectedMachineId =
    requestedMachineId && machines.some((machine) => machine.id === requestedMachineId)
      ? requestedMachineId
      : machines[0]?.id ?? null;

  if (!selectedMachineId) {
    return <PickListClient machines={[]} selectedMachineId={null} items={[]} />;
  }

  const [{ data: productsData }, { data: parData }, { data: currentRows }, { data: sessionsData }] = await Promise.all([
    db
      .from('products')
      .select('id, name, photo_url')
      .eq('operator_id', profile.operator_id)
      .eq('status', 'active')
      .order('name', { ascending: true }),
    db.from('par_levels').select('product_id, quantity').eq('machine_id', selectedMachineId),
    db
      .from('rfid_items')
      .select('product_id')
      .eq('operator_id', profile.operator_id)
      .eq('machine_id', selectedMachineId)
      .eq('status', 'in_machine'),
    db
      .from('restock_sessions')
      .select('items_added, items_removed')
      .eq('operator_id', profile.operator_id)
      .eq('machine_id', selectedMachineId)
      .eq('status', 'completed')
      .order('completed_at', { ascending: false })
      .limit(100),
  ]);

  const parMap = new Map<string, number>();
  for (const row of (parData as Array<{ product_id: string; quantity: number }> | null) ?? []) {
    parMap.set(row.product_id, Number(row.quantity ?? 0));
  }

  const currentMap = new Map<string, number>();
  for (const row of (currentRows as Array<{ product_id: string | null }> | null) ?? []) {
    if (!row.product_id) continue;
    currentMap.set(row.product_id, (currentMap.get(row.product_id) ?? 0) + 1);
  }

  const removedByProduct = new Map<string, number>();
  const addedByProduct = new Map<string, number>();
  for (const session of (sessionsData as Array<{ items_added: unknown; items_removed: unknown }> | null) ?? []) {
    const added = Array.isArray(session.items_added) ? session.items_added : [];
    for (const row of added as Array<{ productId?: string | null; quantity?: number }>) {
      const productId = row.productId;
      if (!productId) continue;
      const quantity = Number(row.quantity ?? 1);
      addedByProduct.set(productId, (addedByProduct.get(productId) ?? 0) + (Number.isFinite(quantity) ? quantity : 1));
    }

    const removed = Array.isArray(session.items_removed) ? session.items_removed : [];
    for (const row of removed as Array<{ productId?: string | null; quantity?: number }>) {
      const productId = row.productId;
      if (!productId) continue;
      const quantity = Number(row.quantity ?? 1);
      removedByProduct.set(productId, (removedByProduct.get(productId) ?? 0) + (Number.isFinite(quantity) ? quantity : 1));
    }
  }

  const items: RestockPickItem[] = ((productsData as Array<{ id: string; name: string; photo_url: string | null }> | null) ?? [])
    .map((product) => {
      const par = Number(parMap.get(product.id) ?? 0);
      const currentCount = Number(currentMap.get(product.id) ?? 0);
      const bring = Math.max(0, par - currentCount);
      const removed = Number(removedByProduct.get(product.id) ?? 0);
      const added = Number(addedByProduct.get(product.id) ?? 0);
      const wasteRate = removed > 0 ? removed / Math.max(1, added + removed) : 0;

      return {
        productId: product.id,
        name: product.name,
        photoUrl: product.photo_url,
        par,
        currentCount,
        bring,
        wasteRate,
      };
    })
    .sort((a, b) => {
      const bringDiff = b.bring - a.bring;
      if (bringDiff !== 0) return bringDiff;
      return a.name.localeCompare(b.name);
    });

  return <PickListClient machines={machines} selectedMachineId={selectedMachineId} items={items} />;
}
