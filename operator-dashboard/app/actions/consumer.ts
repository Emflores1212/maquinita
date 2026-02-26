'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createAdminClient, createServerClient } from '@/lib/supabase';

const bootstrapSchema = z.object({
  operatorId: z.string().uuid(),
  phone: z.string().trim().min(4).max(32),
});

const updateOptInSchema = z.object({
  operatorId: z.string().uuid(),
  notificationOptIn: z.boolean(),
});

const submitFeedbackSchema = z.object({
  operatorId: z.string().uuid(),
  transactionId: z.string().uuid(),
  machineId: z.string().uuid().nullable(),
  productId: z.string().uuid().nullable(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(1000).optional().nullable(),
});

type ActionResult = {
  ok: boolean;
  error?: string;
};

async function getAuthUser() {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false as const, error: 'Not authenticated' };
  }

  return { ok: true as const, user };
}

function cleanComment(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export async function bootstrapConsumerProfileAction(payload: z.infer<typeof bootstrapSchema>): Promise<ActionResult> {
  const parsed = bootstrapSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, error: 'Invalid bootstrap payload' };
  }

  const auth = await getAuthUser();
  if (!auth.ok) {
    return { ok: false, error: auth.error };
  }

  const adminDb = createAdminClient();

  const { data: operatorData } = await adminDb.from('operators').select('id').eq('id', parsed.data.operatorId).maybeSingle();
  if (!operatorData?.id) {
    return { ok: false, error: 'Operator not found' };
  }

  const { data: existingProfileData } = await adminDb
    .from('consumer_profiles')
    .select('id, operator_id')
    .eq('id', auth.user.id)
    .maybeSingle();

  const existingProfile = existingProfileData as { id: string; operator_id: string } | null;
  if (existingProfile?.id && existingProfile.operator_id !== parsed.data.operatorId) {
    return { ok: false, error: 'Consumer profile belongs to another operator' };
  }

  const { error: upsertError } = await adminDb.from('consumer_profiles').upsert(
    {
      id: auth.user.id,
      operator_id: parsed.data.operatorId,
      phone: parsed.data.phone,
      full_name:
        typeof auth.user.user_metadata?.full_name === 'string' && auth.user.user_metadata.full_name.trim().length > 0
          ? auth.user.user_metadata.full_name.trim()
          : null,
      notification_opt_in: true,
    },
    {
      onConflict: 'id',
    }
  );

  if (upsertError) {
    return { ok: false, error: upsertError.message };
  }

  await adminDb.from('audit_log').insert({
    operator_id: parsed.data.operatorId,
    user_id: auth.user.id,
    action: 'consumer.profile.bootstrap',
    entity_type: 'consumer_profiles',
    entity_id: auth.user.id,
    payload: {
      phone: parsed.data.phone,
    },
  });

  return { ok: true };
}

export async function updateConsumerNotificationOptInAction(
  payload: z.infer<typeof updateOptInSchema>
): Promise<ActionResult> {
  const parsed = updateOptInSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, error: 'Invalid notification preference payload' };
  }

  const auth = await getAuthUser();
  if (!auth.ok) {
    return { ok: false, error: auth.error };
  }

  const adminDb = createAdminClient();

  const { data: profileData } = await adminDb
    .from('consumer_profiles')
    .select('id, operator_id')
    .eq('id', auth.user.id)
    .eq('operator_id', parsed.data.operatorId)
    .maybeSingle();

  if (!profileData?.id) {
    return { ok: false, error: 'Consumer profile not found' };
  }

  const { error: updateError } = await adminDb
    .from('consumer_profiles')
    .update({ notification_opt_in: parsed.data.notificationOptIn })
    .eq('id', auth.user.id)
    .eq('operator_id', parsed.data.operatorId);

  if (updateError) {
    return { ok: false, error: updateError.message };
  }

  await adminDb.from('audit_log').insert({
    operator_id: parsed.data.operatorId,
    user_id: auth.user.id,
    action: 'consumer.notifications.updated',
    entity_type: 'consumer_profiles',
    entity_id: auth.user.id,
    payload: {
      notification_opt_in: parsed.data.notificationOptIn,
    },
  });

  revalidatePath('/');
  return { ok: true };
}

export async function submitConsumerFeedbackAction(payload: z.infer<typeof submitFeedbackSchema>): Promise<ActionResult> {
  const parsed = submitFeedbackSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, error: 'Invalid feedback payload' };
  }

  const auth = await getAuthUser();
  if (!auth.ok) {
    return { ok: false, error: auth.error };
  }

  const adminDb = createAdminClient();

  const { data: profileData } = await adminDb
    .from('consumer_profiles')
    .select('id, operator_id')
    .eq('id', auth.user.id)
    .eq('operator_id', parsed.data.operatorId)
    .maybeSingle();

  if (!profileData?.id) {
    return { ok: false, error: 'Consumer profile not found' };
  }

  const { error: insertError } = await adminDb.from('consumer_feedback').insert({
    consumer_id: auth.user.id,
    operator_id: parsed.data.operatorId,
    machine_id: parsed.data.machineId,
    product_id: parsed.data.productId,
    rating: parsed.data.rating,
    comment: cleanComment(parsed.data.comment),
  });

  if (insertError) {
    return { ok: false, error: insertError.message };
  }

  await adminDb.from('audit_log').insert({
    operator_id: parsed.data.operatorId,
    user_id: auth.user.id,
    action: 'consumer.feedback.submitted',
    entity_type: 'consumer_feedback',
    entity_id: parsed.data.transactionId,
    payload: {
      transaction_id: parsed.data.transactionId,
      machine_id: parsed.data.machineId,
      product_id: parsed.data.productId,
      rating: parsed.data.rating,
      comment: cleanComment(parsed.data.comment),
    },
  });

  revalidatePath('/');
  return { ok: true };
}
