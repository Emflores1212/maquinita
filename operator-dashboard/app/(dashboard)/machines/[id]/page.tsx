import { redirect } from 'next/navigation';
import MachineDetailTabs from '@/components/machines/MachineDetailTabs';
import type { DriverProfile, MachineAlert, MachineDetailData } from '@/components/machines/types';
import { createServerClient } from '@/lib/supabase';
import { getTodayMetrics } from '@/lib/dashboard';

export default async function MachineDetailPage({ params }: { params: { id: string } }) {
  const supabase = createServerClient();
  const db = supabase as any;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?returnUrl=/machines/${params.id}`);
  }

  const { data: profileData } = await db.from('profiles').select('operator_id, role, assigned_machine_ids').eq('id', user.id).maybeSingle();
  const profile = profileData as { operator_id: string | null; role: string | null; assigned_machine_ids: string[] | null } | null;

  if (!profile?.operator_id) {
    redirect('/machines');
  }

  const { data: machineData } = await db
    .from('machines')
    .select('*')
    .eq('id', params.id)
    .eq('operator_id', profile.operator_id)
    .maybeSingle();

  if (!machineData) {
    redirect('/machines');
  }

  if (profile.role === 'driver') {
    const assigned = profile.assigned_machine_ids ?? [];
    if (!assigned.includes(params.id)) {
      redirect('/machines');
    }
  }

  const machine = machineData as MachineDetailData;

  const { data: alertsData } = await db
    .from('alerts')
    .select('*')
    .eq('operator_id', profile.operator_id)
    .eq('machine_id', params.id)
    .order('created_at', { ascending: false })
    .limit(8);

  const recentAlerts = (alertsData as MachineAlert[] | null) ?? [];

  const metricsData = await getTodayMetrics(profile.operator_id, [params.id]);
  const metrics = {
    revenue: Number(metricsData.revenueByMachine[params.id] ?? 0),
    transactionCount: metricsData.transactionCount,
    itemsSold: metricsData.itemsSold,
  };

  const { data: driversData } = await db
    .from('profiles')
    .select('id, full_name, assigned_machine_ids')
    .eq('operator_id', profile.operator_id)
    .eq('role', 'driver')
    .order('full_name', { ascending: true });

  const drivers = (driversData as DriverProfile[] | null) ?? [];

  return <MachineDetailTabs machine={machine} metrics={metrics} recentAlerts={recentAlerts} drivers={drivers} />;
}
