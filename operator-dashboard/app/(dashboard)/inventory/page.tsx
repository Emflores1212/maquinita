import { redirect } from 'next/navigation';
import RealtimeInventoryDashboard from '@/components/inventory/RealtimeInventoryDashboard';
import type { InventoryItemInMachine, InventoryMachine, InventoryProduct, ParLevel } from '@/components/inventory/types';
import { hasPermission, type UserRole } from '@/lib/permissions';
import { createServerClient } from '@/lib/supabase';

export default async function InventoryRoutePage() {
  const supabase = createServerClient();
  const db = supabase;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login?returnUrl=/inventory');
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

  let machinesQuery = db
    .from('machines')
    .select('id, name, status')
    .eq('operator_id', profile.operator_id)
    .neq('status', 'archived')
    .order('name', { ascending: true });

  if (isDriver) {
    if (!assignedMachineIds || assignedMachineIds.length === 0) {
      machinesQuery = machinesQuery.in('id', ['00000000-0000-0000-0000-000000000000']);
    } else {
      machinesQuery = machinesQuery.in('id', assignedMachineIds);
    }
  }

  const { data: machinesData } = await machinesQuery;
  const machines = (machinesData as InventoryMachine[] | null) ?? [];
  const machineIds = machines.map((machine) => machine.id);

  const [{ data: productsData }, { data: itemsData }, { data: parLevelsData }] = await Promise.all([
    db
      .from('products')
      .select('id, name, photo_url')
      .eq('operator_id', profile.operator_id)
      .eq('status', 'active')
      .order('name', { ascending: true }),
    machineIds.length > 0
      ? db
          .from('rfid_items')
          .select('epc, machine_id, product_id, expiration_date, status')
          .eq('operator_id', profile.operator_id)
          .eq('status', 'in_machine')
          .in('machine_id', machineIds)
      : Promise.resolve({ data: [] }),
    machineIds.length > 0
      ? db.from('par_levels').select('machine_id, product_id, quantity').in('machine_id', machineIds)
      : Promise.resolve({ data: [] }),
  ]);

  const products = (productsData as InventoryProduct[] | null) ?? [];
  const initialItems = (itemsData as InventoryItemInMachine[] | null) ?? [];
  const initialParLevels = (parLevelsData as ParLevel[] | null) ?? [];

  return (
    <RealtimeInventoryDashboard
      operatorId={profile.operator_id}
      canWrite={canWrite}
      machines={machines}
      products={products}
      initialItems={initialItems}
      initialParLevels={initialParLevels}
      initialLastUpdatedAt={new Date().toISOString()}
    />
  );
}
