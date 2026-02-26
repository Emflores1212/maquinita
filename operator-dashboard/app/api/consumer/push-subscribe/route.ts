import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient, createRouteHandlerClient } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const subscriptionSchema = z.object({
  endpoint: z.string().url(),
  expirationTime: z.number().nullable().optional(),
  keys: z.object({
    p256dh: z.string(),
    auth: z.string(),
  }),
});

const postSchema = z.object({
  operatorId: z.string().uuid(),
  subscription: subscriptionSchema,
});

const deleteSchema = z.object({
  operatorId: z.string().uuid(),
  endpoint: z.string().url(),
});

async function getAuthUser() {
  const supabase = createRouteHandlerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 }) };
  }

  return { user };
}

async function ensureConsumerMembership(adminDb: any, userId: string, operatorId: string) {
  const { data } = await adminDb
    .from('consumer_profiles')
    .select('id')
    .eq('id', userId)
    .eq('operator_id', operatorId)
    .maybeSingle();

  return Boolean(data?.id);
}

export async function POST(request: Request) {
  const auth = await getAuthUser();
  if ('error' in auth) return auth.error;

  const body = await request.json().catch(() => null);
  const parsed = postSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'Invalid payload' }, { status: 400 });
  }

  const adminDb = createAdminClient();

  const hasMembership = await ensureConsumerMembership(adminDb, auth.user.id, parsed.data.operatorId);
  if (!hasMembership) {
    return NextResponse.json({ ok: false, error: 'Consumer profile not found' }, { status: 403 });
  }

  const { data: existingData } = await adminDb
    .from('push_subscriptions')
    .select('id')
    .eq('subscription->>endpoint', parsed.data.subscription.endpoint)
    .maybeSingle();

  if (existingData?.id) {
    await adminDb
      .from('push_subscriptions')
      .update({
        operator_id: parsed.data.operatorId,
        user_id: auth.user.id,
        subscription: parsed.data.subscription,
      })
      .eq('id', existingData.id);
  } else {
    await adminDb.from('push_subscriptions').insert({
      operator_id: parsed.data.operatorId,
      user_id: auth.user.id,
      subscription: parsed.data.subscription,
    });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const auth = await getAuthUser();
  if ('error' in auth) return auth.error;

  const body = await request.json().catch(() => null);
  const parsed = deleteSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'Invalid payload' }, { status: 400 });
  }

  const adminDb = createAdminClient();

  const hasMembership = await ensureConsumerMembership(adminDb, auth.user.id, parsed.data.operatorId);
  if (!hasMembership) {
    return NextResponse.json({ ok: false, error: 'Consumer profile not found' }, { status: 403 });
  }

  await adminDb
    .from('push_subscriptions')
    .delete()
    .eq('operator_id', parsed.data.operatorId)
    .eq('user_id', auth.user.id)
    .eq('subscription->>endpoint', parsed.data.endpoint);

  return NextResponse.json({ ok: true });
}
