'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { hasPermission, type UserRole } from '@/lib/permissions';
import { createAdminClient, createServerClient } from '@/lib/supabase';

type MarketingContext =
  | {
      ok: false;
      error: string;
    }
  | {
      ok: true;
      userId: string;
      operatorId: string;
      role: UserRole | null;
      operatorSlug: string;
      operatorName: string;
    };

type ActionResult = {
  ok: boolean;
  error?: string;
  id?: string;
  queued?: boolean;
};

const notificationSchema = z
  .object({
    title: z.string().trim().min(1).max(50),
    body: z.string().trim().min(1).max(200),
    targetType: z.enum(['all', 'machine', 'inactive_7d', 'custom_sql']),
    machineId: z.string().uuid().optional().nullable(),
    customSql: z.string().trim().max(500).optional().nullable(),
    deepLinkMachineId: z.string().uuid().optional().nullable(),
    mode: z.enum(['now', 'schedule']),
    scheduledFor: z.string().datetime().optional().nullable(),
  })
  .superRefine((value, ctx) => {
    if (value.targetType === 'machine' && !value.machineId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Machine target requires machineId',
        path: ['machineId'],
      });
    }

    if (value.targetType === 'custom_sql' && !value.customSql) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Custom SQL segment is required',
        path: ['customSql'],
      });
    }

    if (value.mode === 'schedule' && !value.scheduledFor) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'scheduledFor is required when mode is schedule',
        path: ['scheduledFor'],
      });
    }
  });

const awardCreditsSchema = z.object({
  consumerId: z.string().uuid(),
  amount: z.number().positive().max(10000),
  reason: z.string().trim().min(1).max(80),
  note: z.string().trim().max(250).optional().nullable(),
});

const searchConsumersSchema = z.object({
  phone: z.string().trim().min(2).max(32),
});

const ledgerSchema = z.object({
  consumerId: z.string().uuid(),
});

const automationRuleSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    triggerType: z.enum(['welcome', 'nth_purchase', 'spend_threshold']),
    triggerValue: z.number().positive().optional().nullable(),
    rewardCredits: z.number().positive().max(10000),
    isActive: z.boolean().default(true),
  })
  .superRefine((value, ctx) => {
    if (value.triggerType !== 'welcome' && (!value.triggerValue || value.triggerValue <= 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Trigger value is required for this rule',
        path: ['triggerValue'],
      });
    }
  });

const toggleAutomationSchema = z.object({
  ruleId: z.string().uuid(),
  isActive: z.boolean(),
});

const replyFeedbackSchema = z.object({
  feedbackId: z.string().uuid(),
  reply: z.string().trim().min(1).max(1000),
});

function normalizeIso(value: string | null | undefined): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

async function getMarketingContext(): Promise<MarketingContext> {
  const supabase = createServerClient();
  const db = supabase as any;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: 'Not authenticated' };
  }

  const { data: profileData } = await db.from('profiles').select('operator_id, role').eq('id', user.id).maybeSingle();
  const profile = profileData as { operator_id: string | null; role: UserRole | null } | null;

  if (!profile?.operator_id) {
    return { ok: false, error: 'Invalid operator context' };
  }

  const adminDb = createAdminClient() as any;
  const { data: operatorData } = await adminDb
    .from('operators')
    .select('slug, name')
    .eq('id', profile.operator_id)
    .maybeSingle();

  const operator = operatorData as { slug: string | null; name: string | null } | null;
  if (!operator?.slug) {
    return { ok: false, error: 'Operator not found' };
  }

  return {
    ok: true,
    userId: user.id,
    operatorId: profile.operator_id,
    role: profile.role,
    operatorSlug: operator.slug,
    operatorName: operator.name ?? 'Maquinita',
  };
}

async function dispatchSendPushNow(notificationId: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return { ok: false, error: 'Missing Supabase function env vars' };
  }

  const response = await fetch(`${supabaseUrl}/functions/v1/send-push`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      notification_id: notificationId,
      source: 'dashboard_action',
    }),
    cache: 'no-store',
  }).catch(() => null);

  if (!response?.ok) {
    return { ok: false, error: 'Dispatch call failed' };
  }

  return { ok: true };
}

export async function createNotificationSendAction(payload: z.infer<typeof notificationSchema>): Promise<ActionResult> {
  const parsed = notificationSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid payload' };
  }

  const ctx = await getMarketingContext();
  if (!ctx.ok) return { ok: false, error: ctx.error };
  if (!hasPermission(ctx.role, 'marketing', 'w')) {
    return { ok: false, error: 'Permission denied' };
  }

  const adminDb = createAdminClient() as any;

  if (parsed.data.machineId) {
    const { data: machineData } = await adminDb
      .from('machines')
      .select('id')
      .eq('id', parsed.data.machineId)
      .eq('operator_id', ctx.operatorId)
      .maybeSingle();
    if (!machineData?.id) {
      return { ok: false, error: 'Target machine not found' };
    }
  }

  let deepLinkUrl: string | null = null;
  if (parsed.data.deepLinkMachineId) {
    const { data: deepMachineData } = await adminDb
      .from('machines')
      .select('id')
      .eq('id', parsed.data.deepLinkMachineId)
      .eq('operator_id', ctx.operatorId)
      .maybeSingle();
    if (!deepMachineData?.id) {
      return { ok: false, error: 'Deep-link machine not found' };
    }
    deepLinkUrl = `/${ctx.operatorSlug}/machine/${parsed.data.deepLinkMachineId}`;
  }

  const target = {
    type: parsed.data.targetType,
    machineId: parsed.data.machineId ?? null,
    customSql: parsed.data.targetType === 'custom_sql' ? parsed.data.customSql ?? null : null,
  };

  const scheduledFor =
    parsed.data.mode === 'now' ? new Date().toISOString() : normalizeIso(parsed.data.scheduledFor) ?? new Date().toISOString();

  const { data: insertData, error: insertError } = await adminDb
    .from('notification_sends')
    .insert({
      operator_id: ctx.operatorId,
      title: parsed.data.title,
      body: parsed.data.body,
      target,
      deep_link_url: deepLinkUrl,
      scheduled_for: scheduledFor,
    })
    .select('id')
    .single();

  if (insertError || !insertData?.id) {
    return { ok: false, error: insertError?.message ?? 'Could not create notification send' };
  }

  await adminDb.from('audit_log').insert({
    operator_id: ctx.operatorId,
    user_id: ctx.userId,
    action: 'marketing.notification.created',
    entity_type: 'notification_sends',
    entity_id: insertData.id,
    payload: {
      target,
      mode: parsed.data.mode,
      scheduled_for: scheduledFor,
      deep_link_url: deepLinkUrl,
    },
  });

  let queued = true;
  if (parsed.data.mode === 'now') {
    const dispatched = await dispatchSendPushNow(insertData.id);
    queued = !dispatched.ok;
  }

  revalidatePath('/marketing/notifications');
  return { ok: true, id: insertData.id, queued };
}

export async function searchConsumersByPhoneAction(payload: z.infer<typeof searchConsumersSchema>) {
  const parsed = searchConsumersSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false as const, error: 'Invalid search' };
  }

  const ctx = await getMarketingContext();
  if (!ctx.ok) return { ok: false as const, error: ctx.error };
  if (!hasPermission(ctx.role, 'marketing', 'r')) {
    return { ok: false as const, error: 'Permission denied' };
  }

  const adminDb = createAdminClient() as any;
  const { data: consumersData, error: consumersError } = await adminDb
    .from('consumer_profiles')
    .select('id, full_name, phone, credit_balance')
    .eq('operator_id', ctx.operatorId)
    .ilike('phone', `%${parsed.data.phone}%`)
    .order('created_at', { ascending: false })
    .limit(20);

  if (consumersError) {
    return { ok: false as const, error: consumersError.message };
  }

  const consumers =
    ((consumersData as Array<{ id: string; full_name: string | null; phone: string | null; credit_balance: number | null }> | null) ??
      []).map((consumer) => ({
      id: consumer.id,
      fullName: consumer.full_name,
      phone: consumer.phone,
      creditBalance: Number(consumer.credit_balance ?? 0),
    }));

  const withCounts = await Promise.all(
    consumers.map(async (consumer) => {
      const phone = consumer.phone?.trim();
      if (!phone) {
        return {
          ...consumer,
          purchaseCount: 0,
        };
      }

      const { count } = await adminDb
        .from('transactions')
        .select('id', { head: true, count: 'exact' })
        .eq('operator_id', ctx.operatorId)
        .eq('customer_phone', phone)
        .in('status', ['completed', 'refunded']);

      return {
        ...consumer,
        purchaseCount: Number(count ?? 0),
      };
    })
  );

  return { ok: true as const, consumers: withCounts };
}

export async function getConsumerCreditLedgerAction(payload: z.infer<typeof ledgerSchema>) {
  const parsed = ledgerSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false as const, error: 'Invalid consumer id' };
  }

  const ctx = await getMarketingContext();
  if (!ctx.ok) return { ok: false as const, error: ctx.error };
  if (!hasPermission(ctx.role, 'marketing', 'r')) {
    return { ok: false as const, error: 'Permission denied' };
  }

  const adminDb = createAdminClient() as any;

  const { data: consumerData } = await adminDb
    .from('consumer_profiles')
    .select('id, credit_balance')
    .eq('operator_id', ctx.operatorId)
    .eq('id', parsed.data.consumerId)
    .maybeSingle();

  if (!consumerData?.id) {
    return { ok: false as const, error: 'Consumer not found' };
  }

  const { data: ledgerData, error: ledgerError } = await adminDb
    .from('credit_ledger')
    .select('id, type, amount, note, reference_id, created_at')
    .eq('operator_id', ctx.operatorId)
    .eq('consumer_id', parsed.data.consumerId)
    .order('created_at', { ascending: false })
    .limit(100);

  if (ledgerError) {
    return { ok: false as const, error: ledgerError.message };
  }

  return {
    ok: true as const,
    creditBalance: Number(consumerData.credit_balance ?? 0),
    entries:
      ((ledgerData as Array<{
        id: string;
        type: string;
        amount: number | null;
        note: string | null;
        reference_id: string | null;
        created_at: string | null;
      }> | null) ?? []).map((entry) => ({
        id: entry.id,
        type: entry.type,
        amount: Number(entry.amount ?? 0),
        note: entry.note,
        referenceId: entry.reference_id,
        createdAt: entry.created_at ?? new Date().toISOString(),
      })),
  };
}

export async function awardCreditsAction(payload: z.infer<typeof awardCreditsSchema>): Promise<ActionResult> {
  const parsed = awardCreditsSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid payload' };
  }

  const ctx = await getMarketingContext();
  if (!ctx.ok) return { ok: false, error: ctx.error };
  if (!hasPermission(ctx.role, 'marketing', 'w')) {
    return { ok: false, error: 'Permission denied' };
  }

  const adminDb = createAdminClient() as any;

  const { data: consumerData } = await adminDb
    .from('consumer_profiles')
    .select('id, operator_id, credit_balance')
    .eq('id', parsed.data.consumerId)
    .eq('operator_id', ctx.operatorId)
    .maybeSingle();

  const consumer = consumerData as { id: string; operator_id: string; credit_balance: number | null } | null;
  if (!consumer?.id) {
    return { ok: false, error: 'Consumer not found' };
  }

  const nextBalance = Number((Number(consumer.credit_balance ?? 0) + parsed.data.amount).toFixed(2));
  const nowIso = new Date().toISOString();

  const [{ error: updateError }, { error: ledgerError }] = await Promise.all([
    adminDb
      .from('consumer_profiles')
      .update({
        credit_balance: nextBalance,
      })
      .eq('id', consumer.id)
      .eq('operator_id', ctx.operatorId),
    adminDb.from('credit_ledger').insert({
      consumer_id: consumer.id,
      operator_id: ctx.operatorId,
      type: 'award',
      amount: parsed.data.amount,
      reference_id: parsed.data.reason,
      note: parsed.data.note ?? null,
      created_at: nowIso,
    }),
  ]);

  if (updateError || ledgerError) {
    return { ok: false, error: updateError?.message ?? ledgerError?.message ?? 'Failed to award credits' };
  }

  const { data: sendData } = await adminDb
    .from('notification_sends')
    .insert({
      operator_id: ctx.operatorId,
      title: 'Credits Added',
      body: `You received $${parsed.data.amount.toFixed(2)} in credits from ${ctx.operatorName}!`,
      target: {
        type: 'consumer_ids',
        consumerIds: [consumer.id],
      },
      scheduled_for: nowIso,
    })
    .select('id')
    .maybeSingle();

  if (sendData?.id) {
    await dispatchSendPushNow(sendData.id);
  }

  await adminDb.from('audit_log').insert({
    operator_id: ctx.operatorId,
    user_id: ctx.userId,
    action: 'marketing.credits.awarded',
    entity_type: 'consumer_profiles',
    entity_id: consumer.id,
    payload: {
      amount: parsed.data.amount,
      reason: parsed.data.reason,
      note: parsed.data.note ?? null,
      balance_after: nextBalance,
    },
  });

  revalidatePath('/marketing/credits');
  return { ok: true, id: consumer.id };
}

export async function createAutomationRuleAction(payload: z.infer<typeof automationRuleSchema>): Promise<ActionResult> {
  const parsed = automationRuleSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid payload' };
  }

  const ctx = await getMarketingContext();
  if (!ctx.ok) return { ok: false, error: ctx.error };
  if (!hasPermission(ctx.role, 'marketing', 'w')) {
    return { ok: false, error: 'Permission denied' };
  }

  const adminDb = createAdminClient() as any;
  const triggerValue = parsed.data.triggerType === 'welcome' ? null : parsed.data.triggerValue ?? null;

  const { data: insertData, error: insertError } = await adminDb
    .from('automation_rules')
    .insert({
      operator_id: ctx.operatorId,
      name: parsed.data.name,
      trigger_type: parsed.data.triggerType,
      trigger_value: triggerValue,
      reward_credits: parsed.data.rewardCredits,
      is_active: parsed.data.isActive,
    })
    .select('id')
    .single();

  if (insertError || !insertData?.id) {
    return { ok: false, error: insertError?.message ?? 'Failed to create rule' };
  }

  await adminDb.from('audit_log').insert({
    operator_id: ctx.operatorId,
    user_id: ctx.userId,
    action: 'marketing.automation_rule.created',
    entity_type: 'automation_rules',
    entity_id: insertData.id,
    payload: {
      trigger_type: parsed.data.triggerType,
      trigger_value: triggerValue,
      reward_credits: parsed.data.rewardCredits,
      is_active: parsed.data.isActive,
    },
  });

  revalidatePath('/marketing/automations');
  return { ok: true, id: insertData.id };
}

export async function toggleAutomationRuleAction(payload: z.infer<typeof toggleAutomationSchema>): Promise<ActionResult> {
  const parsed = toggleAutomationSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, error: 'Invalid payload' };
  }

  const ctx = await getMarketingContext();
  if (!ctx.ok) return { ok: false, error: ctx.error };
  if (!hasPermission(ctx.role, 'marketing', 'w')) {
    return { ok: false, error: 'Permission denied' };
  }

  const adminDb = createAdminClient() as any;

  const { error } = await adminDb
    .from('automation_rules')
    .update({
      is_active: parsed.data.isActive,
    })
    .eq('operator_id', ctx.operatorId)
    .eq('id', parsed.data.ruleId);

  if (error) {
    return { ok: false, error: error.message };
  }

  await adminDb.from('audit_log').insert({
    operator_id: ctx.operatorId,
    user_id: ctx.userId,
    action: 'marketing.automation_rule.toggled',
    entity_type: 'automation_rules',
    entity_id: parsed.data.ruleId,
    payload: {
      is_active: parsed.data.isActive,
    },
  });

  revalidatePath('/marketing/automations');
  return { ok: true, id: parsed.data.ruleId };
}

export async function replyConsumerFeedbackAction(payload: z.infer<typeof replyFeedbackSchema>): Promise<ActionResult> {
  const parsed = replyFeedbackSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid payload' };
  }

  const ctx = await getMarketingContext();
  if (!ctx.ok) return { ok: false, error: ctx.error };
  if (!hasPermission(ctx.role, 'marketing', 'w')) {
    return { ok: false, error: 'Permission denied' };
  }

  const adminDb = createAdminClient() as any;

  const { error } = await adminDb
    .from('consumer_feedback')
    .update({
      operator_reply: parsed.data.reply,
    })
    .eq('operator_id', ctx.operatorId)
    .eq('id', parsed.data.feedbackId);

  if (error) {
    return { ok: false, error: error.message };
  }

  await adminDb.from('audit_log').insert({
    operator_id: ctx.operatorId,
    user_id: ctx.userId,
    action: 'marketing.feedback.replied',
    entity_type: 'consumer_feedback',
    entity_id: parsed.data.feedbackId,
    payload: {
      operator_reply: parsed.data.reply,
    },
  });

  revalidatePath('/marketing/feedback');
  return { ok: true, id: parsed.data.feedbackId };
}
