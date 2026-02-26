'use server';

import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { hasPermission, type UserRole } from '@/lib/permissions';
import { createAdminClient, createServerClient } from '@/lib/supabase';

type ActionResult = {
  ok: boolean;
  error?: string;
  id?: string;
};

const apiPermissionSchema = z.enum(['read', 'commands', 'full']);

const generateApiKeySchema = z.object({
  name: z.string().trim().min(1).max(120),
  permission: apiPermissionSchema.default('read'),
});

const revokeApiKeySchema = z.object({
  keyId: z.string().uuid(),
});

const createWebhookSchema = z.object({
  url: z.string().url(),
  events: z.array(z.string().trim().min(1)).min(1),
});

const updateWebhookSchema = z.object({
  subscriptionId: z.string().uuid(),
  isActive: z.boolean(),
});

const testWebhookSchema = z.object({
  subscriptionId: z.string().uuid(),
});

const retryDeliverySchema = z.object({
  deliveryId: z.string().uuid(),
});

type Context =
  | { ok: false; error: string }
  | {
      ok: true;
      userId: string;
      operatorId: string;
      role: UserRole | null;
    };

async function getContext(): Promise<Context> {
  const supabase = createServerClient();
  const db = supabase;
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false, error: 'Not authenticated' };

  const { data: profileData } = await db.from('profiles').select('operator_id, role').eq('id', user.id).maybeSingle();
  const profile = profileData as { operator_id: string | null; role: UserRole | null } | null;

  if (!profile?.operator_id) return { ok: false, error: 'Invalid profile context' };

  return {
    ok: true,
    userId: user.id,
    operatorId: profile.operator_id,
    role: profile.role,
  };
}

function mapPermission(permission: z.infer<typeof apiPermissionSchema>) {
  if (permission === 'commands') return ['read', 'commands'];
  if (permission === 'full') return ['read', 'commands', 'full'];
  return ['read'];
}

function buildRawApiKey() {
  return `mq_live_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`;
}

async function callDeliverWebhooksFunction(body: Record<string, unknown>) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const deliverWebhooksAuth = process.env.DELIVER_WEBHOOKS_AUTH;
  if (!supabaseUrl || !serviceRoleKey) {
    return { ok: false, error: 'Missing function env vars' };
  }

  const response = await fetch(`${supabaseUrl}/functions/v1/deliver-webhooks`, {
    method: 'POST',
    headers: {
      Authorization: deliverWebhooksAuth || `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    cache: 'no-store',
  }).catch(() => null);

  if (!response?.ok) {
    return { ok: false, error: 'Webhook delivery function call failed' };
  }

  return { ok: true };
}

export async function generateApiKeyAction(payload: z.infer<typeof generateApiKeySchema>) {
  const parsed = generateApiKeySchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? 'Invalid payload' };
  }

  const ctx = await getContext();
  if (!ctx.ok) return { ok: false as const, error: ctx.error };
  if (!hasPermission(ctx.role, 'settings', 'w')) {
    return { ok: false as const, error: 'Permission denied' };
  }

  const adminDb = createAdminClient();
  const raw = buildRawApiKey();
  const hash = await bcrypt.hash(raw, 10);
  const permissions = mapPermission(parsed.data.permission);

  const { data, error } = await adminDb
    .from('api_keys')
    .insert({
      operator_id: ctx.operatorId,
      name: parsed.data.name,
      key_hash: hash,
      key_prefix: raw.slice(0, 16),
      permissions,
      is_active: true,
    })
    .select('id, key_prefix')
    .single();

  if (error || !data?.id) {
    return { ok: false as const, error: error?.message ?? 'Failed to create API key' };
  }

  await adminDb.from('audit_log').insert({
    operator_id: ctx.operatorId,
    user_id: ctx.userId,
    action: 'api.key.created',
    entity_type: 'api_keys',
    entity_id: data.id,
    payload: {
      name: parsed.data.name,
      permission: parsed.data.permission,
      key_prefix: data.key_prefix,
    },
  });

  revalidatePath('/settings/api');

  return {
    ok: true as const,
    id: data.id,
    rawKey: raw,
    prefix: data.key_prefix,
    permissions,
  };
}

export async function revokeApiKeyAction(payload: z.infer<typeof revokeApiKeySchema>): Promise<ActionResult> {
  const parsed = revokeApiKeySchema.safeParse(payload);
  if (!parsed.success) return { ok: false, error: 'Invalid key id' };

  const ctx = await getContext();
  if (!ctx.ok) return { ok: false, error: ctx.error };
  if (!hasPermission(ctx.role, 'settings', 'w')) return { ok: false, error: 'Permission denied' };

  const adminDb = createAdminClient();
  const { error } = await adminDb
    .from('api_keys')
    .update({ is_active: false })
    .eq('id', parsed.data.keyId)
    .eq('operator_id', ctx.operatorId);

  if (error) return { ok: false, error: error.message };

  await adminDb.from('audit_log').insert({
    operator_id: ctx.operatorId,
    user_id: ctx.userId,
    action: 'api.key.revoked',
    entity_type: 'api_keys',
    entity_id: parsed.data.keyId,
    payload: {},
  });

  revalidatePath('/settings/api');
  return { ok: true, id: parsed.data.keyId };
}

export async function createWebhookSubscriptionAction(payload: z.infer<typeof createWebhookSchema>): Promise<ActionResult> {
  const parsed = createWebhookSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid webhook payload' };

  const ctx = await getContext();
  if (!ctx.ok) return { ok: false, error: ctx.error };
  if (!hasPermission(ctx.role, 'settings', 'w')) return { ok: false, error: 'Permission denied' };

  const adminDb = createAdminClient();
  const secret = `whsec_${crypto.randomUUID().replace(/-/g, '')}`;
  const events = [...new Set(parsed.data.events.map((event) => event.trim()).filter(Boolean))];

  const { data, error } = await adminDb
    .from('webhook_subscriptions')
    .insert({
      operator_id: ctx.operatorId,
      url: parsed.data.url,
      events,
      secret,
      is_active: true,
    })
    .select('id')
    .single();

  if (error || !data?.id) return { ok: false, error: error?.message ?? 'Failed to create webhook subscription' };

  await adminDb.from('audit_log').insert({
    operator_id: ctx.operatorId,
    user_id: ctx.userId,
    action: 'webhook.subscription.created',
    entity_type: 'webhook_subscriptions',
    entity_id: data.id,
    payload: {
      url: parsed.data.url,
      events,
    },
  });

  revalidatePath('/settings/webhooks');
  return { ok: true, id: data.id };
}

export async function updateWebhookSubscriptionStatusAction(payload: z.infer<typeof updateWebhookSchema>): Promise<ActionResult> {
  const parsed = updateWebhookSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, error: 'Invalid payload' };

  const ctx = await getContext();
  if (!ctx.ok) return { ok: false, error: ctx.error };
  if (!hasPermission(ctx.role, 'settings', 'w')) return { ok: false, error: 'Permission denied' };

  const adminDb = createAdminClient();
  const { error } = await adminDb
    .from('webhook_subscriptions')
    .update({ is_active: parsed.data.isActive })
    .eq('id', parsed.data.subscriptionId)
    .eq('operator_id', ctx.operatorId);

  if (error) return { ok: false, error: error.message };

  await adminDb.from('audit_log').insert({
    operator_id: ctx.operatorId,
    user_id: ctx.userId,
    action: 'webhook.subscription.updated',
    entity_type: 'webhook_subscriptions',
    entity_id: parsed.data.subscriptionId,
    payload: {
      is_active: parsed.data.isActive,
    },
  });

  revalidatePath('/settings/webhooks');
  return { ok: true, id: parsed.data.subscriptionId };
}

export async function testWebhookSubscriptionAction(payload: z.infer<typeof testWebhookSchema>) {
  const parsed = testWebhookSchema.safeParse(payload);
  if (!parsed.success) return { ok: false as const, error: 'Invalid webhook id' };

  const ctx = await getContext();
  if (!ctx.ok) return { ok: false as const, error: ctx.error };
  if (!hasPermission(ctx.role, 'settings', 'w')) return { ok: false as const, error: 'Permission denied' };

  const adminDb = createAdminClient();
  const { data: subData } = await adminDb
    .from('webhook_subscriptions')
    .select('id, operator_id, url, events, secret, is_active')
    .eq('id', parsed.data.subscriptionId)
    .eq('operator_id', ctx.operatorId)
    .maybeSingle();

  const subscription = subData as {
    id: string;
    operator_id: string;
    url: string;
    events: string[] | null;
    secret: string;
    is_active: boolean;
  } | null;

  if (!subscription?.id) return { ok: false as const, error: 'Webhook subscription not found' };

  const event = (subscription.events ?? [])[0] ?? 'transaction.completed';
  const response = await callDeliverWebhooksFunction({
    event,
    operator_id: ctx.operatorId,
    machine_id: null,
    timestamp: new Date().toISOString(),
    data: {
      test: true,
      subscription_id: subscription.id,
      message: 'Webhook test from Maquinita',
    },
  });

  if (!response.ok) return { ok: false as const, error: response.error ?? 'Test failed' };

  await adminDb.from('audit_log').insert({
    operator_id: ctx.operatorId,
    user_id: ctx.userId,
    action: 'webhook.subscription.tested',
    entity_type: 'webhook_subscriptions',
    entity_id: subscription.id,
    payload: {
      event,
    },
  });

  revalidatePath('/settings/webhooks');
  return { ok: true as const };
}

export async function retryWebhookDeliveryAction(payload: z.infer<typeof retryDeliverySchema>): Promise<ActionResult> {
  const parsed = retryDeliverySchema.safeParse(payload);
  if (!parsed.success) return { ok: false, error: 'Invalid delivery id' };

  const ctx = await getContext();
  if (!ctx.ok) return { ok: false, error: ctx.error };
  if (!hasPermission(ctx.role, 'settings', 'w')) return { ok: false, error: 'Permission denied' };

  const adminDb = createAdminClient();
  const { data: deliveryData } = await adminDb
    .from('webhook_deliveries')
    .select('id, subscription_id')
    .eq('id', parsed.data.deliveryId)
    .maybeSingle();

  const delivery = deliveryData as { id: string; subscription_id: string | null } | null;
  if (!delivery?.id || !delivery.subscription_id) {
    return { ok: false, error: 'Delivery not found' };
  }

  const { data: subData } = await adminDb
    .from('webhook_subscriptions')
    .select('id, operator_id')
    .eq('id', delivery.subscription_id)
    .eq('operator_id', ctx.operatorId)
    .maybeSingle();

  if (!subData?.id) {
    return { ok: false, error: 'Subscription not found for delivery' };
  }

  const response = await callDeliverWebhooksFunction({
    delivery_id: delivery.id,
    source: 'manual-retry',
  });

  if (!response.ok) {
    return { ok: false, error: response.error ?? 'Retry call failed' };
  }

  await adminDb.from('audit_log').insert({
    operator_id: ctx.operatorId,
    user_id: ctx.userId,
    action: 'webhook.delivery.retry_requested',
    entity_type: 'webhook_deliveries',
    entity_id: delivery.id,
    payload: {},
  });

  revalidatePath('/settings/webhooks');
  return { ok: true, id: delivery.id };
}
