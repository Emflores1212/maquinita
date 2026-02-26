'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { hasPermission, type UserRole } from '@/lib/permissions';
import { createAdminClient, createServerClient } from '@/lib/supabase';

const EPC_REGEX = /^[0-9A-F]{24}$/;
const QUANTITY_OPTIONS = [100, 250, 500, 1000, 2500] as const;

const processEpcSchema = z.object({
  epc: z.string().min(1),
  productId: z.string().uuid(),
  tagType: z.string().min(1),
  expirationDate: z.string().optional().nullable(),
});

const repurposeTagSchema = z.object({
  epc: z.string().min(1),
  productId: z.string().uuid(),
  tagType: z.string().optional().nullable(),
  expirationDate: z.string().optional().nullable(),
});

const lookupTagSchema = z.object({
  epc: z.string().min(1),
});

const detachedResolveSchema = z
  .object({
    epc: z.string().min(1),
    option: z.enum(['same', 'different', 'lost']),
    newProductId: z.string().uuid().optional().nullable(),
  })
  .refine((value) => value.option !== 'different' || Boolean(value.newProductId), {
    message: 'newProductId is required',
    path: ['newProductId'],
  });

const createTagOrderSchema = z.object({
  tagType: z.string().min(1),
  quantity: z.union([z.literal(100), z.literal(250), z.literal(500), z.literal(1000), z.literal(2500)]),
  shippingAddress: z.object({
    line1: z.string().min(1),
    line2: z.string().optional().nullable(),
    city: z.string().min(1),
    state: z.string().min(1),
    postalCode: z.string().min(1),
    country: z.string().min(1),
    contactName: z.string().optional().nullable(),
    phone: z.string().optional().nullable(),
  }),
  notes: z.string().optional().nullable(),
});

const compareInventorySchema = z.object({
  machineId: z.string().uuid(),
  scannedEpcs: z.array(z.string()),
});

const markLostSchema = z.object({
  machineId: z.string().uuid(),
  epc: z.string().min(1),
});

const registerUnexpectedSchema = z.object({
  machineId: z.string().uuid(),
  epc: z.string().min(1),
});

type ActionResult = {
  ok: boolean;
  error?: string;
};

type OperatorContext =
  | {
      error: string;
    }
  | {
      user: { id: string; email: string | null };
      operatorId: string;
      role: UserRole | null;
    };

type InventoryDiffRow = {
  epc: string;
  productName: string | null;
  status: string | null;
};

type UnexpectedRow = InventoryDiffRow & {
  knownInSystem: boolean;
};

type CompareResult = ActionResult & {
  missing?: InventoryDiffRow[];
  unexpected?: UnexpectedRow[];
  expectedCount?: number;
  scannedCount?: number;
};

function normalizeEpc(value: string): string {
  return value.replace(/\s+/g, '').toUpperCase();
}

function parseDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed;
}

function normalizeText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
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
    .select('operator_id, role')
    .eq('id', user.id)
    .single();

  const profile = profileData as { operator_id: string | null; role: UserRole | null } | null;

  if (profileError || !profile?.operator_id) {
    return { error: 'Invalid profile context' };
  }

  return {
    user: { id: user.id, email: user.email ?? null },
    operatorId: profile.operator_id,
    role: profile.role,
  };
}

async function getProductName(adminDb: any, productId: string | null): Promise<string | null> {
  if (!productId) return null;
  const { data: productData } = await adminDb.from('products').select('name').eq('id', productId).maybeSingle();
  return (productData as { name?: string } | null)?.name ?? null;
}

async function getMachineName(adminDb: any, machineId: string | null): Promise<string | null> {
  if (!machineId) return null;
  const { data: machineData } = await adminDb.from('machines').select('name').eq('id', machineId).maybeSingle();
  return (machineData as { name?: string } | null)?.name ?? null;
}

async function sendTagOrderConfirmationEmail(input: {
  recipient: string | null;
  tagType: string;
  quantity: number;
  orderId: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.TAG_ORDER_NOTIFICATION_EMAIL || input.recipient;
  if (!apiKey || !to) {
    return { sent: false as const };
  }

  const from = process.env.RESEND_FROM_EMAIL || 'Maquinita <no-reply@maquinita.app>';

  const payload = {
    from,
    to: [to],
    subject: `Tag order ${input.orderId} received`,
    html: `<p>Tag order received.</p><p>Order ID: <strong>${input.orderId}</strong></p><p>Type: ${input.tagType}</p><p>Quantity: ${input.quantity}</p>`,
  };

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
    });

    if (!response.ok) {
      return { sent: false as const };
    }

    return { sent: true as const };
  } catch {
    return { sent: false as const };
  }
}

export async function processScannedEpcAction(payload: z.infer<typeof processEpcSchema>) {
  const parsed = processEpcSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false as const, error: 'Invalid scan payload' };
  }

  const normalizedEpc = normalizeEpc(parsed.data.epc);
  if (!EPC_REGEX.test(normalizedEpc)) {
    return { ok: false as const, error: 'Invalid EPC format. Must be 24-char hex.' };
  }

  const ctx = await getOperatorContext();
  if ('error' in ctx) {
    return { ok: false as const, error: ctx.error };
  }
  if (!hasPermission(ctx.role, 'inventory', 'w')) {
    return { ok: false as const, error: 'Permission denied' };
  }

  const adminDb = createAdminClient();

  const { data: productData } = await adminDb
    .from('products')
    .select('id, name')
    .eq('id', parsed.data.productId)
    .eq('operator_id', ctx.operatorId)
    .eq('status', 'active')
    .maybeSingle();

  if (!productData?.id) {
    return { ok: false as const, error: 'Product not found or inactive' };
  }

  const { data: existing } = await adminDb
    .from('rfid_items')
    .select('epc, status, machine_id, product_id')
    .eq('epc', normalizedEpc)
    .eq('operator_id', ctx.operatorId)
    .maybeSingle();

  const expirationDate = parseDate(parsed.data.expirationDate);
  const tagType = normalizeText(parsed.data.tagType);

  if (existing) {
    if (existing.status === 'in_machine') {
      const machineName = await getMachineName(adminDb, existing.machine_id as string | null);
      return {
        ok: false as const,
        type: 'in_machine' as const,
        machineName,
        error: `Tag already in machine${machineName ? `: ${machineName}` : ''}`,
      };
    }

    if (existing.status === 'sold' || existing.status === 'discarded') {
      const previousProductName = await getProductName(adminDb, existing.product_id as string | null);
      return {
        ok: false as const,
        type: 'needs_repurpose' as const,
        previousProductName,
        error: 'Tag requires repurpose before assignment',
      };
    }

    const { error: updateError } = await adminDb
      .from('rfid_items')
      .update({
        product_id: parsed.data.productId,
        tag_type: tagType,
        expiration_date: expirationDate,
        status: 'available',
        machine_id: null,
        sold_at: null,
        restocked_at: new Date().toISOString(),
        restocked_by: ctx.user.id,
      })
      .eq('epc', normalizedEpc)
      .eq('operator_id', ctx.operatorId);

    if (updateError) {
      return { ok: false as const, error: 'Failed to update existing EPC' };
    }

    await adminDb.from('audit_log').insert({
      operator_id: ctx.operatorId,
      user_id: ctx.user.id,
      action: 'rfid.assigned.updated',
      entity_type: 'rfid_items',
      entity_id: normalizedEpc,
      payload: {
        epc: normalizedEpc,
        product_id: parsed.data.productId,
        tag_type: tagType,
      },
    });

    revalidatePath('/inventory/tags');

    return {
      ok: true as const,
      type: 'updated' as const,
      epc: normalizedEpc,
      productName: productData.name as string,
    };
  }

  const { error: insertError } = await adminDb.from('rfid_items').insert({
    epc: normalizedEpc,
    operator_id: ctx.operatorId,
    product_id: parsed.data.productId,
    tag_type: tagType,
    expiration_date: expirationDate,
    status: 'available',
    restocked_at: new Date().toISOString(),
    restocked_by: ctx.user.id,
  });

  if (insertError) {
    return { ok: false as const, error: 'Failed to create EPC assignment' };
  }

  await adminDb.from('audit_log').insert({
    operator_id: ctx.operatorId,
    user_id: ctx.user.id,
    action: 'rfid.assigned.created',
    entity_type: 'rfid_items',
    entity_id: normalizedEpc,
    payload: {
      epc: normalizedEpc,
      product_id: parsed.data.productId,
      tag_type: tagType,
    },
  });

  revalidatePath('/inventory/tags');

  return {
    ok: true as const,
    type: 'created' as const,
    epc: normalizedEpc,
    productName: productData.name as string,
  };
}

export async function repurposeTagAction(payload: z.infer<typeof repurposeTagSchema>) {
  const parsed = repurposeTagSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false as const, error: 'Invalid repurpose payload' };
  }

  const normalizedEpc = normalizeEpc(parsed.data.epc);
  if (!EPC_REGEX.test(normalizedEpc)) {
    return { ok: false as const, error: 'Invalid EPC format' };
  }

  const ctx = await getOperatorContext();
  if ('error' in ctx) {
    return { ok: false as const, error: ctx.error };
  }
  if (!hasPermission(ctx.role, 'inventory', 'w')) {
    return { ok: false as const, error: 'Permission denied' };
  }

  const adminDb = createAdminClient();

  const { data: existing } = await adminDb
    .from('rfid_items')
    .select('epc, status')
    .eq('epc', normalizedEpc)
    .eq('operator_id', ctx.operatorId)
    .maybeSingle();

  if (!existing) {
    return { ok: false as const, error: 'EPC not found' };
  }

  if (existing.status === 'in_machine') {
    return { ok: false as const, error: 'Cannot repurpose while tag is in machine' };
  }

  const { data: productData } = await adminDb
    .from('products')
    .select('id, name')
    .eq('id', parsed.data.productId)
    .eq('operator_id', ctx.operatorId)
    .eq('status', 'active')
    .maybeSingle();

  if (!productData?.id) {
    return { ok: false as const, error: 'Target product not found' };
  }

  const { error: updateError } = await adminDb
    .from('rfid_items')
    .update({
      product_id: parsed.data.productId,
      tag_type: normalizeText(parsed.data.tagType),
      expiration_date: parseDate(parsed.data.expirationDate),
      status: 'available',
      machine_id: null,
      sold_at: null,
      restocked_at: new Date().toISOString(),
      restocked_by: ctx.user.id,
    })
    .eq('epc', normalizedEpc)
    .eq('operator_id', ctx.operatorId);

  if (updateError) {
    return { ok: false as const, error: 'Failed to repurpose EPC' };
  }

  await adminDb.from('audit_log').insert({
    operator_id: ctx.operatorId,
    user_id: ctx.user.id,
    action: 'rfid.repurposed',
    entity_type: 'rfid_items',
    entity_id: normalizedEpc,
    payload: {
      epc: normalizedEpc,
      new_product_id: parsed.data.productId,
    },
  });

  revalidatePath('/inventory/tags');

  return {
    ok: true as const,
    productName: productData.name as string,
  };
}

export async function lookupDetachedTagAction(payload: z.infer<typeof lookupTagSchema>) {
  const parsed = lookupTagSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false as const, error: 'Invalid lookup payload' };
  }

  const normalizedEpc = normalizeEpc(parsed.data.epc);
  if (!EPC_REGEX.test(normalizedEpc)) {
    return { ok: false as const, error: 'Invalid EPC format' };
  }

  const ctx = await getOperatorContext();
  if ('error' in ctx) {
    return { ok: false as const, error: ctx.error };
  }
  if (!hasPermission(ctx.role, 'inventory', 'w')) {
    return { ok: false as const, error: 'Permission denied' };
  }

  const adminDb = createAdminClient();

  const { data: item } = await adminDb
    .from('rfid_items')
    .select('epc, product_id, machine_id, status')
    .eq('epc', normalizedEpc)
    .eq('operator_id', ctx.operatorId)
    .maybeSingle();

  if (!item) {
    return { ok: false as const, error: 'Tag not found' };
  }

  const [productName, machineName, productPhoto] = await Promise.all([
    getProductName(adminDb, item.product_id as string | null),
    getMachineName(adminDb, item.machine_id as string | null),
    (async () => {
      if (!item.product_id) return null;
      const { data: productData } = await adminDb.from('products').select('photo_url').eq('id', item.product_id).maybeSingle();
      return (productData as { photo_url?: string | null } | null)?.photo_url ?? null;
    })(),
  ]);

  return {
    ok: true as const,
    item: {
      epc: normalizedEpc,
      productId: (item.product_id as string | null) ?? null,
      productName,
      productPhoto,
      machineName,
      status: (item.status as string | null) ?? null,
    },
  };
}

export async function resolveDetachedTagAction(payload: z.infer<typeof detachedResolveSchema>) {
  const parsed = detachedResolveSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false as const, error: 'Invalid detached resolution payload' };
  }

  const normalizedEpc = normalizeEpc(parsed.data.epc);
  if (!EPC_REGEX.test(normalizedEpc)) {
    return { ok: false as const, error: 'Invalid EPC format' };
  }

  const ctx = await getOperatorContext();
  if ('error' in ctx) {
    return { ok: false as const, error: ctx.error };
  }
  if (!hasPermission(ctx.role, 'inventory', 'w')) {
    return { ok: false as const, error: 'Permission denied' };
  }

  const adminDb = createAdminClient();

  const { data: item } = await adminDb
    .from('rfid_items')
    .select('epc, product_id')
    .eq('epc', normalizedEpc)
    .eq('operator_id', ctx.operatorId)
    .maybeSingle();

  if (!item) {
    return { ok: false as const, error: 'Tag not found' };
  }

  let nextStatus: 'available' | 'lost' = 'available';
  let nextProductId = (item.product_id as string | null) ?? null;

  if (parsed.data.option === 'lost') {
    nextStatus = 'lost';
  }

  if (parsed.data.option === 'different') {
    nextProductId = parsed.data.newProductId ?? null;
    if (!nextProductId) {
      return { ok: false as const, error: 'newProductId is required' };
    }

    const { data: productData } = await adminDb
      .from('products')
      .select('id')
      .eq('id', nextProductId)
      .eq('operator_id', ctx.operatorId)
      .eq('status', 'active')
      .maybeSingle();

    if (!productData?.id) {
      return { ok: false as const, error: 'New product not found' };
    }
  }

  const { error: updateError } = await adminDb
    .from('rfid_items')
    .update({
      status: nextStatus,
      machine_id: null,
      product_id: nextProductId,
      sold_at: null,
      restocked_at: new Date().toISOString(),
      restocked_by: ctx.user.id,
    })
    .eq('epc', normalizedEpc)
    .eq('operator_id', ctx.operatorId);

  if (updateError) {
    return { ok: false as const, error: 'Failed to update detached tag' };
  }

  await adminDb.from('audit_log').insert({
    operator_id: ctx.operatorId,
    user_id: ctx.user.id,
    action: 'rfid.detached.resolved',
    entity_type: 'rfid_items',
    entity_id: normalizedEpc,
    payload: {
      epc: normalizedEpc,
      option: parsed.data.option,
      new_product_id: parsed.data.newProductId ?? null,
      status: nextStatus,
    },
  });

  revalidatePath('/inventory/tags');

  return { ok: true as const };
}

export async function createTagOrderAction(payload: z.infer<typeof createTagOrderSchema>) {
  const parsed = createTagOrderSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false as const, error: 'Invalid tag order payload' };
  }

  if (!QUANTITY_OPTIONS.includes(parsed.data.quantity)) {
    return { ok: false as const, error: 'Invalid quantity option' };
  }

  const ctx = await getOperatorContext();
  if ('error' in ctx) {
    return { ok: false as const, error: ctx.error };
  }
  if (!hasPermission(ctx.role, 'inventory', 'w')) {
    return { ok: false as const, error: 'Permission denied' };
  }

  const adminDb = createAdminClient();

  const { data: orderData, error: insertError } = await adminDb
    .from('tag_orders')
    .insert({
      operator_id: ctx.operatorId,
      tag_type: parsed.data.tagType,
      quantity: parsed.data.quantity,
      shipping_address: parsed.data.shippingAddress,
      notes: normalizeText(parsed.data.notes),
      status: 'pending',
    })
    .select('id')
    .single();

  if (insertError || !orderData?.id) {
    return { ok: false as const, error: 'Failed to create tag order' };
  }

  const emailResult = await sendTagOrderConfirmationEmail({
    recipient: ctx.user.email,
    tagType: parsed.data.tagType,
    quantity: parsed.data.quantity,
    orderId: orderData.id,
  });

  await adminDb.from('audit_log').insert({
    operator_id: ctx.operatorId,
    user_id: ctx.user.id,
    action: 'tag_order.created',
    entity_type: 'tag_orders',
    entity_id: orderData.id,
    payload: {
      tag_type: parsed.data.tagType,
      quantity: parsed.data.quantity,
      email_sent: emailResult.sent,
    },
  });

  revalidatePath('/inventory/tags');

  return {
    ok: true as const,
    id: orderData.id as string,
    emailSent: emailResult.sent,
  };
}

export async function compareInventoryAction(payload: z.infer<typeof compareInventorySchema>): Promise<CompareResult> {
  const parsed = compareInventorySchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, error: 'Invalid compare payload' };
  }

  const ctx = await getOperatorContext();
  if ('error' in ctx) {
    return { ok: false, error: ctx.error };
  }
  if (!hasPermission(ctx.role, 'inventory', 'w')) {
    return { ok: false, error: 'Permission denied' };
  }

  const adminDb = createAdminClient();

  const { data: machineData } = await adminDb
    .from('machines')
    .select('id')
    .eq('id', parsed.data.machineId)
    .eq('operator_id', ctx.operatorId)
    .maybeSingle();

  if (!machineData?.id) {
    return { ok: false, error: 'Machine not found' };
  }

  const { data: expectedRows } = await adminDb
    .from('rfid_items')
    .select('epc, product_id, status')
    .eq('operator_id', ctx.operatorId)
    .eq('machine_id', parsed.data.machineId)
    .eq('status', 'in_machine');

  const expected = (expectedRows as Array<{ epc: string; product_id: string | null; status: string | null }> | null) ?? [];
  const expectedMap = new Map(expected.map((row) => [row.epc, row]));
  const scannedUnique = Array.from(
    new Set(
      parsed.data.scannedEpcs
        .map((item) => normalizeEpc(item))
        .filter((epc) => EPC_REGEX.test(epc))
    )
  );

  const missingRowsBase = expected.filter((row) => !scannedUnique.includes(row.epc));
  const unexpectedEpcs = scannedUnique.filter((epc) => !expectedMap.has(epc));

  const missing: InventoryDiffRow[] = [];
  for (const row of missingRowsBase) {
    missing.push({
      epc: row.epc,
      status: row.status,
      productName: await getProductName(adminDb, row.product_id),
    });
  }

  let unexpected: UnexpectedRow[] = [];

  if (unexpectedEpcs.length > 0) {
    const { data: knownRows } = await adminDb
      .from('rfid_items')
      .select('epc, product_id, status')
      .eq('operator_id', ctx.operatorId)
      .in('epc', unexpectedEpcs);

    const knownMap = new Map(
      ((knownRows as Array<{ epc: string; product_id: string | null; status: string | null }> | null) ?? []).map((row) => [
        row.epc,
        row,
      ])
    );

    unexpected = [];
    for (const epc of unexpectedEpcs) {
      const known = knownMap.get(epc);
      unexpected.push({
        epc,
        productName: known ? await getProductName(adminDb, known.product_id) : null,
        status: known?.status ?? null,
        knownInSystem: Boolean(known),
      });
    }
  }

  await adminDb.from('audit_log').insert({
    operator_id: ctx.operatorId,
    user_id: ctx.user.id,
    action: 'inventory.verify.compared',
    entity_type: 'machines',
    entity_id: parsed.data.machineId,
    payload: {
      machine_id: parsed.data.machineId,
      scanned_count: scannedUnique.length,
      expected_count: expected.length,
      missing_count: missing.length,
      unexpected_count: unexpected.length,
    },
  });

  return {
    ok: true,
    missing,
    unexpected,
    expectedCount: expected.length,
    scannedCount: scannedUnique.length,
  };
}

export async function markMissingTagLostAction(payload: z.infer<typeof markLostSchema>): Promise<ActionResult> {
  const parsed = markLostSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, error: 'Invalid payload' };
  }

  const normalizedEpc = normalizeEpc(parsed.data.epc);
  if (!EPC_REGEX.test(normalizedEpc)) {
    return { ok: false, error: 'Invalid EPC format' };
  }

  const ctx = await getOperatorContext();
  if ('error' in ctx) {
    return { ok: false, error: ctx.error };
  }
  if (!hasPermission(ctx.role, 'inventory', 'w')) {
    return { ok: false, error: 'Permission denied' };
  }

  const adminDb = createAdminClient();
  const { error: updateError } = await adminDb
    .from('rfid_items')
    .update({
      status: 'lost',
      machine_id: null,
    })
    .eq('epc', normalizedEpc)
    .eq('operator_id', ctx.operatorId)
    .eq('machine_id', parsed.data.machineId);

  if (updateError) {
    return { ok: false, error: 'Failed to mark tag lost' };
  }

  await adminDb.from('audit_log').insert({
    operator_id: ctx.operatorId,
    user_id: ctx.user.id,
    action: 'inventory.verify.mark_lost',
    entity_type: 'rfid_items',
    entity_id: normalizedEpc,
    payload: {
      machine_id: parsed.data.machineId,
      epc: normalizedEpc,
    },
  });

  revalidatePath('/inventory/tags');

  return { ok: true };
}

export async function registerUnexpectedTagAction(payload: z.infer<typeof registerUnexpectedSchema>): Promise<ActionResult> {
  const parsed = registerUnexpectedSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, error: 'Invalid payload' };
  }

  const normalizedEpc = normalizeEpc(parsed.data.epc);
  if (!EPC_REGEX.test(normalizedEpc)) {
    return { ok: false, error: 'Invalid EPC format' };
  }

  const ctx = await getOperatorContext();
  if ('error' in ctx) {
    return { ok: false, error: ctx.error };
  }
  if (!hasPermission(ctx.role, 'inventory', 'w')) {
    return { ok: false, error: 'Permission denied' };
  }

  const adminDb = createAdminClient();

  const { data: machineData } = await adminDb
    .from('machines')
    .select('id')
    .eq('id', parsed.data.machineId)
    .eq('operator_id', ctx.operatorId)
    .maybeSingle();

  if (!machineData?.id) {
    return { ok: false, error: 'Machine not found' };
  }

  const { data: existing } = await adminDb
    .from('rfid_items')
    .select('epc')
    .eq('epc', normalizedEpc)
    .eq('operator_id', ctx.operatorId)
    .maybeSingle();

  if (existing?.epc) {
    const { error: updateError } = await adminDb
      .from('rfid_items')
      .update({
        status: 'in_machine',
        machine_id: parsed.data.machineId,
      })
      .eq('epc', normalizedEpc)
      .eq('operator_id', ctx.operatorId);

    if (updateError) {
      return { ok: false, error: 'Failed to register known tag' };
    }
  } else {
    const { error: insertError } = await adminDb.from('rfid_items').insert({
      epc: normalizedEpc,
      operator_id: ctx.operatorId,
      machine_id: parsed.data.machineId,
      status: 'in_machine',
      tag_type: 'unknown',
    });

    if (insertError) {
      return { ok: false, error: 'Failed to register new tag' };
    }
  }

  await adminDb.from('audit_log').insert({
    operator_id: ctx.operatorId,
    user_id: ctx.user.id,
    action: 'inventory.verify.register_unexpected',
    entity_type: 'rfid_items',
    entity_id: normalizedEpc,
    payload: {
      machine_id: parsed.data.machineId,
      epc: normalizedEpc,
      existing: Boolean(existing?.epc),
    },
  });

  revalidatePath('/inventory/tags');

  return { ok: true };
}
