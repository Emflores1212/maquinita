import { redirect } from 'next/navigation';
import MachineDetailTabs from '@/components/machines/MachineDetailTabs';
import type {
  DriverProfile,
  MachineAlert,
  MachineAlertPreference,
  MachineCommandHistoryItem,
  MachineDetailData,
  TeamMemberProfile,
  TemperatureReadingPoint,
} from '@/components/machines/types';
import { createServerClient } from '@/lib/supabase';
import { getTodayMetrics } from '@/lib/dashboard';

export default async function MachineDetailPage({ params }: { params: { id: string } }) {
  const supabase = createServerClient();
  const db = supabase;

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
    .limit(200);

  const alerts = (alertsData as MachineAlert[] | null) ?? [];
  const recentAlerts = alerts.slice(0, 8);
  const activeAlerts = alerts.filter((alert) => !alert.resolved_at);
  const alertHistory = alerts.filter((alert) => Boolean(alert.resolved_at)).slice(0, 100);

  const resolverIds = Array.from(new Set(alertHistory.map((alert) => alert.resolved_by).filter(Boolean))) as string[];
  const { data: resolverData } =
    resolverIds.length > 0
      ? await db.from('profiles').select('id, full_name').in('id', resolverIds)
      : { data: [] as Array<{ id: string; full_name: string | null }> };

  const resolverNames = Object.fromEntries(
    (((resolverData as Array<{ id: string; full_name: string | null }> | null) ?? []).map((row) => [row.id, row.full_name ?? row.id]))
  ) as Record<string, string>;

  const sinceIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: tempData } = await db
    .from('temperature_readings')
    .select('id, temperature, recorded_at')
    .eq('operator_id', profile.operator_id)
    .eq('machine_id', params.id)
    .gte('recorded_at', sinceIso)
    .order('recorded_at', { ascending: true })
    .limit(500);

  const temperatureReadings = (tempData as TemperatureReadingPoint[] | null) ?? [];

  const metricsData = await getTodayMetrics(profile.operator_id, [params.id]);
  const metrics = {
    revenue: Number(metricsData.revenueByMachine[params.id] ?? 0),
    transactionCount: metricsData.transactionCount,
    itemsSold: metricsData.itemsSold,
  };

  const { data: teamMembersData } = await db
    .from('profiles')
    .select('id, full_name, role, assigned_machine_ids')
    .eq('operator_id', profile.operator_id)
    .order('full_name', { ascending: true });

  const teamMembers = (teamMembersData as TeamMemberProfile[] | null) ?? [];
  const drivers = teamMembers.filter((member) => member.role === 'driver') as DriverProfile[];

  const { data: preferencesData } = await db
    .from('machine_alert_preferences')
    .select('id, machine_id, user_id, alert_type, email_enabled, sms_enabled, push_enabled, delay_minutes')
    .eq('operator_id', profile.operator_id)
    .eq('machine_id', params.id);

  const alertPreferences = (preferencesData as MachineAlertPreference[] | null) ?? [];

  const { data: commandData } = await db
    .from('machine_commands')
    .select('id, machine_id, issued_by, type, status, issued_at, acknowledged_at, executed_at, error_message, payload')
    .eq('operator_id', profile.operator_id)
    .eq('machine_id', params.id)
    .order('issued_at', { ascending: false })
    .limit(20);

  const commands = (commandData as MachineCommandHistoryItem[] | null) ?? [];
  const issuerIds = Array.from(new Set(commands.map((command) => command.issued_by).filter(Boolean))) as string[];
  const { data: issuerData } =
    issuerIds.length > 0
      ? await db.from('profiles').select('id, full_name').in('id', issuerIds)
      : { data: [] as Array<{ id: string; full_name: string | null }> };

  const issuerNames = Object.fromEntries(
    (((issuerData as Array<{ id: string; full_name: string | null }> | null) ?? []).map((row) => [row.id, row.full_name ?? row.id]))
  ) as Record<string, string>;

  const commandHistory = commands.map((command) => ({
    ...command,
    payload: (command.payload as Record<string, unknown> | null) ?? null,
    issued_by_name: command.issued_by ? issuerNames[command.issued_by] ?? command.issued_by : null,
  }));

  const { data: operatorData } = await db.from('operators').select('branding').eq('id', profile.operator_id).maybeSingle();
  const operatorBranding = (operatorData as { branding?: Record<string, unknown> | null } | null)?.branding ?? {};
  const supportEmail = typeof operatorBranding.receiptSupportEmail === 'string' ? operatorBranding.receiptSupportEmail : null;

  return (
    <MachineDetailTabs
      machine={machine}
      metrics={metrics}
      recentAlerts={recentAlerts}
      activeAlerts={activeAlerts}
      alertHistory={alertHistory}
      resolverNames={resolverNames}
      temperatureReadings={temperatureReadings}
      drivers={drivers}
      teamMembers={teamMembers}
      alertPreferences={alertPreferences}
      commandHistory={commandHistory}
      supportEmail={supportEmail}
    />
  );
}
