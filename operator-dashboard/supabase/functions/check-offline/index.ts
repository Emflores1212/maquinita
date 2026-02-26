// @ts-nocheck
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    },
  });
}

function minutesBetween(from: Date, to: Date) {
  return (to.getTime() - from.getTime()) / 60000;
}

async function getDelayMinutes(supabase: any, machineId: string) {
  const { data } = await supabase
    .from('machine_alert_preferences')
    .select('delay_minutes')
    .eq('machine_id', machineId)
    .eq('alert_type', 'OFFLINE')
    .order('delay_minutes', { ascending: true })
    .limit(1)
    .maybeSingle();

  const delay = Number(data?.delay_minutes ?? 0);
  return Number.isFinite(delay) && delay > 0 ? Math.floor(delay) : 0;
}

async function getOrCreateConditionStart(supabase: any, machine: { operator_id: string; id: string }) {
  const { data: existing } = await supabase
    .from('machine_alert_conditions')
    .select('condition_started_at')
    .eq('operator_id', machine.operator_id)
    .eq('machine_id', machine.id)
    .eq('alert_type', 'OFFLINE')
    .maybeSingle();

  if (existing?.condition_started_at) {
    await supabase
      .from('machine_alert_conditions')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('operator_id', machine.operator_id)
      .eq('machine_id', machine.id)
      .eq('alert_type', 'OFFLINE');

    return new Date(existing.condition_started_at);
  }

  const nowIso = new Date().toISOString();
  await supabase.from('machine_alert_conditions').insert({
    operator_id: machine.operator_id,
    machine_id: machine.id,
    alert_type: 'OFFLINE',
    condition_started_at: nowIso,
    last_seen_at: nowIso,
  });

  return new Date(nowIso);
}

async function ensureOfflineAlert(supabase: any, machine: { operator_id: string; id: string; name: string | null }) {
  const { data: existing } = await supabase
    .from('alerts')
    .select('id')
    .eq('operator_id', machine.operator_id)
    .eq('machine_id', machine.id)
    .eq('type', 'OFFLINE')
    .is('resolved_at', null)
    .maybeSingle();

  if (existing?.id) {
    return { created: false };
  }

  const { error } = await supabase.from('alerts').insert({
    operator_id: machine.operator_id,
    machine_id: machine.id,
    type: 'OFFLINE',
    severity: 'critical',
    message: `${machine.name ?? 'Machine'} missed heartbeat for over 20 minutes.`,
  });

  return { created: !error };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceRoleKey) {
    return json({ ok: false, error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' }, 500);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const now = new Date();
  const cutoff = new Date(now.getTime() - 20 * 60 * 1000).toISOString();

  const { data: machineRows, error: machineError } = await supabase
    .from('machines')
    .select('id, operator_id, name, status, last_seen_at')
    .lt('last_seen_at', cutoff)
    .not('status', 'in', '(offline,archived)');

  if (machineError) {
    return json({ ok: false, error: machineError.message }, 500);
  }

  const machines = machineRows ?? [];
  let evaluated = 0;
  let markedOffline = 0;
  let alertsCreated = 0;

  for (const machine of machines) {
    evaluated += 1;

    const delayMinutes = await getDelayMinutes(supabase, machine.id);
    const conditionStart = await getOrCreateConditionStart(supabase, machine);

    if (delayMinutes > 0 && minutesBetween(conditionStart, now) < delayMinutes) {
      continue;
    }

    const { error: updateError } = await supabase
      .from('machines')
      .update({ status: 'offline' })
      .eq('id', machine.id)
      .eq('operator_id', machine.operator_id);

    if (updateError) {
      continue;
    }

    markedOffline += 1;

    const result = await ensureOfflineAlert(supabase, machine);
    if (result.created) {
      alertsCreated += 1;
    }
  }

  return json({
    ok: true,
    evaluated,
    markedOffline,
    alertsCreated,
    schedule: 'Use pg_cron every 15 minutes to invoke this function endpoint.',
  });
});
