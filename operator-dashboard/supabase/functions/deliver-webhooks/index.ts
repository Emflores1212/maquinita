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

function asString(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function truncate(value: string, max = 4000) {
  if (value.length <= max) return value;
  return `${value.slice(0, max)}…`;
}

function computeNextRetryAt(nextAttempt: number) {
  const retryMinutes = [1, 5, 15];
  const offset = retryMinutes[nextAttempt - 2];
  if (!offset) return null;
  return new Date(Date.now() + offset * 60 * 1000).toISOString();
}

async function hmacSha256Hex(secret: string, payload: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return Array.from(new Uint8Array(signature))
    .map((entry) => entry.toString(16).padStart(2, '0'))
    .join('');
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = 10_000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function markSubscriptionFailed(supabase: any, subscription: { id: string; operator_id: string; url: string }) {
  await supabase.from('webhook_subscriptions').update({ is_active: false }).eq('id', subscription.id);

  await supabase.from('alerts').insert({
    operator_id: subscription.operator_id,
    machine_id: null,
    type: 'WEBHOOK_FAILED',
    severity: 'warning',
    message: `Webhook subscription disabled after repeated failures: ${subscription.url}`,
  });

  await supabase.from('audit_log').insert({
    operator_id: subscription.operator_id,
    user_id: null,
    action: 'webhook.subscription.disabled_after_failures',
    entity_type: 'webhook_subscriptions',
    entity_id: subscription.id,
    payload: {
      url: subscription.url,
    },
  });
}

async function deliverToSubscription(params: {
  supabase: any;
  subscription: { id: string; operator_id: string; url: string; secret: string; is_active: boolean };
  payload: Record<string, unknown>;
  existingDelivery?: {
    id: string;
    attempt_count: number;
  } | null;
}) {
  const payloadJson = JSON.stringify(params.payload);
  const signature = await hmacSha256Hex(params.subscription.secret, payloadJson);
  const eventName = asString(params.payload.event) || 'unknown';
  const nextAttempt = params.existingDelivery ? Number(params.existingDelivery.attempt_count ?? 1) + 1 : 1;

  let statusCode = 0;
  let responseBody = '';
  let success = false;

  try {
    const response = await fetchWithTimeout(params.subscription.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Maquinita-Event': eventName,
        'X-Maquinita-Signature': signature,
      },
      body: payloadJson,
    });

    statusCode = response.status;
    responseBody = truncate(await response.text().catch(() => ''));
    success = response.ok;
  } catch (error) {
    statusCode = 0;
    responseBody = truncate(error instanceof Error ? error.message : 'Webhook delivery failed');
    success = false;
  }

  const nextRetryAt = success ? null : computeNextRetryAt(nextAttempt);

  if (params.existingDelivery?.id) {
    await params.supabase
      .from('webhook_deliveries')
      .update({
        status: statusCode,
        response_body: responseBody,
        attempt_count: nextAttempt,
        next_retry_at: nextRetryAt,
      })
      .eq('id', params.existingDelivery.id)
      .eq('subscription_id', params.subscription.id);
  } else {
    await params.supabase.from('webhook_deliveries').insert({
      subscription_id: params.subscription.id,
      event: eventName,
      payload: params.payload,
      status: statusCode,
      response_body: responseBody,
      attempt_count: 1,
      next_retry_at: nextRetryAt,
    });
  }

  const maxAttempts = 4;
  if (!success && nextAttempt >= maxAttempts) {
    await markSubscriptionFailed(params.supabase, params.subscription);
    if (params.existingDelivery?.id) {
      await params.supabase
        .from('webhook_deliveries')
        .update({
          next_retry_at: null,
        })
        .eq('id', params.existingDelivery.id)
        .eq('subscription_id', params.subscription.id);
    }
  }

  return {
    success,
    status: statusCode,
    attempt: nextAttempt,
  };
}

async function dispatchEvent(params: {
  supabase: any;
  event: string;
  operatorId: string;
  machineId: string | null;
  timestamp: string;
  data: Record<string, unknown>;
}) {
  const { data: subscriptionsData, error: subscriptionsError } = await params.supabase
    .from('webhook_subscriptions')
    .select('id, operator_id, url, events, secret, is_active')
    .eq('operator_id', params.operatorId)
    .eq('is_active', true)
    .contains('events', [params.event]);

  if (subscriptionsError) {
    throw new Error(subscriptionsError.message);
  }

  const subscriptions =
    ((subscriptionsData as Array<{
      id: string;
      operator_id: string;
      url: string;
      events: string[];
      secret: string;
      is_active: boolean;
    }> | null) ?? []);

  if (subscriptions.length === 0) {
    return { delivered: 0, total: 0 };
  }

  const payload = {
    event: params.event,
    timestamp: params.timestamp,
    operatorId: params.operatorId,
    machineId: params.machineId,
    data: params.data ?? {},
  };

  let delivered = 0;
  for (const subscription of subscriptions) {
    const result = await deliverToSubscription({
      supabase: params.supabase,
      subscription,
      payload,
    });
    if (result.success) delivered += 1;
  }

  return { delivered, total: subscriptions.length };
}

async function processDeliveryRetry(params: {
  supabase: any;
  deliveryId: string;
}) {
  const { data: deliveryData, error: deliveryError } = await params.supabase
    .from('webhook_deliveries')
    .select('id, subscription_id, event, payload, attempt_count, next_retry_at')
    .eq('id', params.deliveryId)
    .maybeSingle();

  if (deliveryError || !deliveryData?.id || !deliveryData.subscription_id) {
    return { processed: 0, delivered: 0, skipped: 1 };
  }

  const { data: subscriptionData } = await params.supabase
    .from('webhook_subscriptions')
    .select('id, operator_id, url, secret, is_active')
    .eq('id', deliveryData.subscription_id)
    .maybeSingle();

  const subscription = subscriptionData as
    | { id: string; operator_id: string; url: string; secret: string; is_active: boolean }
    | null;

  if (!subscription?.id || !subscription.is_active) {
    return { processed: 0, delivered: 0, skipped: 1 };
  }

  const payload = (deliveryData.payload as Record<string, unknown> | null) ?? {
    event: deliveryData.event ?? 'unknown',
    timestamp: new Date().toISOString(),
    operatorId: subscription.operator_id,
    machineId: null,
    data: {},
  };

  const result = await deliverToSubscription({
    supabase: params.supabase,
    subscription,
    payload,
    existingDelivery: {
      id: deliveryData.id,
      attempt_count: Number(deliveryData.attempt_count ?? 1),
    },
  });

  return {
    processed: 1,
    delivered: result.success ? 1 : 0,
    skipped: 0,
  };
}

async function processRetryQueue(params: {
  supabase: any;
}) {
  const nowIso = new Date().toISOString();
  const { data: deliveryRows, error: deliveryError } = await params.supabase
    .from('webhook_deliveries')
    .select('id')
    .not('next_retry_at', 'is', null)
    .lte('next_retry_at', nowIso)
    .order('next_retry_at', { ascending: true })
    .limit(50);

  if (deliveryError) {
    throw new Error(deliveryError.message);
  }

  let processed = 0;
  let delivered = 0;
  let skipped = 0;
  for (const row of (deliveryRows as Array<{ id: string }> | null) ?? []) {
    const result = await processDeliveryRetry({
      supabase: params.supabase,
      deliveryId: row.id,
    });
    processed += result.processed;
    delivered += result.delivered;
    skipped += result.skipped;
  }

  return { processed, delivered, skipped };
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
    return json({ ok: false, error: 'Missing Supabase service credentials' }, 500);
  }

  const expectedAuth = Deno.env.get('DELIVER_WEBHOOKS_AUTH');
  if (expectedAuth) {
    const receivedAuth = req.headers.get('authorization') ?? req.headers.get('Authorization');
    if (receivedAuth !== expectedAuth) {
      return json({ ok: false, error: 'Unauthorized' }, 401);
    }
  }

  const payload = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const deliveryId = asString(payload.delivery_id).trim();
  if (deliveryId) {
    const result = await processDeliveryRetry({ supabase, deliveryId });
    return json({ ok: true, mode: 'single-retry', ...result });
  }

  const source = asString(payload.source).trim();
  if (source === 'cron-retries') {
    const result = await processRetryQueue({ supabase });
    return json({ ok: true, mode: 'retry-queue', ...result });
  }

  const event = asString(payload.event).trim();
  const operatorId = asString(payload.operator_id).trim();
  if (!event || !operatorId) {
    return json({ ok: false, error: 'Missing event/operator_id payload' }, 400);
  }

  const machineId = asString(payload.machine_id).trim() || null;
  const timestamp = asString(payload.timestamp).trim() || new Date().toISOString();
  const data = (payload.data && typeof payload.data === 'object' && !Array.isArray(payload.data)
    ? payload.data
    : {}) as Record<string, unknown>;

  const result = await dispatchEvent({
    supabase,
    event,
    operatorId,
    machineId,
    timestamp,
    data,
  });

  return json({
    ok: true,
    mode: 'event-dispatch',
    event,
    operator_id: operatorId,
    machine_id: machineId,
    delivered: result.delivered,
    total: result.total,
  });
});
