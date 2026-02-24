import { redirect } from 'next/navigation';
import FleetHealthRealtime from '@/components/dashboard/FleetHealthRealtime';
import CriticalAlertsWidget from '@/components/dashboard/CriticalAlertsWidget';
import MachineCardsGrid from '@/components/dashboard/MachineCardsGrid';
import TodaysMetricsPanel from '@/components/dashboard/TodaysMetricsPanel';
import { createServerClient } from '@/lib/supabase';
import { getTodayMetrics } from '@/lib/dashboard';

type MachineRow = {
  id: string;
  operator_id: string;
  name: string;
  location_name: string | null;
  status: string | null;
  temperature: number | null;
  settings: { tempThreshold?: number } | null;
};

type AlertRow = {
  id: string;
  operator_id: string;
  machine_id: string | null;
  type: string;
  message: string | null;
  created_at: string | null;
  resolved_at: string | null;
};

function machinePriority(machine: MachineRow, hasAlert: boolean) {
  if (hasAlert) return 0;
  const status = (machine.status ?? '').toLowerCase();
  if (status.includes('error') || status.includes('warning') || status === 'offline') return 1;
  return 2;
}

export default async function DashboardHomePage() {
  const supabase = createServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login?returnUrl=/dashboard');
  }

  const { data: profileData } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
  const profile = profileData as { operator_id: string | null; role: string | null; assigned_machine_ids: string[] | null } | null;

  if (!profile?.operator_id) {
    redirect('/login');
  }

  const isDriver = profile.role === 'driver';
  const assignedMachineIds = isDriver ? profile.assigned_machine_ids ?? [] : null;

  let machinesQuery = supabase.from('machines').select('*').eq('operator_id', profile.operator_id).order('name', { ascending: true });

  if (isDriver) {
    const driverMachineIds = assignedMachineIds ?? [];
    if (driverMachineIds.length === 0) {
      machinesQuery = machinesQuery.in('id', ['00000000-0000-0000-0000-000000000000']);
    } else {
      machinesQuery = machinesQuery.in('id', driverMachineIds);
    }
  }

  const { data: machinesData } = await machinesQuery;
  const machines = (machinesData as MachineRow[] | null) ?? [];

  let alertsQuery = supabase
    .from('alerts')
    .select('*')
    .eq('operator_id', profile.operator_id)
    .is('resolved_at', null)
    .order('created_at', { ascending: false });

  if (isDriver) {
    const driverMachineIds = assignedMachineIds ?? [];
    if (driverMachineIds.length === 0) {
      alertsQuery = alertsQuery.in('machine_id', ['00000000-0000-0000-0000-000000000000']);
    } else {
      alertsQuery = alertsQuery.in('machine_id', driverMachineIds);
    }
  }

  const { data: alertsData } = await alertsQuery;
  const alerts = (alertsData as AlertRow[] | null) ?? [];

  const machineNameById = Object.fromEntries(machines.map((machine) => [machine.id, machine.name]));

  const metrics = await getTodayMetrics(profile.operator_id, assignedMachineIds);

  const alertsWithMachineName = alerts.map((alert) => ({
    ...alert,
    machine_name: alert.machine_id ? machineNameById[alert.machine_id] ?? alert.machine_id : '-',
  }));

  const alertMachineIds = new Set(alerts.filter((alert) => alert.machine_id).map((alert) => alert.machine_id as string));

  const sortedMachines = [...machines]
    .sort((a, b) => {
      const priorityDiff = machinePriority(a, alertMachineIds.has(a.id)) - machinePriority(b, alertMachineIds.has(b.id));
      if (priorityDiff !== 0) return priorityDiff;
      return a.name.localeCompare(b.name);
    })
    .map((machine) => ({
      id: machine.id,
      name: machine.name,
      location: machine.location_name,
      status: machine.status,
      temperature: machine.temperature,
      todayRevenue: Number(metrics.revenueByMachine[machine.id] ?? 0),
    }));

  return (
    <div className="space-y-6">
      <FleetHealthRealtime operatorId={profile.operator_id} initialMachines={machines} />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <CriticalAlertsWidget operatorId={profile.operator_id} initialAlerts={alertsWithMachineName} />
        </div>

        <TodaysMetricsPanel
          revenue={metrics.revenue}
          transactionCount={metrics.transactionCount}
          itemsSold={metrics.itemsSold}
        />
      </div>

      <MachineCardsGrid machines={sortedMachines} />
    </div>
  );
}
