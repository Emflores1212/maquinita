'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { hasPermission, type UserRole } from '@/lib/permissions';
import { createAdminClient, createServerClient } from '@/lib/supabase';

const EPC_REGEX = /^[0-9A-F]{24}$/;

const scanRestockEpcSchema = z.object({
  sessionId: z.string().uuid(),
  machineId: z.string().uuid(),
  epc: z.string().min(1),
});

const assignUnknownRestockEpcSchema = z.object({
  sessionId: z.string().uuid(),
  machineId: z.string().uuid(),
  epc: z.string().min(1),
  productId: z.string().uuid(),
  tagType: z.string().trim().min(1).optional().nullable(),
});

const removalReasonSchema = z.enum(['expired', 'damaged', 'quality_issue', 'other']);

const restockRemovalSchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('epc'),
    epc: z.string().min(1),
    reason: removalReasonSchema,
    otherReason: z.string().trim().max(500).optional().nullable(),
  }),
  z.object({
    mode: z.literal('product'),
    productId: z.string().uuid(),
    quantity: z.number().int().min(1).max(500),
    reason: removalReasonSchema,
    otherReason: z.string().trim().max(500).optional().nullable(),
  }),
]);

const physicalCountSchema = z.object({
  productId: z.string().uuid(),
  expected: z.number().int().min(0),
  counted: z.number().int().min(0),
  status: z.enum(['matches_expected', 'correction', 'unconfirmed']),
});

const completeRestockSessionSchema = z.object({
  sessionId: z.string().uuid(),
  machineId: z.string().uuid(),
  addedEpcs: z.array(z.string().min(1)).max(500),
  removals: z.array(restockRemovalSchema).max(500),
  physicalCounts: z.array(physicalCountSchema).max(500),
  notes: z.string().trim().max(5000).optional().nullable(),
  photoPaths: z.array(z.string().trim().min(1)).max(20),
});

const transferItemSchema = z.object({
  epc: z.string().min(1),
  fromMachineId: z.string().uuid(),
  toMachineId: z.string().uuid(),
});

type OperatorContext =
  | { error: string }
  | {
      user: { id: string };
      operatorId: string;
      role: UserRole | null;
      assignedMachineIds: string[] | null;
    };

function normalizeEpc(value: string) {
  return value.replace(/\s+/g, '').toUpperCase();
}

function normalizeText(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function hasMachineAccess(ctx: Extract<OperatorContext, { operatorId: string }>, machineId: string) {
  if (ctx.role !== 'driver') return true;
  const assigned = ctx.assignedMachineIds ?? [];
  return assigned.includes(machineId);
}

async function getOperatorContext(): Promise<OperatorContext> {
  const supabase = createServerClient();
  const db = supabase;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: 'Not authenticated' };
  }

  const { data: profileData, error: profileError } = await db
    .from('profiles')
    .select('operator_id, role, assigned_machine_ids')
    .eq('id', user.id)
    .single();

  const profile = profileData as
    | {
        operator_id: string | null;
        role: UserRole | null;
        assigned_machine_ids: string[] | null;
      }
    | null;

  if (profileError || !profile?.operator_id) {
    return { error: 'Invalid profile context' };
  }

  return {
    user: { id: user.id },
    operatorId: profile.operator_id,
    role: profile.role,
    assignedMachineIds: profile.assigned_machine_ids ?? null,
  };
}

async function ensureRestockSessionAccess(
  adminDb: any,
  ctx: Extract<OperatorContext, { operatorId: string }>,
  sessionId: string,
  machineId: string,
  requireInProgress = true
) {
  const { data: sessionData } = await adminDb
    .from('restock_sessions')
    .select('id, operator_id, machine_id, status')
    .eq('id', sessionId)
    .eq('operator_id', ctx.operatorId)
    .maybeSingle();

  const session = sessionData as { id: string; operator_id: string; machine_id: string; status: string | null } | null;

  if (!session?.id || session.machine_id !== machineId) {
    return { ok: false as const, error: 'Restock session not found' };
  }

  if (requireInProgress && session.status !== 'in_progress') {
    return { ok: false as const, error: 'Restock session is no longer in progress' };
  }

  if (!hasMachineAccess(ctx, machineId)) {
    return { ok: false as const, error: 'Machine access denied' };
  }

  return { ok: true as const };
}

export async function scanRestockEpcAction(payload: z.infer<typeof scanRestockEpcSchema>) {
  const parsed = scanRestockEpcSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false as const, error: 'Invalid scan payload' };
  }

  const ctx = await getOperatorContext();
  if ('error' in ctx) return { ok: false as const, error: ctx.error };
  if (!hasPermission(ctx.role, 'restock', 'w')) {
    return { ok: false as const, error: 'Permission denied' };
  }

  const epc = normalizeEpc(parsed.data.epc);
  if (!EPC_REGEX.test(epc)) {
    return { ok: false as const, error: 'Invalid EPC format' };
  }

  const adminDb = createAdminClient();
  const sessionAccess = await ensureRestockSessionAccess(adminDb, ctx, parsed.data.sessionId, parsed.data.machineId);
  if (!sessionAccess.ok) return sessionAccess;

  const { data: itemData } = await adminDb
    .from('rfid_items')
    .select('epc, product_id, machine_id, status')
    .eq('epc', epc)
    .eq('operator_id', ctx.operatorId)
    .maybeSingle();

  const item = itemData as
    | {
        epc: string;
        product_id: string | null;
        machine_id: string | null;
        status: string | null;
      }
    | null;

  if (!item) {
    return { ok: false as const, type: 'not_found' as const, epc };
  }

  if (item.status === 'in_machine') {
    if (item.machine_id === parsed.data.machineId) {
      return { ok: false as const, type: 'already_in_machine' as const, epc };
    }

    let machineName: string | null = null;
    if (item.machine_id) {
      const { data: machineData } = await adminDb.from('machines').select('name').eq('id', item.machine_id).maybeSingle();
      machineName = (machineData as { name?: string } | null)?.name ?? null;
    }

    return {
      ok: false as const,
      type: 'in_other_machine' as const,
      epc,
      machineName,
    };
  }

  let product: { id: string; name: string; photo_url: string | null } | null = null;
  if (item.product_id) {
    const { data: productData } = await adminDb
      .from('products')
      .select('id, name, photo_url')
      .eq('id', item.product_id)
      .eq('operator_id', ctx.operatorId)
      .maybeSingle();
    product = (productData as { id: string; name: string; photo_url: string | null } | null) ?? null;
  }

  return {
    ok: true as const,
    epc,
    productId: product?.id ?? null,
    productName: product?.name ?? null,
    productPhotoUrl: product?.photo_url ?? null,
  };
}

export async function assignUnknownRestockEpcAction(payload: z.infer<typeof assignUnknownRestockEpcSchema>) {
  const parsed = assignUnknownRestockEpcSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false as const, error: 'Invalid assign payload' };
  }

  const ctx = await getOperatorContext();
  if ('error' in ctx) return { ok: false as const, error: ctx.error };
  if (!hasPermission(ctx.role, 'restock', 'w')) {
    return { ok: false as const, error: 'Permission denied' };
  }

  const epc = normalizeEpc(parsed.data.epc);
  if (!EPC_REGEX.test(epc)) {
    return { ok: false as const, error: 'Invalid EPC format' };
  }

  const adminDb = createAdminClient();
  const sessionAccess = await ensureRestockSessionAccess(adminDb, ctx, parsed.data.sessionId, parsed.data.machineId);
  if (!sessionAccess.ok) return sessionAccess;

  const { data: productData } = await adminDb
    .from('products')
    .select('id, name, photo_url')
    .eq('id', parsed.data.productId)
    .eq('operator_id', ctx.operatorId)
    .eq('status', 'active')
    .maybeSingle();

  const product = (productData as { id: string; name: string; photo_url: string | null } | null) ?? null;
  if (!product?.id) {
    return { ok: false as const, error: 'Product not found or inactive' };
  }

  const { data: existingData } = await adminDb
    .from('rfid_items')
    .select('epc, operator_id, machine_id, status')
    .eq('epc', epc)
    .maybeSingle();

  const existing = existingData as
    | {
        epc: string;
        operator_id: string | null;
        machine_id: string | null;
        status: string | null;
      }
    | null;

  if (existing && existing.operator_id !== ctx.operatorId) {
    return { ok: false as const, error: 'EPC belongs to another operator' };
  }

  if (existing?.status === 'in_machine' && existing.machine_id && existing.machine_id !== parsed.data.machineId) {
    return { ok: false as const, error: 'EPC is currently in another machine' };
  }

  const tagType = normalizeText(parsed.data.tagType);

  if (existing?.epc) {
    const { error: updateError } = await adminDb
      .from('rfid_items')
      .update({
        product_id: parsed.data.productId,
        tag_type: tagType,
        status: 'available',
        machine_id: null,
        restocked_at: new Date().toISOString(),
        restocked_by: ctx.user.id,
      })
      .eq('epc', epc)
      .eq('operator_id', ctx.operatorId);

    if (updateError) {
      return { ok: false as const, error: 'Failed to assign EPC' };
    }
  } else {
    const { error: insertError } = await adminDb.from('rfid_items').insert({
      epc,
      operator_id: ctx.operatorId,
      product_id: parsed.data.productId,
      status: 'available',
      machine_id: null,
      tag_type: tagType,
      restocked_at: new Date().toISOString(),
      restocked_by: ctx.user.id,
    });

    if (insertError) {
      return { ok: false as const, error: 'Failed to create EPC assignment' };
    }
  }

  return {
    ok: true as const,
    epc,
    productId: product.id,
    productName: product.name,
    productPhotoUrl: product.photo_url,
  };
}

export async function completeRestockSessionAction(payload: z.infer<typeof completeRestockSessionSchema>) {
  const parsed = completeRestockSessionSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false as const, error: 'Invalid complete payload' };
  }

  const ctx = await getOperatorContext();
  if ('error' in ctx) return { ok: false as const, error: ctx.error };
  if (!hasPermission(ctx.role, 'restock', 'w')) {
    return { ok: false as const, error: 'Permission denied' };
  }

  const adminDb = createAdminClient();
  const sessionAccess = await ensureRestockSessionAccess(adminDb, ctx, parsed.data.sessionId, parsed.data.machineId);
  if (!sessionAccess.ok) return sessionAccess;

  const addedEpcs = Array.from(
    new Set(
      parsed.data.addedEpcs
        .map((value) => normalizeEpc(value))
        .filter((value) => value.length > 0 && EPC_REGEX.test(value))
    )
  );

  const additionsByEpc = new Map<string, { epc: string; product_id: string | null }>();

  if (addedEpcs.length > 0) {
    const { data: existingAddedData, error: existingAddedError } = await adminDb
      .from('rfid_items')
      .select('epc, product_id')
      .eq('operator_id', ctx.operatorId)
      .in('epc', addedEpcs);

    if (existingAddedError) {
      return { ok: false as const, error: 'Failed to resolve scanned EPCs' };
    }

    const existingAdded = (existingAddedData as Array<{ epc: string; product_id: string | null }> | null) ?? [];
    for (const row of existingAdded) additionsByEpc.set(row.epc, row);

    const missingEpcs = addedEpcs.filter((epc) => !additionsByEpc.has(epc));
    if (missingEpcs.length > 0) {
      return { ok: false as const, error: `Unknown EPCs in session: ${missingEpcs.slice(0, 5).join(', ')}` };
    }

    const { error: updateAddedError } = await adminDb
      .from('rfid_items')
      .update({
        status: 'in_machine',
        machine_id: parsed.data.machineId,
        restocked_at: new Date().toISOString(),
        restocked_by: ctx.user.id,
      })
      .eq('operator_id', ctx.operatorId)
      .in('epc', addedEpcs);

    if (updateAddedError) {
      return { ok: false as const, error: 'Failed to move scanned EPCs into machine inventory' };
    }
  }

  const productIdsFromAdded = Array.from(
    new Set(Array.from(additionsByEpc.values()).map((value) => value.product_id).filter(Boolean))
  ) as string[];

  const removedRecords: Array<{
    mode: 'epc' | 'product';
    epc: string | null;
    productId: string | null;
    quantity: number;
    reason: z.infer<typeof removalReasonSchema>;
    otherReason: string | null;
  }> = [];

  for (const removal of parsed.data.removals) {
    if (removal.mode === 'epc') {
      const epc = normalizeEpc(removal.epc);
      if (!EPC_REGEX.test(epc)) continue;

      const { data: rowData } = await adminDb
        .from('rfid_items')
        .select('epc, product_id')
        .eq('operator_id', ctx.operatorId)
        .eq('epc', epc)
        .eq('machine_id', parsed.data.machineId)
        .eq('status', 'in_machine')
        .maybeSingle();

      const row = rowData as { epc: string; product_id: string | null } | null;
      if (!row?.epc) continue;

      const { error: updateError } = await adminDb
        .from('rfid_items')
        .update({
          status: 'discarded',
          machine_id: null,
          sold_at: null,
        })
        .eq('operator_id', ctx.operatorId)
        .eq('epc', epc)
        .eq('machine_id', parsed.data.machineId);

      if (updateError) {
        return { ok: false as const, error: 'Failed to discard EPC removal' };
      }

      removedRecords.push({
        mode: 'epc',
        epc,
        productId: row.product_id,
        quantity: 1,
        reason: removal.reason,
        otherReason: normalizeText(removal.otherReason),
      });

      continue;
    }

    const { data: rowsData, error: rowsError } = await adminDb
      .from('rfid_items')
      .select('epc, product_id')
      .eq('operator_id', ctx.operatorId)
      .eq('machine_id', parsed.data.machineId)
      .eq('product_id', removal.productId)
      .eq('status', 'in_machine')
      .limit(removal.quantity);

    if (rowsError) {
      return { ok: false as const, error: 'Failed to resolve product removal rows' };
    }

    const rows = (rowsData as Array<{ epc: string; product_id: string | null }> | null) ?? [];
    if (rows.length === 0) continue;

    const epcs = rows.map((row) => row.epc);
    const { error: updateError } = await adminDb
      .from('rfid_items')
      .update({
        status: 'discarded',
        machine_id: null,
        sold_at: null,
      })
      .eq('operator_id', ctx.operatorId)
      .eq('machine_id', parsed.data.machineId)
      .in('epc', epcs);

    if (updateError) {
      return { ok: false as const, error: 'Failed to apply product removal' };
    }

    removedRecords.push({
      mode: 'product',
      epc: null,
      productId: removal.productId,
      quantity: rows.length,
      reason: removal.reason,
      otherReason: normalizeText(removal.otherReason),
    });
  }

  const productIdsFromRemoved = removedRecords
    .map((row) => row.productId)
    .filter((value): value is string => Boolean(value));
  const allProductIds = Array.from(new Set([...productIdsFromAdded, ...productIdsFromRemoved]));

  const productNameById = new Map<string, string>();
  if (allProductIds.length > 0) {
    const { data: productRows } = await adminDb.from('products').select('id, name').in('id', allProductIds);
    for (const row of (productRows as Array<{ id: string; name: string }> | null) ?? []) {
      productNameById.set(row.id, row.name);
    }
  }

  const itemsAddedJson = Array.from(additionsByEpc.values()).map((row) => ({
    epc: row.epc,
    productId: row.product_id,
    productName: row.product_id ? productNameById.get(row.product_id) ?? null : null,
  }));

  const itemsRemovedJson = removedRecords.map((row) => ({
    mode: row.mode,
    epc: row.epc,
    productId: row.productId,
    productName: row.productId ? productNameById.get(row.productId) ?? null : null,
    quantity: row.quantity,
    reason: row.reason,
    otherReason: row.otherReason,
  }));

  const physicalCountsJson = parsed.data.physicalCounts.map((row) => ({
    productId: row.productId,
    productName: productNameById.get(row.productId) ?? null,
    expected: row.expected,
    counted: row.counted,
    status: row.status,
  }));

  const discrepancyCount = parsed.data.physicalCounts.reduce((sum, row) => {
    if (row.status === 'unconfirmed') return sum;
    return sum + Math.abs(row.expected - row.counted);
  }, 0);

  const { data: machineItemsData } = await adminDb
    .from('rfid_items')
    .select('product_id')
    .eq('operator_id', ctx.operatorId)
    .eq('machine_id', parsed.data.machineId)
    .eq('status', 'in_machine');

  const countByProduct = new Map<string, number>();
  for (const row of (machineItemsData as Array<{ product_id: string | null }> | null) ?? []) {
    if (!row.product_id) continue;
    countByProduct.set(row.product_id, (countByProduct.get(row.product_id) ?? 0) + 1);
  }

  const { data: parRowsData } = await adminDb
    .from('par_levels')
    .select('product_id, quantity')
    .eq('machine_id', parsed.data.machineId);

  const belowPar = ((parRowsData as Array<{ product_id: string; quantity: number }> | null) ?? [])
    .filter((row) => (countByProduct.get(row.product_id) ?? 0) < Number(row.quantity ?? 0))
    .map((row) => ({
      productId: row.product_id,
      productName: productNameById.get(row.product_id) ?? row.product_id,
      current: countByProduct.get(row.product_id) ?? 0,
      par: Number(row.quantity ?? 0),
    }));

  const { error: updateSessionError } = await adminDb
    .from('restock_sessions')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      items_added: itemsAddedJson,
      items_removed: itemsRemovedJson,
      physical_counts: physicalCountsJson,
      notes: normalizeText(parsed.data.notes),
      photo_urls: parsed.data.photoPaths,
      discrepancy_count: discrepancyCount,
    })
    .eq('id', parsed.data.sessionId)
    .eq('operator_id', ctx.operatorId);

  if (updateSessionError) {
    return { ok: false as const, error: 'Failed to complete restock session' };
  }

  await adminDb.from('audit_log').insert({
    operator_id: ctx.operatorId,
    user_id: ctx.user.id,
    action: 'restock.completed',
    entity_type: 'restock_sessions',
    entity_id: parsed.data.sessionId,
    payload: {
      session_id: parsed.data.sessionId,
      machine_id: parsed.data.machineId,
      added_count: itemsAddedJson.length,
      removed_count: itemsRemovedJson.reduce((sum, row) => sum + Number(row.quantity ?? 0), 0),
      discrepancy_count: discrepancyCount,
    },
  });

  revalidatePath('/restock');
  revalidatePath('/restock/picklist');
  revalidatePath('/inventory');
  revalidatePath('/inventory/activity');
  revalidatePath(`/machines/${parsed.data.machineId}`);

  return {
    ok: true as const,
    addedCount: itemsAddedJson.length,
    removedCount: itemsRemovedJson.reduce((sum, row) => sum + Number(row.quantity ?? 0), 0),
    discrepancyCount,
    belowPar,
  };
}

export async function transferItemAction(payload: z.infer<typeof transferItemSchema>) {
  const parsed = transferItemSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false as const, error: 'Invalid transfer payload' };
  }

  const ctx = await getOperatorContext();
  if ('error' in ctx) return { ok: false as const, error: ctx.error };

  const canTransfer = hasPermission(ctx.role, 'inventory', 'w') || hasPermission(ctx.role, 'restock', 'w');
  if (!canTransfer) {
    return { ok: false as const, error: 'Permission denied' };
  }

  if (parsed.data.fromMachineId === parsed.data.toMachineId) {
    return { ok: false as const, error: 'Source and destination machine cannot be the same' };
  }

  if (!hasMachineAccess(ctx, parsed.data.fromMachineId) || !hasMachineAccess(ctx, parsed.data.toMachineId)) {
    return { ok: false as const, error: 'Machine access denied' };
  }

  const adminDb = createAdminClient();
  const epc = normalizeEpc(parsed.data.epc);
  if (!EPC_REGEX.test(epc)) {
    return { ok: false as const, error: 'Invalid EPC format' };
  }

  const { data: fromMachine } = await adminDb
    .from('machines')
    .select('id')
    .eq('id', parsed.data.fromMachineId)
    .eq('operator_id', ctx.operatorId)
    .maybeSingle();
  const { data: toMachine } = await adminDb
    .from('machines')
    .select('id')
    .eq('id', parsed.data.toMachineId)
    .eq('operator_id', ctx.operatorId)
    .maybeSingle();

  if (!fromMachine?.id || !toMachine?.id) {
    return { ok: false as const, error: 'Machine not found' };
  }

  const { data: updateRows, error: updateError } = await adminDb
    .from('rfid_items')
    .update({
      machine_id: parsed.data.toMachineId,
      status: 'in_machine',
      restocked_at: new Date().toISOString(),
      restocked_by: ctx.user.id,
    })
    .eq('operator_id', ctx.operatorId)
    .eq('epc', epc)
    .eq('machine_id', parsed.data.fromMachineId)
    .select('epc');

  if (updateError) {
    return { ok: false as const, error: 'Failed to transfer item' };
  }

  if (!updateRows || updateRows.length === 0) {
    return { ok: false as const, error: 'EPC not found in source machine' };
  }

  await adminDb.from('audit_log').insert({
    operator_id: ctx.operatorId,
    user_id: ctx.user.id,
    action: 'item.transferred',
    entity_type: 'rfid_items',
    entity_id: epc,
    payload: {
      epc,
      from: parsed.data.fromMachineId,
      to: parsed.data.toMachineId,
    },
  });

  revalidatePath('/inventory');
  revalidatePath('/inventory/activity');
  revalidatePath('/restock');
  revalidatePath(`/machines/${parsed.data.fromMachineId}`);
  revalidatePath(`/machines/${parsed.data.toMachineId}`);

  return { ok: true as const };
}
