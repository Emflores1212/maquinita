'use server';

import { customAlphabet } from 'nanoid';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { hasPermission, type UserRole } from '@/lib/permissions';
import { createAdminClient, createServerClient } from '@/lib/supabase';
import type { Json } from '@/lib/types';

const createSkuCode = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 6);

const nutritionalSchema = z.object({
  servingSize: z.number().nullable().optional(),
  calories: z.number().nullable().optional(),
  totalFat: z.number().nullable().optional(),
  saturatedFat: z.number().nullable().optional(),
  sodium: z.number().nullable().optional(),
  totalCarbs: z.number().nullable().optional(),
  fiber: z.number().nullable().optional(),
  sugars: z.number().nullable().optional(),
  protein: z.number().nullable().optional(),
});

const priceOverrideSchema = z.object({
  machineId: z.string().uuid(),
  price: z.number().positive().nullable(),
});

const upsertProductSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1),
  sku: z.string().optional().nullable(),
  categoryId: z.string().uuid().optional().nullable(),
  description: z.string().optional().nullable(),
  basePrice: z.number().positive(),
  nutritional: nutritionalSchema.optional(),
  allergens: z.array(z.string()).default([]),
  machinePrices: z.array(priceOverrideSchema).default([]),
});

const createCategorySchema = z.object({
  name: z.string().min(1).max(80),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional(),
});

const archiveProductSchema = z.object({
  productId: z.string().uuid(),
});

const updatePhotoSchema = z.object({
  productId: z.string().uuid(),
  photoUrl: z.string().url(),
});

const importRowSchema = z.object({
  name: z.string().min(1),
  sku: z.string().optional().nullable(),
  category: z.string().optional().nullable(),
  price: z.number().positive(),
  description: z.string().optional().nullable(),
  calories: z.number().nullable().optional(),
  protein: z.number().nullable().optional(),
  fat: z.number().nullable().optional(),
  carbs: z.number().nullable().optional(),
  allergens: z.array(z.string()).optional().default([]),
  clientRowIndex: z.number().int().nonnegative().optional(),
});

const importProductsSchema = z.object({
  rows: z.array(importRowSchema).min(1),
});

type ActionResult = {
  ok: boolean;
  error?: string;
  id?: string;
};

export type ImportSkippedRow = {
  rowIndex: number;
  reason: string;
  row: z.infer<typeof importRowSchema>;
};

export type ImportProductsResult = ActionResult & {
  importedCount?: number;
  skippedCount?: number;
  skippedRows?: ImportSkippedRow[];
};

type OperatorContext =
  | {
      error: string;
    }
  | {
      user: { id: string };
      operatorId: string;
      role: UserRole | null;
    };

function normalizeText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeAllergens(value: string[]): string[] {
  return Array.from(
    new Set(
      value
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean)
        .map((item) => item.replace(/\s+/g, '_'))
    )
  );
}

function generateSku(): string {
  return `SKU-${createSkuCode()}`;
}

function roundCurrency(value: number): number {
  return Number(value.toFixed(2));
}

function buildNutritional(value?: z.infer<typeof nutritionalSchema>): Json {
  if (!value) {
    return {};
  }

  const result: Record<string, number> = {};

  const pairs: Array<[keyof z.infer<typeof nutritionalSchema>, string]> = [
    ['servingSize', 'servingSize'],
    ['calories', 'calories'],
    ['totalFat', 'totalFat'],
    ['saturatedFat', 'saturatedFat'],
    ['sodium', 'sodium'],
    ['totalCarbs', 'totalCarbs'],
    ['fiber', 'fiber'],
    ['sugars', 'sugars'],
    ['protein', 'protein'],
  ];

  for (const [source, target] of pairs) {
    const raw = value[source];
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      result[target] = raw;
    }
  }

  return result;
}

async function getOperatorContext(): Promise<OperatorContext> {
  const supabase = createServerClient();
  const db = supabase as any;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: 'Not authenticated' };
  }

  const { data: profileData, error: profileError } = await db
    .from('profiles')
    .select('operator_id, role')
    .eq('id', user.id)
    .single();

  const profile = profileData as { operator_id: string | null; role: UserRole | null } | null;

  if (profileError || !profile?.operator_id) {
    return { error: 'Invalid profile context' };
  }

  return {
    user: { id: user.id },
    operatorId: profile.operator_id,
    role: profile.role,
  };
}

async function syncMachinePrices(
  adminDb: any,
  operatorId: string,
  productId: string,
  basePrice: number,
  machinePrices: Array<{ machineId: string; price: number | null }>
) {
  const { data: machineRows } = await adminDb.from('machines').select('id').eq('operator_id', operatorId).neq('status', 'archived');

  const allowedMachineIds = new Set(((machineRows as Array<{ id: string }> | null) ?? []).map((row) => row.id));

  const { error: deleteError } = await adminDb.from('machine_product_prices').delete().eq('product_id', productId);
  if (deleteError) {
    throw new Error('Failed to clear machine pricing');
  }

  const insertRows = machinePrices
    .filter((row) => allowedMachineIds.has(row.machineId))
    .filter((row) => typeof row.price === 'number' && Number.isFinite(row.price))
    .map((row) => ({
      machine_id: row.machineId,
      product_id: productId,
      price: roundCurrency(row.price as number),
    }))
    .filter((row) => row.price !== roundCurrency(basePrice));

  if (insertRows.length === 0) {
    return;
  }

  const { error: insertError } = await adminDb.from('machine_product_prices').insert(insertRows);
  if (insertError) {
    throw new Error('Failed to save machine pricing');
  }
}

export async function upsertProductAction(payload: z.infer<typeof upsertProductSchema>): Promise<ActionResult> {
  const parsed = upsertProductSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, error: 'Invalid product data' };
  }

  const ctx = await getOperatorContext();
  if ('error' in ctx) {
    return { ok: false, error: ctx.error };
  }

  if (!hasPermission(ctx.role, 'products', 'w')) {
    return { ok: false, error: 'Permission denied' };
  }

  const adminDb = createAdminClient() as any;
  const data = parsed.data;

  if (data.categoryId) {
    const { data: categoryData } = await adminDb
      .from('product_categories')
      .select('id')
      .eq('id', data.categoryId)
      .eq('operator_id', ctx.operatorId)
      .maybeSingle();

    if (!categoryData) {
      return { ok: false, error: 'Invalid category' };
    }
  }

  const sku = normalizeText(data.sku) ?? generateSku();
  const productPayload = {
    name: data.name.trim(),
    sku,
    category_id: data.categoryId ?? null,
    description: normalizeText(data.description),
    base_price: roundCurrency(data.basePrice),
    nutritional: buildNutritional(data.nutritional),
    allergens: normalizeAllergens(data.allergens),
  };

  let productId = data.id;
  let action = 'product.updated';

  if (data.id) {
    const { data: existing } = await adminDb
      .from('products')
      .select('id')
      .eq('id', data.id)
      .eq('operator_id', ctx.operatorId)
      .maybeSingle();

    if (!existing) {
      return { ok: false, error: 'Product not found' };
    }

    const { error: updateError } = await adminDb
      .from('products')
      .update(productPayload)
      .eq('id', data.id)
      .eq('operator_id', ctx.operatorId);

    if (updateError) {
      return { ok: false, error: 'Failed to update product' };
    }
  } else {
    action = 'product.created';

    const { data: insertData, error: insertError } = await adminDb
      .from('products')
      .insert({
        operator_id: ctx.operatorId,
        ...productPayload,
        status: 'active',
      })
      .select('id')
      .single();

    if (insertError || !insertData?.id) {
      return { ok: false, error: 'Failed to create product' };
    }

    productId = insertData.id;
  }

  if (!productId) {
    return { ok: false, error: 'Missing product id' };
  }

  try {
    await syncMachinePrices(adminDb, ctx.operatorId, productId, productPayload.base_price, data.machinePrices);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Failed to save machine pricing',
    };
  }

  await adminDb.from('audit_log').insert({
    operator_id: ctx.operatorId,
    user_id: ctx.user.id,
    action,
    entity_type: 'products',
    entity_id: productId,
    payload: {
      name: productPayload.name,
      sku: productPayload.sku,
      base_price: productPayload.base_price,
      category_id: productPayload.category_id,
    },
  });

  revalidatePath('/products');
  revalidatePath(`/products/${productId}/edit`);
  revalidatePath('/dashboard');

  return { ok: true, id: productId };
}

export async function updateProductPhotoAction(payload: z.infer<typeof updatePhotoSchema>): Promise<ActionResult> {
  const parsed = updatePhotoSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, error: 'Invalid photo payload' };
  }

  const ctx = await getOperatorContext();
  if ('error' in ctx) {
    return { ok: false, error: ctx.error };
  }

  if (!hasPermission(ctx.role, 'products', 'w')) {
    return { ok: false, error: 'Permission denied' };
  }

  const adminDb = createAdminClient() as any;

  const { data: existing } = await adminDb
    .from('products')
    .select('id')
    .eq('id', parsed.data.productId)
    .eq('operator_id', ctx.operatorId)
    .maybeSingle();

  if (!existing) {
    return { ok: false, error: 'Product not found' };
  }

  const { error: updateError } = await adminDb
    .from('products')
    .update({ photo_url: parsed.data.photoUrl })
    .eq('id', parsed.data.productId)
    .eq('operator_id', ctx.operatorId);

  if (updateError) {
    return { ok: false, error: 'Failed to update product photo' };
  }

  await adminDb.from('audit_log').insert({
    operator_id: ctx.operatorId,
    user_id: ctx.user.id,
    action: 'product.photo.updated',
    entity_type: 'products',
    entity_id: parsed.data.productId,
    payload: {
      photo_url: parsed.data.photoUrl,
    },
  });

  revalidatePath('/products');
  revalidatePath(`/products/${parsed.data.productId}/edit`);

  return { ok: true };
}

export async function createProductCategoryAction(payload: z.infer<typeof createCategorySchema>) {
  const parsed = createCategorySchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false as const, error: 'Invalid category input' };
  }

  const ctx = await getOperatorContext();
  if ('error' in ctx) {
    return { ok: false as const, error: ctx.error };
  }

  if (!hasPermission(ctx.role, 'products', 'w')) {
    return { ok: false as const, error: 'Permission denied' };
  }

  const adminDb = createAdminClient() as any;
  const categoryName = parsed.data.name.trim();
  const categoryColor = parsed.data.color ?? '#6B7280';

  const { data: existingCategory } = await adminDb
    .from('product_categories')
    .select('id, name, color')
    .eq('operator_id', ctx.operatorId)
    .ilike('name', categoryName)
    .maybeSingle();

  if (existingCategory) {
    return {
      ok: true as const,
      id: existingCategory.id as string,
      name: existingCategory.name as string,
      color: (existingCategory.color as string | null) ?? '#6B7280',
    };
  }

  const { data: lastCategory } = await adminDb
    .from('product_categories')
    .select('sort_order')
    .eq('operator_id', ctx.operatorId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextSortOrder = Number((lastCategory as { sort_order: number | null } | null)?.sort_order ?? 0) + 1;

  const { data: createdCategory, error: insertError } = await adminDb
    .from('product_categories')
    .insert({
      operator_id: ctx.operatorId,
      name: categoryName,
      color: categoryColor,
      sort_order: nextSortOrder,
    })
    .select('id, name, color')
    .single();

  if (insertError || !createdCategory?.id) {
    return { ok: false as const, error: 'Failed to create category' };
  }

  await adminDb.from('audit_log').insert({
    operator_id: ctx.operatorId,
    user_id: ctx.user.id,
    action: 'product_category.created',
    entity_type: 'product_categories',
    entity_id: createdCategory.id,
    payload: {
      name: createdCategory.name,
      color: createdCategory.color,
      sort_order: nextSortOrder,
    },
  });

  revalidatePath('/products');

  return {
    ok: true as const,
    id: createdCategory.id as string,
    name: createdCategory.name as string,
    color: (createdCategory.color as string | null) ?? '#6B7280',
  };
}

export async function archiveProduct(payload: z.infer<typeof archiveProductSchema>): Promise<ActionResult> {
  const parsed = archiveProductSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, error: 'Invalid product id' };
  }

  const ctx = await getOperatorContext();
  if ('error' in ctx) {
    return { ok: false, error: ctx.error };
  }

  if (!hasPermission(ctx.role, 'products', 'w')) {
    return { ok: false, error: 'Permission denied' };
  }

  const adminDb = createAdminClient() as any;

  const { data: product } = await adminDb
    .from('products')
    .select('id, name')
    .eq('id', parsed.data.productId)
    .eq('operator_id', ctx.operatorId)
    .maybeSingle();

  if (!product) {
    return { ok: false, error: 'Product not found' };
  }

  const { count: inMachineCount, error: countError } = await adminDb
    .from('rfid_items')
    .select('*', { count: 'exact', head: true })
    .eq('operator_id', ctx.operatorId)
    .eq('product_id', parsed.data.productId)
    .eq('status', 'in_machine');

  if (countError) {
    return { ok: false, error: 'Failed to validate inventory state' };
  }

  if ((inMachineCount ?? 0) > 0) {
    return {
      ok: false,
      error: `Cannot archive - ${inMachineCount} items currently in machines`,
    };
  }

  const { error: updateError } = await adminDb
    .from('products')
    .update({ status: 'archived' })
    .eq('id', parsed.data.productId)
    .eq('operator_id', ctx.operatorId);

  if (updateError) {
    return { ok: false, error: 'Failed to archive product' };
  }

  await adminDb.from('machine_product_prices').delete().eq('product_id', parsed.data.productId);

  await adminDb.from('audit_log').insert({
    operator_id: ctx.operatorId,
    user_id: ctx.user.id,
    action: 'product.archived',
    entity_type: 'products',
    entity_id: parsed.data.productId,
    payload: {
      name: product.name,
    },
  });

  revalidatePath('/products');
  revalidatePath(`/products/${parsed.data.productId}/edit`);

  return { ok: true, id: parsed.data.productId };
}

async function ensureCategoryId(
  adminDb: any,
  operatorId: string,
  cache: Map<string, string>,
  categoryName: string | null | undefined
): Promise<string | null> {
  const normalized = categoryName?.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  const cached = cache.get(normalized);
  if (cached) {
    return cached;
  }

  const { data: existing } = await adminDb
    .from('product_categories')
    .select('id')
    .eq('operator_id', operatorId)
    .ilike('name', categoryName?.trim() ?? '')
    .maybeSingle();

  if (existing?.id) {
    cache.set(normalized, existing.id);
    return existing.id as string;
  }

  const { data: lastCategory } = await adminDb
    .from('product_categories')
    .select('sort_order')
    .eq('operator_id', operatorId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextSortOrder = Number((lastCategory as { sort_order: number | null } | null)?.sort_order ?? 0) + 1;

  const { data: created, error: createError } = await adminDb
    .from('product_categories')
    .insert({
      operator_id: operatorId,
      name: categoryName?.trim(),
      color: '#6B7280',
      sort_order: nextSortOrder,
    })
    .select('id')
    .single();

  if (createError || !created?.id) {
    return null;
  }

  cache.set(normalized, created.id as string);
  return created.id as string;
}

export async function importProductsAction(payload: z.infer<typeof importProductsSchema>): Promise<ImportProductsResult> {
  const parsed = importProductsSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, error: 'Invalid import payload' };
  }

  const ctx = await getOperatorContext();
  if ('error' in ctx) {
    return { ok: false, error: ctx.error };
  }

  if (!hasPermission(ctx.role, 'products', 'w')) {
    return { ok: false, error: 'Permission denied' };
  }

  const adminDb = createAdminClient() as any;
  const skippedRows: ImportSkippedRow[] = [];
  let importedCount = 0;

  const { data: categories } = await adminDb.from('product_categories').select('id, name').eq('operator_id', ctx.operatorId);
  const categoryCache = new Map<string, string>();
  for (const category of (categories as Array<{ id: string; name: string }> | null) ?? []) {
    categoryCache.set(category.name.trim().toLowerCase(), category.id);
  }

  for (const row of parsed.data.rows) {
    try {
      const categoryId = await ensureCategoryId(adminDb, ctx.operatorId, categoryCache, row.category);

      const nutritional: Json = {
        calories: row.calories ?? undefined,
        protein: row.protein ?? undefined,
        totalFat: row.fat ?? undefined,
        totalCarbs: row.carbs ?? undefined,
      };

      const { error: insertError } = await adminDb.from('products').insert({
        operator_id: ctx.operatorId,
        name: row.name.trim(),
        sku: normalizeText(row.sku) ?? generateSku(),
        category_id: categoryId,
        description: normalizeText(row.description),
        base_price: roundCurrency(row.price),
        nutritional,
        allergens: normalizeAllergens(row.allergens ?? []),
        status: 'active',
      });

      if (insertError) {
        throw new Error(insertError.message);
      }

      importedCount += 1;
    } catch (error) {
      skippedRows.push({
        rowIndex: row.clientRowIndex ?? skippedRows.length + importedCount + 1,
        reason: error instanceof Error ? error.message : 'Insert failed',
        row,
      });
    }
  }

  await adminDb.from('audit_log').insert({
    operator_id: ctx.operatorId,
    user_id: ctx.user.id,
    action: 'product.imported',
    entity_type: 'products',
    payload: {
      imported_count: importedCount,
      skipped_count: skippedRows.length,
    },
  });

  revalidatePath('/products');

  return {
    ok: true,
    importedCount,
    skippedCount: skippedRows.length,
    skippedRows,
  };
}
