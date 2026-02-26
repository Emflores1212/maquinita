'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { computeNextPayoutDate, type PayoutInterval, type WeeklyAnchor } from '@/lib/financials';
import { hasPermission, type UserRole } from '@/lib/permissions';
import { getStripeServer } from '@/lib/stripe';
import { createAdminClient, createServerClient } from '@/lib/supabase';

const payoutScheduleSchema = z
  .object({
    interval: z.enum(['daily', 'weekly', 'monthly']),
    weeklyAnchor: z.enum(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']).optional(),
    monthlyAnchor: z.number().int().min(1).max(28).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.interval === 'weekly' && !value.weeklyAnchor) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['weeklyAnchor'],
        message: 'Weekly schedule requires weeklyAnchor',
      });
    }
    if (value.interval === 'monthly' && !value.monthlyAnchor) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['monthlyAnchor'],
        message: 'Monthly schedule requires monthlyAnchor',
      });
    }
  });

type ActionResult = {
  ok: boolean;
  error?: string;
  nextPayoutDate?: string | null;
};

function buildStripeSchedulePayload(interval: PayoutInterval, weeklyAnchor?: WeeklyAnchor, monthlyAnchor?: number) {
  if (interval === 'daily') {
    return { interval: 'daily' as const };
  }

  if (interval === 'weekly') {
    return {
      interval: 'weekly' as const,
      weekly_anchor: weeklyAnchor,
    };
  }

  return {
    interval: 'monthly' as const,
    monthly_anchor: monthlyAnchor,
  };
}

export async function updatePayoutScheduleAction(payload: z.infer<typeof payoutScheduleSchema>): Promise<ActionResult> {
  const parsed = payoutScheduleSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid payout schedule payload' };
  }

  const supabase = createServerClient();
  const db = supabase as any;
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: 'Not authenticated' };
  }

  const { data: profileData, error: profileError } = await db
    .from('profiles')
    .select('operator_id, role')
    .eq('id', user.id)
    .single();

  const profile = profileData as { operator_id: string | null; role: UserRole | null } | null;
  if (profileError || !profile?.operator_id) {
    return { ok: false, error: 'Invalid operator context' };
  }

  if (!hasPermission(profile.role, 'financials', 'w')) {
    return { ok: false, error: 'Permission denied' };
  }

  const adminDb = createAdminClient() as any;
  const { data: operatorData } = await adminDb
    .from('operators')
    .select('id, stripe_account_id, settings')
    .eq('id', profile.operator_id)
    .maybeSingle();

  const operator = operatorData as {
    id: string;
    stripe_account_id: string | null;
    settings: Record<string, unknown> | null;
  } | null;

  if (!operator?.id || !operator.stripe_account_id) {
    return { ok: false, error: 'Stripe Connect account is not configured' };
  }

  const stripe = getStripeServer();
  const schedulePayload = buildStripeSchedulePayload(parsed.data.interval, parsed.data.weeklyAnchor, parsed.data.monthlyAnchor);

  try {
    await stripe.accounts.update(operator.stripe_account_id, {
      settings: {
        payouts: {
          schedule: schedulePayload as any,
        },
      },
    });
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Failed to update payout schedule in Stripe',
    };
  }

  const currentSettings = (operator.settings ?? {}) as Record<string, unknown>;
  const nextSettings = {
    ...currentSettings,
    payoutSchedule: {
      interval: parsed.data.interval,
      weeklyAnchor: parsed.data.weeklyAnchor ?? null,
      monthlyAnchor: parsed.data.monthlyAnchor ?? null,
    },
  };

  const { error: updateError } = await adminDb.from('operators').update({ settings: nextSettings }).eq('id', operator.id);

  if (updateError) {
    return { ok: false, error: 'Stripe updated, but operator settings update failed' };
  }

  const nextPayoutDate = computeNextPayoutDate({
    interval: parsed.data.interval,
    weeklyAnchor: parsed.data.weeklyAnchor ?? null,
    monthlyAnchor: parsed.data.monthlyAnchor ?? null,
  });

  await adminDb.from('audit_log').insert({
    operator_id: operator.id,
    user_id: user.id,
    action: 'financials.payout_schedule.updated',
    entity_type: 'operators',
    entity_id: operator.id,
    payload: {
      interval: parsed.data.interval,
      weekly_anchor: parsed.data.weeklyAnchor ?? null,
      monthly_anchor: parsed.data.monthlyAnchor ?? null,
      stripe_account_id: operator.stripe_account_id,
    },
  });

  revalidatePath('/financials');
  revalidatePath('/financials/banking');
  revalidatePath('/financials/payouts');

  return {
    ok: true,
    nextPayoutDate: nextPayoutDate ? nextPayoutDate.toISOString() : null,
  };
}
