import type { Database } from '@/lib/types';

export type AlertType = 'OFFLINE' | 'TOO_WARM' | 'RFID_ERROR' | 'LOW_STOCK' | 'OFFLINE_SYNC' | 'EXPIRING_SOON';

export type AlertSeverity = 'info' | 'warning' | 'critical' | 'error';

type AdminDb = any;

type AlertRow = Database['public']['Tables']['alerts']['Row'];

type CreateAlertInput = {
  adminDb: AdminDb;
  operatorId: string;
  machineId: string | null;
  type: AlertType;
  severity?: AlertSeverity;
  message?: string | null;
  respectDelay?: boolean;
};

function minutesBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / 60000;
}

export async function getEffectiveAlertDelayMinutes(adminDb: AdminDb, machineId: string, alertType: AlertType): Promise<number> {
  const { data } = await adminDb
    .from('machine_alert_preferences')
    .select('delay_minutes')
    .eq('machine_id', machineId)
    .eq('alert_type', alertType)
    .order('delay_minutes', { ascending: true })
    .limit(1)
    .maybeSingle();

  const delay = Number((data as { delay_minutes?: number | null } | null)?.delay_minutes ?? 0);
  return Number.isFinite(delay) && delay > 0 ? Math.floor(delay) : 0;
}

async function getOrCreateConditionStart(adminDb: AdminDb, operatorId: string, machineId: string, alertType: AlertType): Promise<Date> {
  const { data: existingData } = await adminDb
    .from('machine_alert_conditions')
    .select('condition_started_at')
    .eq('operator_id', operatorId)
    .eq('machine_id', machineId)
    .eq('alert_type', alertType)
    .maybeSingle();

  const existing = existingData as { condition_started_at: string } | null;

  if (existing?.condition_started_at) {
    await adminDb
      .from('machine_alert_conditions')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('operator_id', operatorId)
      .eq('machine_id', machineId)
      .eq('alert_type', alertType);

    return new Date(existing.condition_started_at);
  }

  const nowIso = new Date().toISOString();
  await adminDb.from('machine_alert_conditions').insert({
    operator_id: operatorId,
    machine_id: machineId,
    alert_type: alertType,
    condition_started_at: nowIso,
    last_seen_at: nowIso,
  });

  return new Date(nowIso);
}

export async function clearCondition(adminDb: AdminDb, operatorId: string, machineId: string, alertType: AlertType) {
  await adminDb
    .from('machine_alert_conditions')
    .delete()
    .eq('operator_id', operatorId)
    .eq('machine_id', machineId)
    .eq('alert_type', alertType);
}

export async function canEmitAlert(adminDb: AdminDb, operatorId: string, machineId: string, alertType: AlertType): Promise<boolean> {
  const delayMinutes = await getEffectiveAlertDelayMinutes(adminDb, machineId, alertType);
  const conditionStart = await getOrCreateConditionStart(adminDb, operatorId, machineId, alertType);

  if (delayMinutes <= 0) {
    return true;
  }

  return minutesBetween(conditionStart, new Date()) >= delayMinutes;
}

export async function createAlert({
  adminDb,
  operatorId,
  machineId,
  type,
  severity = 'warning',
  message = null,
  respectDelay = true,
}: CreateAlertInput): Promise<{ created: boolean; alert: AlertRow | null }> {
  if (machineId && respectDelay) {
    const ready = await canEmitAlert(adminDb, operatorId, machineId, type);
    if (!ready) {
      return { created: false, alert: null };
    }
  }

  const query = adminDb
    .from('alerts')
    .select('*')
    .eq('operator_id', operatorId)
    .eq('type', type)
    .is('resolved_at', null)
    .order('created_at', { ascending: false })
    .limit(1);

  if (machineId) {
    query.eq('machine_id', machineId);
  } else {
    query.is('machine_id', null);
  }

  const { data: existingData } = await query.maybeSingle();
  const existing = (existingData as AlertRow | null) ?? null;

  if (existing) {
    return { created: false, alert: existing };
  }

  const { data: insertedData } = await adminDb
    .from('alerts')
    .insert({
      operator_id: operatorId,
      machine_id: machineId,
      type,
      severity,
      message,
    })
    .select('*')
    .maybeSingle();

  return { created: true, alert: (insertedData as AlertRow | null) ?? null };
}

export async function resolveOpenAlert(
  adminDb: AdminDb,
  operatorId: string,
  machineId: string,
  alertType: AlertType,
  resolvedBy?: string | null
) {
  const payload: Record<string, unknown> = {
    resolved_at: new Date().toISOString(),
  };

  if (resolvedBy) {
    payload.resolved_by = resolvedBy;
  }

  await adminDb
    .from('alerts')
    .update(payload)
    .eq('operator_id', operatorId)
    .eq('machine_id', machineId)
    .eq('type', alertType)
    .is('resolved_at', null);

  await clearCondition(adminDb, operatorId, machineId, alertType);
}

export async function resolveAlertTypes(
  adminDb: AdminDb,
  operatorId: string,
  machineId: string,
  alertTypes: AlertType[],
  resolvedBy?: string | null
) {
  if (alertTypes.length === 0) return;

  const payload: Record<string, unknown> = {
    resolved_at: new Date().toISOString(),
  };

  if (resolvedBy) {
    payload.resolved_by = resolvedBy;
  }

  await adminDb
    .from('alerts')
    .update(payload)
    .eq('operator_id', operatorId)
    .eq('machine_id', machineId)
    .in('type', alertTypes)
    .is('resolved_at', null);

  await Promise.all(alertTypes.map((type) => clearCondition(adminDb, operatorId, machineId, type)));
}
