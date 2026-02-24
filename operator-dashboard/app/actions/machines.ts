'use server';

import { customAlphabet } from 'nanoid';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { hasPermission, type UserRole } from '@/lib/permissions';
import { createAdminClient, createServerClient } from '@/lib/supabase';
import type { Json } from '@/lib/types';

const machineInputSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1),
  type: z.enum(['fridge', 'pantry', 'freezer']),
  locationName: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  lat: z.number().optional().nullable(),
  lng: z.number().optional().nullable(),
  notes: z.string().optional().nullable(),
});

const settingsInputSchema = z.object({
  machineId: z.string().uuid(),
  displayName: z.string().min(1),
  preAuthAmount: z.number().min(0),
  taxRate: z.number().min(0),
  temperatureTarget: z.number(),
  temperatureUnit: z.enum(['f', 'c']),
  alertThreshold: z.number(),
  autoLockdown: z.boolean(),
  assignedDriverIds: z.array(z.string().uuid()),
});

type ActionResult = {
  ok: boolean;
  error?: string;
  id?: string;
};

function normalizeOptionalText(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

async function getOperatorContext() {
  const supabase = createServerClient();
  const db = supabase as any;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: 'Not authenticated' as const };
  }

  const { data: profileData, error: profileError } = await db
    .from('profiles')
    .select('operator_id, role')
    .eq('id', user.id)
    .single();

  const profile = profileData as { operator_id: string | null; role: UserRole | null } | null;

  if (profileError || !profile?.operator_id) {
    return { error: 'Invalid profile context' as const };
  }

  return { supabase, db, user, profile };
}

async function generateUniqueMid(adminDb: any): Promise<string> {
  const makeCode = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 6);

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const mid = `MQ-${makeCode()}`;
    const { data, error } = await adminDb.from('machines').select('id').eq('mid', mid).maybeSingle();

    if (error) {
      continue;
    }

    if (!data) {
      return mid;
    }
  }

  throw new Error('Unable to generate unique MID');
}

function defaultMachineSettings(): Json {
  return {
    preAuthAmount: 10,
    taxRate: 0,
    tempThreshold: 42,
    temperatureTarget: 38,
    temperatureUnit: 'f',
    autoLockdown: false,
  };
}

export async function createMachineAction(payload: z.infer<typeof machineInputSchema>): Promise<ActionResult> {
  const parsed = machineInputSchema.safeParse(payload);

  if (!parsed.success) {
    return { ok: false, error: 'Invalid machine form data' };
  }

  const ctx = await getOperatorContext();
  if ('error' in ctx) {
    return { ok: false, error: ctx.error };
  }

  if (!hasPermission(ctx.profile.role, 'machines', 'w')) {
    return { ok: false, error: 'Permission denied' };
  }

  const adminClient = createAdminClient() as any;

  let mid: string;
  try {
    mid = await generateUniqueMid(adminClient);
  } catch {
    return { ok: false, error: 'Failed to generate MID' };
  }

  const insertPayload = {
    operator_id: ctx.profile.operator_id,
    name: parsed.data.name,
    mid,
    type: parsed.data.type,
    location_name: normalizeOptionalText(parsed.data.locationName),
    address: normalizeOptionalText(parsed.data.address),
    lat: parsed.data.lat ?? null,
    lng: parsed.data.lng ?? null,
    notes: normalizeOptionalText(parsed.data.notes),
    settings: defaultMachineSettings(),
  };

  const { data: insertedMachine, error: insertError } = await adminClient
    .from('machines')
    .insert(insertPayload)
    .select('id')
    .single();

  if (insertError || !insertedMachine?.id) {
    return { ok: false, error: 'Failed to create machine' };
  }

  await adminClient.from('audit_log').insert({
    operator_id: ctx.profile.operator_id,
    user_id: ctx.user.id,
    action: 'machine.created',
    entity_type: 'machines',
    entity_id: insertedMachine.id,
    payload: {
      mid,
      name: insertPayload.name,
      type: insertPayload.type,
    },
  });

  revalidatePath('/machines');
  revalidatePath('/dashboard');

  return { ok: true, id: insertedMachine.id };
}

export async function updateMachineAction(payload: z.infer<typeof machineInputSchema>): Promise<ActionResult> {
  const parsed = machineInputSchema.safeParse(payload);

  if (!parsed.success || !parsed.data.id) {
    return { ok: false, error: 'Invalid machine form data' };
  }

  const ctx = await getOperatorContext();
  if ('error' in ctx) {
    return { ok: false, error: ctx.error };
  }

  if (!hasPermission(ctx.profile.role, 'machines', 'w')) {
    return { ok: false, error: 'Permission denied' };
  }

  const adminClient = createAdminClient() as any;

  const { data: machineData } = await adminClient
    .from('machines')
    .select('id')
    .eq('id', parsed.data.id)
    .eq('operator_id', ctx.profile.operator_id)
    .maybeSingle();

  if (!machineData) {
    return { ok: false, error: 'Machine not found' };
  }

  const { error: updateError } = await adminClient
    .from('machines')
    .update({
      name: parsed.data.name,
      type: parsed.data.type,
      location_name: normalizeOptionalText(parsed.data.locationName),
      address: normalizeOptionalText(parsed.data.address),
      lat: parsed.data.lat ?? null,
      lng: parsed.data.lng ?? null,
      notes: normalizeOptionalText(parsed.data.notes),
    })
    .eq('id', parsed.data.id)
    .eq('operator_id', ctx.profile.operator_id);

  if (updateError) {
    return { ok: false, error: 'Failed to update machine' };
  }

  await adminClient.from('audit_log').insert({
    operator_id: ctx.profile.operator_id,
    user_id: ctx.user.id,
    action: 'machine.updated',
    entity_type: 'machines',
    entity_id: parsed.data.id,
    payload: {
      name: parsed.data.name,
      type: parsed.data.type,
    },
  });

  revalidatePath('/machines');
  revalidatePath(`/machines/${parsed.data.id}`);
  revalidatePath('/dashboard');

  return { ok: true, id: parsed.data.id };
}

export async function updateMachineSettingsAction(payload: z.infer<typeof settingsInputSchema>): Promise<ActionResult> {
  const parsed = settingsInputSchema.safeParse(payload);

  if (!parsed.success) {
    return { ok: false, error: 'Invalid machine settings payload' };
  }

  const ctx = await getOperatorContext();
  if ('error' in ctx) {
    return { ok: false, error: ctx.error };
  }

  if (!hasPermission(ctx.profile.role, 'machines', 'w')) {
    return { ok: false, error: 'Permission denied' };
  }

  const adminClient = createAdminClient() as any;

  const { data: machineData } = await adminClient
    .from('machines')
    .select('id, settings')
    .eq('id', parsed.data.machineId)
    .eq('operator_id', ctx.profile.operator_id)
    .maybeSingle();

  if (!machineData) {
    return { ok: false, error: 'Machine not found' };
  }

  const currentSettings = (machineData.settings as Record<string, unknown> | null) ?? {};

  const nextSettings = {
    ...currentSettings,
    preAuthAmount: parsed.data.preAuthAmount,
    taxRate: parsed.data.taxRate,
    temperatureTarget: parsed.data.temperatureTarget,
    temperatureUnit: parsed.data.temperatureUnit,
    tempThreshold: parsed.data.alertThreshold,
    autoLockdown: parsed.data.autoLockdown,
  };

  const { error: machineUpdateError } = await adminClient
    .from('machines')
    .update({
      name: parsed.data.displayName,
      settings: nextSettings,
    })
    .eq('id', parsed.data.machineId)
    .eq('operator_id', ctx.profile.operator_id);

  if (machineUpdateError) {
    return { ok: false, error: 'Failed to update machine settings' };
  }

  const { data: driversData } = await adminClient
    .from('profiles')
    .select('id, assigned_machine_ids')
    .eq('operator_id', ctx.profile.operator_id)
    .eq('role', 'driver');

  const drivers = (driversData as Array<{ id: string; assigned_machine_ids: string[] | null }> | null) ?? [];

  for (const driver of drivers) {
    const currentAssigned = driver.assigned_machine_ids ?? [];
    const shouldHaveMachine = parsed.data.assignedDriverIds.includes(driver.id);
    const hasMachine = currentAssigned.includes(parsed.data.machineId);

    let nextAssigned = currentAssigned;

    if (shouldHaveMachine && !hasMachine) {
      nextAssigned = [...currentAssigned, parsed.data.machineId];
    }

    if (!shouldHaveMachine && hasMachine) {
      nextAssigned = currentAssigned.filter((id) => id !== parsed.data.machineId);
    }

    if (nextAssigned !== currentAssigned) {
      await adminClient.from('profiles').update({ assigned_machine_ids: nextAssigned }).eq('id', driver.id);
    }
  }

  await adminClient.from('audit_log').insert({
    operator_id: ctx.profile.operator_id,
    user_id: ctx.user.id,
    action: 'machine.settings.updated',
    entity_type: 'machines',
    entity_id: parsed.data.machineId,
    payload: {
      settings: nextSettings,
      assignedDriverIds: parsed.data.assignedDriverIds,
    },
  });

  revalidatePath(`/machines/${parsed.data.machineId}`);
  revalidatePath('/machines');
  revalidatePath('/dashboard');

  return { ok: true, id: parsed.data.machineId };
}
