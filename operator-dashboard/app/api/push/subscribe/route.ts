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

async function getAuthContext() {
  const supabase = createRouteHandlerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 }) };
  }

  const { data: profileData } = await supabase.from('profiles').select('operator_id').eq('id', user.id).maybeSingle();
  const profile = profileData as { operator_id: string | null } | null;

  if (!profile?.operator_id) {
    return { error: NextResponse.json({ ok: false, error: 'Invalid operator context' }, { status: 403 }) };
  }

  return { user, operatorId: profile.operator_id };
}

export async function POST(request: Request) {
  const auth = await getAuthContext();
  if ('error' in auth) return auth.error;

  const bodyRaw = await request.json().catch(() => null);
  const parsed = subscriptionSchema.safeParse(bodyRaw?.subscription ?? bodyRaw);

  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'Invalid push subscription payload' }, { status: 400 });
  }

  const adminDb = createAdminClient();

  const { data: existingData } = await adminDb
    .from('push_subscriptions')
    .select('id')
    .eq('subscription->>endpoint', parsed.data.endpoint)
    .maybeSingle();

  if (existingData?.id) {
    await adminDb
      .from('push_subscriptions')
      .update({
        operator_id: auth.operatorId,
        user_id: auth.user.id,
        subscription: parsed.data,
      })
      .eq('id', existingData.id);
  } else {
    await adminDb.from('push_subscriptions').insert({
      operator_id: auth.operatorId,
      user_id: auth.user.id,
      subscription: parsed.data,
    });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}

export async function DELETE(request: Request) {
  const auth = await getAuthContext();
  if ('error' in auth) return auth.error;

  const bodyRaw = await request.json().catch(() => null);
  const endpoint =
    (typeof bodyRaw?.endpoint === 'string' ? bodyRaw.endpoint : null) ??
    new URL(request.url).searchParams.get('endpoint');

  if (!endpoint) {
    return NextResponse.json({ ok: false, error: 'Missing endpoint' }, { status: 400 });
  }

  const adminDb = createAdminClient();
  await adminDb
    .from('push_subscriptions')
    .delete()
    .eq('operator_id', auth.operatorId)
    .eq('user_id', auth.user.id)
    .eq('subscription->>endpoint', endpoint);

  return NextResponse.json({ ok: true }, { status: 200 });
}
