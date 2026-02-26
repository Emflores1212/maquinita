import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import webpush from 'npm:web-push@3.6.7';
import { requireEnv } from '../_shared/env.ts';
import { corsHeaders, json } from '../_shared/http.ts';

function dedupe(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function asArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown) {
  return typeof value === 'string' ? value : '';
}

async function resolveTargetConsumerIds(supabase: any, payload: {
  operatorId: string;
  target: Record<string, unknown>;
}) {
  const type = asString(payload.target.type) || 'all';

  if (type === 'consumer_ids') {
    return dedupe(asArray(payload.target.consumerIds).map((entry) => asString(entry)).filter(Boolean));
  }

  if (type === 'machine') {
    const machineId = asString(payload.target.machineId);
    if (!machineId) return [];

    const { data: txRows } = await supabase
      .from('transactions')
      .select('customer_phone')
      .eq('operator_id', payload.operatorId)
      .eq('machine_id', machineId)
      .in('status', ['completed', 'refunded'])
      .not('customer_phone', 'is', null)
      .limit(5000);

    const phones = dedupe(((txRows ?? []) as Array<{ customer_phone?: string | null }>).map((row) => asString(row.customer_phone).trim()));
    if (phones.length === 0) return [];

    const { data: consumers } = await supabase
      .from('consumer_profiles')
      .select('id')
      .eq('operator_id', payload.operatorId)
      .in('phone', phones);

    return dedupe(((consumers ?? []) as Array<{ id?: string }>).map((row) => asString(row.id)));
  }

  if (type === 'inactive_7d') {
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: activeTxRows } = await supabase
      .from('transactions')
      .select('customer_phone')
      .eq('operator_id', payload.operatorId)
      .in('status', ['completed', 'refunded'])
      .gte('created_at', cutoff)
      .not('customer_phone', 'is', null)
      .limit(5000);

    const recentPhones = new Set(
      dedupe(((activeTxRows ?? []) as Array<{ customer_phone?: string | null }>).map((row) => asString(row.customer_phone).trim()))
    );

    const { data: consumerRows } = await supabase.from('consumer_profiles').select('id, phone').eq('operator_id', payload.operatorId);
    return dedupe(
      ((consumerRows ?? []) as Array<{ id?: string; phone?: string | null }>)
        .filter((row) => !recentPhones.has(asString(row.phone).trim()))
        .map((row) => asString(row.id))
    );
  }

  if (type === 'custom_sql') {
    const whereSql = asString(payload.target.customSql).trim();
    if (!whereSql) return [];

    const { data } = await supabase.rpc('resolve_consumer_ids_for_custom_segment', {
      p_operator_id: payload.operatorId,
      p_where_sql: whereSql,
    });

    return dedupe(((data ?? []) as Array<{ consumer_id?: string }>).map((row) => asString(row.consumer_id)));
  }

  const { data: consumersData } = await supabase
    .from('consumer_profiles')
    .select('id')
    .eq('operator_id', payload.operatorId)
    .limit(5000);
  return dedupe(((consumersData ?? []) as Array<{ id?: string }>).map((row) => asString(row.id)));
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  let supabaseUrl = '';
  let serviceRoleKey = '';
  try {
    supabaseUrl = requireEnv('SUPABASE_URL');
    serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : 'Missing service credentials' }, 500);
  }

  const vapidPublicKey = Deno.env.get('NEXT_PUBLIC_VAPID_PUBLIC_KEY');
  const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY');
  const vapidSubject = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:alerts@maquinita.app';
  if (!vapidPublicKey || !vapidPrivateKey) {
    return json({ ok: false, error: 'Missing VAPID keys' }, 500);
  }

  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const payload = await req.json().catch(() => ({}));
  const notificationId = asString(payload?.notification_id).trim();
  const nowIso = new Date().toISOString();

  let query = supabase
    .from('notification_sends')
    .select('id, operator_id, title, body, target, deep_link_url, sent_at, scheduled_for, created_at')
    .is('sent_at', null)
    .order('created_at', { ascending: true })
    .limit(100);

  if (notificationId) {
    query = query.eq('id', notificationId);
  }

  const { data: sendRows, error: sendError } = await query;
  if (sendError) {
    return json({ ok: false, error: sendError.message }, 500);
  }

  const rawRows = (sendRows ?? []) as Array<{
    id: string;
    operator_id: string;
    title: string;
    body: string;
    target: Record<string, unknown> | null;
    deep_link_url: string | null;
    sent_at: string | null;
    scheduled_for: string | null;
    created_at: string | null;
  }>;

  const rows = rawRows.filter((row) => {
    if (notificationId && row.id !== notificationId) {
      return false;
    }
    if (!row.scheduled_for) {
      return true;
    }
    const scheduledAt = new Date(row.scheduled_for).getTime();
    if (Number.isNaN(scheduledAt)) {
      return true;
    }
    return scheduledAt <= Date.now();
  });

  if (rows.length === 0) {
    return json({ ok: true, processed: 0, sentTotal: 0 });
  }

  let processed = 0;
  let sentTotal = 0;

  for (const row of rows) {
    const target = (row.target ?? {}) as Record<string, unknown>;
    const consumerIds = await resolveTargetConsumerIds(supabase, {
      operatorId: row.operator_id,
      target,
    });

    if (consumerIds.length === 0) {
      await supabase
        .from('notification_sends')
        .update({
          sent_count: 0,
          sent_at: new Date().toISOString(),
        })
        .eq('id', row.id)
        .eq('operator_id', row.operator_id);
      processed += 1;
      continue;
    }

    const { data: pushRows } = await supabase
      .from('push_subscriptions')
      .select('id, user_id, subscription')
      .eq('operator_id', row.operator_id)
      .in('user_id', consumerIds);

    const { data: operatorData } = await supabase
      .from('operators')
      .select('slug')
      .eq('id', row.operator_id)
      .maybeSingle();

    const operatorSlug = asString((operatorData as { slug?: string | null } | null)?.slug);
    const deepLinkUrl = row.deep_link_url || (operatorSlug ? `/${operatorSlug}` : '/');

    let sentCount = 0;
    for (const sub of (pushRows ?? []) as Array<{ id: string; user_id: string; subscription: unknown }>) {
      try {
        await webpush.sendNotification(
          sub.subscription,
          JSON.stringify({
            title: row.title,
            body: row.body,
            url: deepLinkUrl,
          })
        );
        sentCount += 1;
      } catch {
        // Ignore individual push errors; continue best-effort fanout.
      }
    }

    await supabase
      .from('notification_sends')
      .update({
        sent_count: sentCount,
        sent_at: new Date().toISOString(),
      })
      .eq('id', row.id)
      .eq('operator_id', row.operator_id);

    sentTotal += sentCount;
    processed += 1;
  }

  return json({
    ok: true,
    processed,
    sentTotal,
  });
});
