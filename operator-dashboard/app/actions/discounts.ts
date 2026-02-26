'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import {
  isHappyHourActive,
  parseExpirationTiers,
  parseHappyHourSchedule,
  validateExpirationTiers,
  type ExpirationTier,
} from '@/lib/discounts';
import { hasPermission, type UserRole } from '@/lib/permissions';
import { createAdminClient, createServerClient } from '@/lib/supabase';
import type { Json } from '@/lib/types';

const discountTypeSchema = z.enum(['standard', 'happy_hour', 'expiration', 'coupon']);
const valueTypeSchema = z.enum(['percentage', 'fixed']);

const tierSchema = z.object({
  days_remaining: z.number().int().min(0),
  discount_pct: z.number().positive().max(100),
});

const scheduleSchema = z.object({
  days: z.array(z.enum(['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'])).min(1),
  from: z.string().regex(/^\d{2}:\d{2}$/),
  to: z.string().regex(/^\d{2}:\d{2}$/),
});

const baseDiscountInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  type: discountTypeSchema,
  valueType: valueTypeSchema,
  value: z.number().positive(),
  targetProductIds: z.array(z.string().uuid()).default([]),
  targetCategoryIds: z.array(z.string().uuid()).default([]),
  targetMachineIds: z.array(z.string().uuid()).default([]),
  startsAt: z.string().datetime().optional().nullable(),
  endsAt: z.string().datetime().optional().nullable(),
  schedule: scheduleSchema.optional().nullable(),
  couponCode: z.string().trim().max(80).optional().nullable(),
  maxUses: z.number().int().positive().optional().nullable(),
  expirationTiers: z.array(tierSchema).optional(),
});

const createDiscountSchema = baseDiscountInputSchema;

const updateDiscountSchema = baseDiscountInputSchema.extend({
  discountId: z.string().uuid(),
});

const endDiscountSchema = z.object({
  discountId: z.string().uuid(),
});

const createExpirationRuleSchema = z.object({
  name: z.string().trim().min(1).max(120),
  targetProductIds: z.array(z.string().uuid()).default([]),
  targetCategoryIds: z.array(z.string().uuid()).default([]),
  tiers: z.array(tierSchema).min(1),
  isActive: z.boolean().default(true),
});

const toggleExpirationRuleSchema = z.object({
  ruleId: z.string().uuid(),
  isActive: z.boolean(),
});

type ActionResult = {
  ok: boolean;
  error?: string;
  id?: string;
};

async function getOperatorContext() {
  const supabase = createServerClient();
  const db = supabase as any;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: 'Not authenticated' as const };
  }

  const { data: profileData } = await db.from('profiles').select('operator_id, role').eq('id', user.id).maybeSingle();
  const profile = profileData as { operator_id: string | null; role: UserRole | null } | null;

  if (!profile?.operator_id) {
    return { error: 'Invalid profile context' as const };
  }

  return {
    user,
    operatorId: profile.operator_id,
    role: profile.role,
  };
}

function normalizeIso(value: string | null | undefined): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function resolveWindowStatus(params: {
  type: 'standard' | 'happy_hour' | 'expiration' | 'coupon';
  startsAt: string | null;
  endsAt: string | null;
  schedule: Json;
  timezone?: string;
}) {
  const now = new Date();
  const startsAt = params.startsAt ? new Date(params.startsAt) : null;
  const endsAt = params.endsAt ? new Date(params.endsAt) : null;

  if (endsAt && endsAt <= now) {
    return 'ended' as const;
  }

  if (startsAt && startsAt > now) {
    return 'scheduled' as const;
  }

  if (params.type === 'happy_hour') {
    const parsed = parseHappyHourSchedule(params.schedule);
    if (!parsed) return 'paused' as const;
    return isHappyHourActive({ schedule: parsed, now, timeZone: params.timezone || 'UTC' }) ? 'active' : 'paused';
  }

  return 'active' as const;
}

async function validateTargets(adminDb: any, operatorId: string, payload: { productIds: string[]; categoryIds: string[]; machineIds: string[] }) {
  const { productIds, categoryIds, machineIds } = payload;

  const [productsCount, categoriesCount, machinesCount] = await Promise.all([
    productIds.length > 0
      ? adminDb.from('products').select('id', { count: 'exact', head: true }).eq('operator_id', operatorId).in('id', productIds)
      : Promise.resolve({ count: 0 }),
    categoryIds.length > 0
      ? adminDb.from('product_categories').select('id', { count: 'exact', head: true }).eq('operator_id', operatorId).in('id', categoryIds)
      : Promise.resolve({ count: 0 }),
    machineIds.length > 0
      ? adminDb.from('machines').select('id', { count: 'exact', head: true }).eq('operator_id', operatorId).in('id', machineIds)
      : Promise.resolve({ count: 0 }),
  ]);

  if ((productsCount.count ?? 0) !== productIds.length) {
    return { ok: false, error: 'Invalid product targets' as const };
  }

  if ((categoriesCount.count ?? 0) !== categoryIds.length) {
    return { ok: false, error: 'Invalid category targets' as const };
  }

  if ((machinesCount.count ?? 0) !== machineIds.length) {
    return { ok: false, error: 'Invalid machine targets' as const };
  }

  return { ok: true as const };
}

async function getOperatorTimezone(adminDb: any, operatorId: string): Promise<string> {
  const { data: operatorData } = await adminDb.from('operators').select('settings').eq('id', operatorId).maybeSingle();
  const settings = (operatorData as { settings?: Record<string, unknown> | null } | null)?.settings ?? {};
  return typeof settings.timezone === 'string' && settings.timezone.trim() ? settings.timezone.trim() : 'UTC';
}

function normalizeTiersForStorage(tiers: ExpirationTier[]): Json {
  return tiers
    .map((tier) => ({
      days_remaining: Math.floor(tier.days_remaining),
      discount_pct: Number(tier.discount_pct.toFixed(2)),
    }))
    .sort((a, b) => b.days_remaining - a.days_remaining) as Json;
}

function normalizeDiscountPayload(input: z.infer<typeof createDiscountSchema> | z.infer<typeof updateDiscountSchema>) {
  const startsAt = normalizeIso(input.startsAt);
  const endsAt = normalizeIso(input.endsAt);
  const couponCode = input.type === 'coupon' ? input.couponCode?.trim().toUpperCase() || null : null;
  const schedule: Json = input.type === 'happy_hour' ? ((input.schedule ?? {}) as Json) : {};

  return {
    name: input.name.trim(),
    type: input.type,
    value_type: input.valueType,
    value: Number(input.value.toFixed(2)),
    target_product_ids: input.targetProductIds,
    target_category_ids: input.targetCategoryIds,
    target_machine_ids: input.targetMachineIds,
    schedule,
    coupon_code: couponCode,
    max_uses: input.type === 'coupon' ? input.maxUses ?? null : null,
    starts_at: startsAt,
    ends_at: endsAt,
  };
}

export async function createDiscountAction(payload: z.infer<typeof createDiscountSchema>): Promise<ActionResult> {
  const parsed = createDiscountSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, error: 'Invalid discount payload' };
  }

  const ctx = await getOperatorContext();
  if ('error' in ctx) {
    return { ok: false, error: ctx.error };
  }

  if (!hasPermission(ctx.role, 'discounts', 'w')) {
    return { ok: false, error: 'Permission denied' };
  }

  if (parsed.data.type === 'coupon' && !parsed.data.couponCode?.trim()) {
    return { ok: false, error: 'Coupon code is required' };
  }

  if (parsed.data.type === 'happy_hour' && !parsed.data.schedule) {
    return { ok: false, error: 'Happy hour schedule is required' };
  }

  if (parsed.data.type === 'expiration' && (parsed.data.expirationTiers?.length ?? 0) > 0) {
    const tiers = parseExpirationTiers(parsed.data.expirationTiers ?? []);
    const validation = validateExpirationTiers(tiers);
    if (!validation.ok) {
      return { ok: false, error: validation.error };
    }
  }

  const adminDb = createAdminClient() as any;
  const targetsValidation = await validateTargets(adminDb, ctx.operatorId, {
    productIds: parsed.data.targetProductIds,
    categoryIds: parsed.data.targetCategoryIds,
    machineIds: parsed.data.targetMachineIds,
  });

  if (!targetsValidation.ok) {
    return { ok: false, error: targetsValidation.error };
  }

  const timezone = await getOperatorTimezone(adminDb, ctx.operatorId);
  const normalized = normalizeDiscountPayload(parsed.data);
  const status = resolveWindowStatus({
    type: parsed.data.type,
    startsAt: normalized.starts_at,
    endsAt: normalized.ends_at,
    schedule: normalized.schedule,
    timezone,
  });

  const { data: insertData, error: insertError } = await adminDb
    .from('discounts')
    .insert({
      operator_id: ctx.operatorId,
      ...normalized,
      status,
    })
    .select('id')
    .single();

  if (insertError || !insertData?.id) {
    return { ok: false, error: insertError?.message ?? 'Failed to create discount' };
  }

  if (parsed.data.type === 'expiration') {
    const tiers = parseExpirationTiers(parsed.data.expirationTiers ?? []);
    const { error: rulesError } = await adminDb.from('expiration_rules').insert({
      operator_id: ctx.operatorId,
      name: parsed.data.name.trim(),
      target_product_ids: parsed.data.targetProductIds,
      target_category_ids: parsed.data.targetCategoryIds,
      tiers: normalizeTiersForStorage(tiers),
      is_active: true,
    });

    if (rulesError) {
      return { ok: false, error: rulesError.message };
    }
  }

  await adminDb.from('audit_log').insert({
    operator_id: ctx.operatorId,
    user_id: ctx.user.id,
    action: 'discount.created',
    entity_type: 'discounts',
    entity_id: insertData.id,
    payload: {
      type: parsed.data.type,
      value_type: parsed.data.valueType,
      value: parsed.data.value,
      target_product_ids: parsed.data.targetProductIds,
      target_category_ids: parsed.data.targetCategoryIds,
      target_machine_ids: parsed.data.targetMachineIds,
    },
  });

  revalidatePath('/discounts');
  revalidatePath('/discounts/expiration');
  revalidatePath('/transactions');

  return { ok: true, id: insertData.id };
}

export async function updateDiscountAction(payload: z.infer<typeof updateDiscountSchema>): Promise<ActionResult> {
  const parsed = updateDiscountSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, error: 'Invalid discount payload' };
  }

  const ctx = await getOperatorContext();
  if ('error' in ctx) {
    return { ok: false, error: ctx.error };
  }

  if (!hasPermission(ctx.role, 'discounts', 'w')) {
    return { ok: false, error: 'Permission denied' };
  }

  const adminDb = createAdminClient() as any;

  const { data: existingData } = await adminDb
    .from('discounts')
    .select('id, type')
    .eq('id', parsed.data.discountId)
    .eq('operator_id', ctx.operatorId)
    .maybeSingle();

  if (!existingData?.id) {
    return { ok: false, error: 'Discount not found' };
  }

  const targetsValidation = await validateTargets(adminDb, ctx.operatorId, {
    productIds: parsed.data.targetProductIds,
    categoryIds: parsed.data.targetCategoryIds,
    machineIds: parsed.data.targetMachineIds,
  });

  if (!targetsValidation.ok) {
    return { ok: false, error: targetsValidation.error };
  }

  if (parsed.data.type === 'coupon' && !parsed.data.couponCode?.trim()) {
    return { ok: false, error: 'Coupon code is required' };
  }

  if (parsed.data.type === 'happy_hour' && !parsed.data.schedule) {
    return { ok: false, error: 'Happy hour schedule is required' };
  }

  if (parsed.data.type === 'expiration') {
    const tiers = parseExpirationTiers(parsed.data.expirationTiers ?? []);
    const validation = validateExpirationTiers(tiers);
    if (!validation.ok) {
      return { ok: false, error: validation.error };
    }
  }

  const timezone = await getOperatorTimezone(adminDb, ctx.operatorId);
  const normalized = normalizeDiscountPayload(parsed.data);
  const nextStatus = resolveWindowStatus({
    type: parsed.data.type,
    startsAt: normalized.starts_at,
    endsAt: normalized.ends_at,
    schedule: normalized.schedule,
    timezone,
  });

  const { error: updateError } = await adminDb
    .from('discounts')
    .update({
      ...normalized,
      status: nextStatus,
      ended_at: nextStatus === 'ended' ? new Date().toISOString() : null,
    })
    .eq('id', parsed.data.discountId)
    .eq('operator_id', ctx.operatorId);

  if (updateError) {
    return { ok: false, error: updateError.message };
  }

  if (parsed.data.type === 'expiration' && (parsed.data.expirationTiers?.length ?? 0) > 0) {
    const normalizedTiers = normalizeTiersForStorage(parsed.data.expirationTiers ?? []);
    const { data: existingRuleData } = await adminDb
      .from('expiration_rules')
      .select('id')
      .eq('operator_id', ctx.operatorId)
      .eq('name', parsed.data.name.trim())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingRuleData?.id) {
      await adminDb
        .from('expiration_rules')
        .update({
          target_product_ids: parsed.data.targetProductIds,
          target_category_ids: parsed.data.targetCategoryIds,
          tiers: normalizedTiers,
          is_active: true,
        })
        .eq('id', existingRuleData.id)
        .eq('operator_id', ctx.operatorId);
    } else {
      await adminDb.from('expiration_rules').insert({
        operator_id: ctx.operatorId,
        name: parsed.data.name.trim(),
        target_product_ids: parsed.data.targetProductIds,
        target_category_ids: parsed.data.targetCategoryIds,
        tiers: normalizedTiers,
        is_active: true,
      });
    }
  }

  await adminDb.from('audit_log').insert({
    operator_id: ctx.operatorId,
    user_id: ctx.user.id,
    action: 'discount.updated',
    entity_type: 'discounts',
    entity_id: parsed.data.discountId,
    payload: {
      type: parsed.data.type,
      value_type: parsed.data.valueType,
      value: parsed.data.value,
    },
  });

  revalidatePath('/discounts');
  revalidatePath('/discounts/expiration');
  revalidatePath('/transactions');

  return { ok: true, id: parsed.data.discountId };
}

export async function endDiscountAction(payload: z.infer<typeof endDiscountSchema>): Promise<ActionResult> {
  const parsed = endDiscountSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, error: 'Invalid discount id' };
  }

  const ctx = await getOperatorContext();
  if ('error' in ctx) {
    return { ok: false, error: ctx.error };
  }

  if (!hasPermission(ctx.role, 'discounts', 'w')) {
    return { ok: false, error: 'Permission denied' };
  }

  const adminDb = createAdminClient() as any;
  const nowIso = new Date().toISOString();

  const { error: updateError } = await adminDb
    .from('discounts')
    .update({
      status: 'ended',
      ended_at: nowIso,
      ends_at: nowIso,
    })
    .eq('id', parsed.data.discountId)
    .eq('operator_id', ctx.operatorId);

  if (updateError) {
    return { ok: false, error: updateError.message };
  }

  await adminDb.from('audit_log').insert({
    operator_id: ctx.operatorId,
    user_id: ctx.user.id,
    action: 'discount.ended',
    entity_type: 'discounts',
    entity_id: parsed.data.discountId,
    payload: {
      ended_at: nowIso,
    },
  });

  revalidatePath('/discounts');

  return { ok: true, id: parsed.data.discountId };
}

export async function createExpirationRuleAction(payload: z.infer<typeof createExpirationRuleSchema>): Promise<ActionResult> {
  const parsed = createExpirationRuleSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, error: 'Invalid expiration rule payload' };
  }

  const validation = validateExpirationTiers(parsed.data.tiers);
  if (!validation.ok) {
    return { ok: false, error: validation.error };
  }

  const ctx = await getOperatorContext();
  if ('error' in ctx) {
    return { ok: false, error: ctx.error };
  }

  if (!hasPermission(ctx.role, 'discounts', 'w')) {
    return { ok: false, error: 'Permission denied' };
  }

  const adminDb = createAdminClient() as any;

  const targetsValidation = await validateTargets(adminDb, ctx.operatorId, {
    productIds: parsed.data.targetProductIds,
    categoryIds: parsed.data.targetCategoryIds,
    machineIds: [],
  });

  if (!targetsValidation.ok) {
    return { ok: false, error: targetsValidation.error };
  }

  const { data: insertData, error: insertError } = await adminDb
    .from('expiration_rules')
    .insert({
      operator_id: ctx.operatorId,
      name: parsed.data.name,
      target_product_ids: parsed.data.targetProductIds,
      target_category_ids: parsed.data.targetCategoryIds,
      tiers: normalizeTiersForStorage(parsed.data.tiers),
      is_active: parsed.data.isActive,
    })
    .select('id')
    .single();

  if (insertError || !insertData?.id) {
    return { ok: false, error: insertError?.message ?? 'Failed to create expiration rule' };
  }

  await adminDb.from('audit_log').insert({
    operator_id: ctx.operatorId,
    user_id: ctx.user.id,
    action: 'discount.expiration_rule.created',
    entity_type: 'expiration_rules',
    entity_id: insertData.id,
    payload: {
      target_product_ids: parsed.data.targetProductIds,
      target_category_ids: parsed.data.targetCategoryIds,
      tiers: parsed.data.tiers,
      is_active: parsed.data.isActive,
    },
  });

  revalidatePath('/discounts');
  revalidatePath('/discounts/expiration');

  return { ok: true, id: insertData.id };
}

export async function toggleExpirationRuleAction(payload: z.infer<typeof toggleExpirationRuleSchema>): Promise<ActionResult> {
  const parsed = toggleExpirationRuleSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, error: 'Invalid expiration rule payload' };
  }

  const ctx = await getOperatorContext();
  if ('error' in ctx) {
    return { ok: false, error: ctx.error };
  }

  if (!hasPermission(ctx.role, 'discounts', 'w')) {
    return { ok: false, error: 'Permission denied' };
  }

  const adminDb = createAdminClient() as any;

  const { error: updateError } = await adminDb
    .from('expiration_rules')
    .update({ is_active: parsed.data.isActive })
    .eq('id', parsed.data.ruleId)
    .eq('operator_id', ctx.operatorId);

  if (updateError) {
    return { ok: false, error: updateError.message };
  }

  await adminDb.from('audit_log').insert({
    operator_id: ctx.operatorId,
    user_id: ctx.user.id,
    action: 'discount.expiration_rule.toggled',
    entity_type: 'expiration_rules',
    entity_id: parsed.data.ruleId,
    payload: {
      is_active: parsed.data.isActive,
    },
  });

  revalidatePath('/discounts');
  revalidatePath('/discounts/expiration');

  return { ok: true, id: parsed.data.ruleId };
}
