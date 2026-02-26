import { redirect } from 'next/navigation';
import ExpirationReportClient from '@/components/inventory/ExpirationReportClient';
import type { ExpirationItem } from '@/components/inventory/types';
import { hasPermission, type UserRole } from '@/lib/permissions';
import { createServerClient } from '@/lib/supabase';

export default async function InventoryExpirationPage() {
  const supabase = createServerClient();
  const db = supabase;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login?returnUrl=/inventory/expiration');
  }

  const { data: profileData } = await db
    .from('profiles')
    .select('operator_id, role, assigned_machine_ids')
    .eq('id', user.id)
    .maybeSingle();

  const profile = profileData as {
    operator_id: string | null;
    role: UserRole | null;
    assigned_machine_ids: string[] | null;
  } | null;

  if (!profile?.operator_id || !hasPermission(profile.role, 'inventory', 'r')) {
    redirect('/dashboard');
  }

  const canWrite = hasPermission(profile.role, 'inventory', 'w');
  const isDriver = profile.role === 'driver';
  const assignedMachineIds = isDriver ? profile.assigned_machine_ids ?? [] : null;

  let itemsQuery = db
    .from('rfid_items')
    .select('epc, product_id, machine_id, expiration_date, status')
    .eq('operator_id', profile.operator_id)
    .eq('status', 'in_machine')
    .not('expiration_date', 'is', null);

  if (isDriver) {
    if (!assignedMachineIds || assignedMachineIds.length === 0) {
      itemsQuery = itemsQuery.in('machine_id', ['00000000-0000-0000-0000-000000000000']);
    } else {
      itemsQuery = itemsQuery.in('machine_id', assignedMachineIds);
    }
  }

  const { data: itemsData } = await itemsQuery;
  const items = (itemsData as Array<{ epc: string; product_id: string | null; machine_id: string | null; expiration_date: string | null }> | null) ?? [];

  const productIds = Array.from(new Set(items.map((item) => item.product_id).filter(Boolean))) as string[];
  const machineIds = Array.from(new Set(items.map((item) => item.machine_id).filter(Boolean))) as string[];

  const [{ data: productsData }, { data: machinesData }] = await Promise.all([
    productIds.length > 0
      ? db.from('products').select('id, name, photo_url').eq('operator_id', profile.operator_id).in('id', productIds)
      : Promise.resolve({ data: [] }),
    machineIds.length > 0
      ? db.from('machines').select('id, name').eq('operator_id', profile.operator_id).in('id', machineIds)
      : Promise.resolve({ data: [] }),
  ]);

  const productMap = new Map(((productsData as Array<{ id: string; name: string; photo_url: string | null }> | null) ?? []).map((product) => [product.id, product]));
  const machineMap = new Map(((machinesData as Array<{ id: string; name: string }> | null) ?? []).map((machine) => [machine.id, machine]));

  const expirationItems: ExpirationItem[] = items.map((item) => ({
    epc: item.epc,
    product_id: item.product_id,
    machine_id: item.machine_id,
    expiration_date: item.expiration_date,
    product_name: item.product_id ? productMap.get(item.product_id)?.name ?? null : null,
    product_photo_url: item.product_id ? productMap.get(item.product_id)?.photo_url ?? null : null,
    machine_name: item.machine_id ? machineMap.get(item.machine_id)?.name ?? null : null,
  }));

  return <ExpirationReportClient initialItems={expirationItems} canWrite={canWrite} />;
}
