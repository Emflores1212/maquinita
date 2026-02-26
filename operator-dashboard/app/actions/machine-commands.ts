'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { hasPermission, type UserRole } from '@/lib/permissions';
import { createAdminClient, createServerClient } from '@/lib/supabase';
import type { Json } from '@/lib/types';

const commandTypeSchema = z.enum(['LOCKDOWN', 'UNLOCK', 'REBOOT', 'TEMP_ADJUST']);

const issueCommandSchema = z.object({
  machineId: z.string().uuid(),
  type: commandTypeSchema,
  payload: z.record(z.any()).optional(),
});

type ActionResult = {
  ok: boolean;
  id?: string;
  error?: string;
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

  return { user, profile };
}

function normalizeTempAdjustPayload(machineType: string, payload: Record<string, unknown> | undefined): { ok: true; payload: Json } | { ok: false; error: string } {
  const raw = payload?.targetTempF ?? payload?.temperature ?? payload?.target;
  const value = Number(raw);

  if (!Number.isFinite(value)) {
    return { ok: false, error: 'Temperature value is required' };
  }

  if (machineType === 'pantry') {
    return { ok: false, error: 'TEMP_ADJUST is not supported for pantry machines' };
  }

  if (machineType === 'fridge' && (value < 33 || value > 45)) {
    return { ok: false, error: 'Fridge temperature must be between 33°F and 45°F' };
  }

  if (machineType === 'freezer' && (value < -10 || value > 10)) {
    return { ok: false, error: 'Freezer temperature must be between -10°F and 10°F' };
  }

  return {
    ok: true,
    payload: {
      targetTempF: Math.round(value * 10) / 10,
    },
  };
}

function resolveLockState(settings: Record<string, unknown> | null | undefined) {
  return String(settings?.lockState ?? 'unlocked').toLowerCase();
}

export async function issueCommand(input: z.infer<typeof issueCommandSchema>): Promise<ActionResult> {
  const parsed = issueCommandSchema.safeParse(input);

  if (!parsed.success) {
    return { ok: false, error: 'Invalid command payload' };
  }

  const ctx = await getOperatorContext();
  if ('error' in ctx) {
    return { ok: false, error: ctx.error };
  }

  if (!hasPermission(ctx.profile.role, 'machines', 'w')) {
    return { ok: false, error: 'Permission denied' };
  }

  const adminDb = createAdminClient() as any;

  const { data: machineData } = await adminDb
    .from('machines')
    .select('id, operator_id, name, type, settings')
    .eq('id', parsed.data.machineId)
    .eq('operator_id', ctx.profile.operator_id)
    .maybeSingle();

  const machine = machineData as
    | {
        id: string;
        operator_id: string;
        name: string;
        type: 'fridge' | 'pantry' | 'freezer';
        settings: Record<string, unknown> | null;
      }
    | null;

  if (!machine?.id) {
    return { ok: false, error: 'Machine not found' };
  }

  const currentLockState = resolveLockState(machine.settings);

  if (parsed.data.type === 'LOCKDOWN' && currentLockState === 'locked') {
    return { ok: false, error: 'Machine is already locked' };
  }

  if (parsed.data.type === 'UNLOCK' && currentLockState !== 'locked') {
    return { ok: false, error: 'Machine is not locked' };
  }

  let payload: Json = (parsed.data.payload ?? {}) as Json;

  if (parsed.data.type === 'TEMP_ADJUST') {
    const normalized = normalizeTempAdjustPayload(machine.type, parsed.data.payload);
    if (!normalized.ok) {
      return { ok: false, error: normalized.error };
    }
    payload = normalized.payload;
  }

  const nowIso = new Date().toISOString();
  const { data: insertData, error: insertError } = await adminDb
    .from('machine_commands')
    .insert({
      machine_id: machine.id,
      operator_id: ctx.profile.operator_id,
      issued_by: ctx.user.id,
      type: parsed.data.type,
      payload,
      status: 'pending',
      issued_at: nowIso,
    })
    .select('id')
    .single();

  if (insertError || !insertData?.id) {
    return { ok: false, error: 'Failed to issue command' };
  }

  if (parsed.data.type === 'LOCKDOWN' || parsed.data.type === 'UNLOCK') {
    const nextSettings = {
      ...(machine.settings ?? {}),
      lockState: parsed.data.type === 'LOCKDOWN' ? 'locked_pending' : 'unlocked_pending',
    };

    await adminDb
      .from('machines')
      .update({ settings: nextSettings })
      .eq('id', machine.id)
      .eq('operator_id', machine.operator_id);
  }

  await adminDb.from('audit_log').insert({
    operator_id: machine.operator_id,
    user_id: ctx.user.id,
    action: 'machine.command.issued',
    entity_type: 'machine_commands',
    entity_id: insertData.id,
    payload: {
      machine_id: machine.id,
      machine_name: machine.name,
      type: parsed.data.type,
      payload,
    },
  });

  revalidatePath(`/machines/${machine.id}`);
  revalidatePath('/machines');
  revalidatePath('/dashboard');

  return { ok: true, id: insertData.id };
}
