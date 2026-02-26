'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { hasPermission, type UserRole } from '@/lib/permissions';
import { createAdminClient, createServerClient } from '@/lib/supabase';

const upsertParLevelSchema = z.object({
  machineId: z.string().uuid(),
  productId: z.string().uuid(),
  quantity: z.number().int().min(0),
});

const discardByExpirySchema = z.object({
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
      user: { id: string };
      operatorId: string;
      role: UserRole | null;
    };

function normalizeEpc(epc: string): string {
  return epc.replace(/\s+/g, '').toUpperCase();
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
    user: { id: user.id },
    operatorId: profile.operator_id,
    role: profile.role,
  };
}

export async function upsertParLevelAction(payload: z.infer<typeof upsertParLevelSchema>): Promise<ActionResult> {
  const parsed = upsertParLevelSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, error: 'Invalid par level payload' };
  }

  const ctx = await getOperatorContext();
  if ('error' in ctx) {
    return { ok: false, error: ctx.error };
  }

  if (!hasPermission(ctx.role, 'inventory', 'w')) {
    return { ok: false, error: 'Permission denied' };
  }

  const adminDb = createAdminClient();

  const [{ data: machineData }, { data: productData }] = await Promise.all([
    adminDb
      .from('machines')
      .select('id')
      .eq('id', parsed.data.machineId)
      .eq('operator_id', ctx.operatorId)
      .maybeSingle(),
    adminDb
      .from('products')
      .select('id')
      .eq('id', parsed.data.productId)
      .eq('operator_id', ctx.operatorId)
      .maybeSingle(),
  ]);

  if (!machineData?.id || !productData?.id) {
    return { ok: false, error: 'Machine or product not found' };
  }

  if (parsed.data.quantity === 0) {
    const { error: deleteError } = await adminDb
      .from('par_levels')
      .delete()
      .eq('machine_id', parsed.data.machineId)
      .eq('product_id', parsed.data.productId);

    if (deleteError) {
      return { ok: false, error: 'Failed to clear par level' };
    }
  } else {
    const { error: upsertError } = await adminDb.from('par_levels').upsert(
      {
        machine_id: parsed.data.machineId,
        product_id: parsed.data.productId,
        quantity: parsed.data.quantity,
      },
      { onConflict: 'machine_id,product_id' }
    );

    if (upsertError) {
      return { ok: false, error: 'Failed to save par level' };
    }
  }

  await adminDb.from('audit_log').insert({
    operator_id: ctx.operatorId,
    user_id: ctx.user.id,
    action: 'inventory.par_level.updated',
    entity_type: 'par_levels',
    payload: {
      machine_id: parsed.data.machineId,
      product_id: parsed.data.productId,
      quantity: parsed.data.quantity,
    },
  });

  revalidatePath('/inventory');
  revalidatePath('/inventory/expiration');

  return { ok: true };
}

export async function discardExpiredItemAction(payload: z.infer<typeof discardByExpirySchema>): Promise<ActionResult> {
  const parsed = discardByExpirySchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, error: 'Invalid EPC payload' };
  }

  const ctx = await getOperatorContext();
  if ('error' in ctx) {
    return { ok: false, error: ctx.error };
  }

  if (!hasPermission(ctx.role, 'inventory', 'w')) {
    return { ok: false, error: 'Permission denied' };
  }

  const adminDb = createAdminClient();
  const epc = normalizeEpc(parsed.data.epc);

  const { data: itemData } = await adminDb
    .from('rfid_items')
    .select('epc, product_id, machine_id, status')
    .eq('epc', epc)
    .eq('operator_id', ctx.operatorId)
    .maybeSingle();

  if (!itemData?.epc) {
    return { ok: false, error: 'EPC not found' };
  }

  if (itemData.status !== 'in_machine') {
    return { ok: false, error: 'EPC is not currently in machine inventory' };
  }

  const { error: updateError } = await adminDb
    .from('rfid_items')
    .update({
      status: 'discarded',
      machine_id: null,
      sold_at: null,
    })
    .eq('epc', epc)
    .eq('operator_id', ctx.operatorId);

  if (updateError) {
    return { ok: false, error: 'Failed to discard item' };
  }

  await adminDb.from('audit_log').insert({
    operator_id: ctx.operatorId,
    user_id: ctx.user.id,
    action: 'inventory.expiration.discarded',
    entity_type: 'rfid_items',
    entity_id: epc,
    payload: {
      epc,
      product_id: itemData.product_id,
      machine_id: itemData.machine_id,
    },
  });

  revalidatePath('/inventory');
  revalidatePath('/inventory/expiration');

  return { ok: true };
}
