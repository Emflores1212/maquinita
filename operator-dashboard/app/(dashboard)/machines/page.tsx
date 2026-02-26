import { redirect } from 'next/navigation';
import MachineRegistryClient from '@/components/machines/MachineRegistryClient';
import type { MachineListItem } from '@/components/machines/types';
import { createServerClient } from '@/lib/supabase';
import { getTodayMetrics } from '@/lib/dashboard';

export default async function MachinesPage() {
  const supabase = createServerClient();
  const db = supabase;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login?returnUrl=/machines');
  }

  const { data: profileData } = await db.from('profiles').select('operator_id, role, assigned_machine_ids').eq('id', user.id).maybeSingle();
  const profile = profileData as { operator_id: string | null; role: string | null; assigned_machine_ids: string[] | null } | null;

  if (!profile?.operator_id) {
    redirect('/dashboard');
  }

  const isDriver = profile.role === 'driver';
  const assignedMachineIds = isDriver ? profile.assigned_machine_ids ?? [] : null;

  let machinesQuery = db
    .from('machines')
    .select('*')
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
  const machines = (machinesData as MachineListItem[] | null) ?? [];

  const metrics = await getTodayMetrics(profile.operator_id, assignedMachineIds);

  const machinesWithRevenue: MachineListItem[] = machines.map((machine) => ({
    ...machine,
    todayRevenue: Number(metrics.revenueByMachine[machine.id] ?? 0),
  }));

  return <MachineRegistryClient machines={machinesWithRevenue} />;
}
