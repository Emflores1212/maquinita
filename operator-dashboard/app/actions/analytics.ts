'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { hasPermission, type UserRole } from '@/lib/permissions';
import { createAdminClient, createServerClient } from '@/lib/supabase';

const cogsValueSchema = z.number().min(0).max(100);

const upsertCategorySchema = z.object({
  categoryId: z.string().uuid(),
  cogsPercentage: cogsValueSchema,
});

const upsertProductSchema = z.object({
  productId: z.string().uuid(),
  cogsPercentage: cogsValueSchema,
});

const removeCogsSchema = z.object({
  settingId: z.string().uuid(),
});

type ActionResult = {
  ok: boolean;
  error?: string;
  id?: string;
};

async function getOperatorContext() {
  const supabase = createServerClient();
  const db = supabase;

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

function normalizeCogsValue(value: number) {
  return Number(value.toFixed(2));
}

async function revalidateAnalyticsViews() {
  revalidatePath('/analytics');
  revalidatePath('/settings');
  revalidatePath('/settings/profitability');
}

export async function upsertCategoryCogsAction(payload: z.infer<typeof upsertCategorySchema>): Promise<ActionResult> {
  const parsed = upsertCategorySchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, error: 'Invalid category COGS payload' };
  }

  const ctx = await getOperatorContext();
  if ('error' in ctx) {
    return { ok: false, error: ctx.error };
  }

  if (!hasPermission(ctx.role, 'settings', 'w')) {
    return { ok: false, error: 'Permission denied' };
  }

  const adminDb = createAdminClient();

  const { data: categoryData } = await adminDb
    .from('product_categories')
    .select('id')
    .eq('id', parsed.data.categoryId)
    .eq('operator_id', ctx.operatorId)
    .maybeSingle();

  if (!categoryData?.id) {
    return { ok: false, error: 'Category not found' };
  }

  const value = normalizeCogsValue(parsed.data.cogsPercentage);

  const { data: upsertData, error: upsertError } = await adminDb
    .from('cogs_settings')
    .upsert(
      {
        operator_id: ctx.operatorId,
        category_id: parsed.data.categoryId,
        product_id: null,
        cogs_percentage: value,
      },
      {
        onConflict: 'operator_id,category_id',
      }
    )
    .select('id')
    .single();

  if (upsertError) {
    return { ok: false, error: upsertError.message };
  }

  await adminDb.from('audit_log').insert({
    operator_id: ctx.operatorId,
    user_id: ctx.user.id,
    action: 'analytics.cogs.category.upserted',
    entity_type: 'cogs_settings',
    entity_id: upsertData?.id ?? null,
    payload: {
      category_id: parsed.data.categoryId,
      cogs_percentage: value,
    },
  });

  await revalidateAnalyticsViews();

  return { ok: true, id: upsertData?.id };
}

export async function upsertProductCogsAction(payload: z.infer<typeof upsertProductSchema>): Promise<ActionResult> {
  const parsed = upsertProductSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, error: 'Invalid product COGS payload' };
  }

  const ctx = await getOperatorContext();
  if ('error' in ctx) {
    return { ok: false, error: ctx.error };
  }

  if (!hasPermission(ctx.role, 'settings', 'w')) {
    return { ok: false, error: 'Permission denied' };
  }

  const adminDb = createAdminClient();

  const { data: productData } = await adminDb
    .from('products')
    .select('id')
    .eq('id', parsed.data.productId)
    .eq('operator_id', ctx.operatorId)
    .maybeSingle();

  if (!productData?.id) {
    return { ok: false, error: 'Product not found' };
  }

  const value = normalizeCogsValue(parsed.data.cogsPercentage);

  const { data: upsertData, error: upsertError } = await adminDb
    .from('cogs_settings')
    .upsert(
      {
        operator_id: ctx.operatorId,
        product_id: parsed.data.productId,
        category_id: null,
        cogs_percentage: value,
      },
      {
        onConflict: 'operator_id,product_id',
      }
    )
    .select('id')
    .single();

  if (upsertError) {
    return { ok: false, error: upsertError.message };
  }

  await adminDb.from('audit_log').insert({
    operator_id: ctx.operatorId,
    user_id: ctx.user.id,
    action: 'analytics.cogs.product.upserted',
    entity_type: 'cogs_settings',
    entity_id: upsertData?.id ?? null,
    payload: {
      product_id: parsed.data.productId,
      cogs_percentage: value,
    },
  });

  await revalidateAnalyticsViews();

  return { ok: true, id: upsertData?.id };
}

export async function removeCogsSettingAction(payload: z.infer<typeof removeCogsSchema>): Promise<ActionResult> {
  const parsed = removeCogsSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, error: 'Invalid remove COGS payload' };
  }

  const ctx = await getOperatorContext();
  if ('error' in ctx) {
    return { ok: false, error: ctx.error };
  }

  if (!hasPermission(ctx.role, 'settings', 'w')) {
    return { ok: false, error: 'Permission denied' };
  }

  const adminDb = createAdminClient();

  const { data: existingData } = await adminDb
    .from('cogs_settings')
    .select('id, product_id, category_id')
    .eq('id', parsed.data.settingId)
    .eq('operator_id', ctx.operatorId)
    .maybeSingle();

  if (!existingData?.id) {
    return { ok: false, error: 'COGS setting not found' };
  }

  const { error: deleteError } = await adminDb
    .from('cogs_settings')
    .delete()
    .eq('id', parsed.data.settingId)
    .eq('operator_id', ctx.operatorId);

  if (deleteError) {
    return { ok: false, error: deleteError.message };
  }

  await adminDb.from('audit_log').insert({
    operator_id: ctx.operatorId,
    user_id: ctx.user.id,
    action: 'analytics.cogs.deleted',
    entity_type: 'cogs_settings',
    entity_id: parsed.data.settingId,
    payload: {
      product_id: existingData.product_id,
      category_id: existingData.category_id,
    },
  });

  await revalidateAnalyticsViews();

  return { ok: true };
}
