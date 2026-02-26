import { NextResponse } from 'next/server';
import { hasPermission, type UserRole } from '@/lib/permissions';
import { getAppBaseUrl, getStripeServer } from '@/lib/stripe';
import { createAdminClient, createRouteHandlerClient } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = createRouteHandlerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL('/login?returnUrl=/financials/banking', getAppBaseUrl()));
  }

  const db = supabase as any;
  const { data: profileData } = await db.from('profiles').select('operator_id, role').eq('id', user.id).maybeSingle();
  const profile = profileData as { operator_id: string | null; role: UserRole | null } | null;

  if (!profile?.operator_id || !hasPermission(profile.role, 'financials', 'w')) {
    return NextResponse.redirect(new URL('/financials/banking?status=forbidden', getAppBaseUrl()));
  }

  const adminDb = createAdminClient() as any;
  const { data: operatorData } = await adminDb
    .from('operators')
    .select('id, name, stripe_account_id')
    .eq('id', profile.operator_id)
    .maybeSingle();

  const operator = operatorData as { id: string; name: string | null; stripe_account_id: string | null } | null;

  if (!operator?.id) {
    return NextResponse.redirect(new URL('/financials/banking?status=error', getAppBaseUrl()));
  }

  const stripe = getStripeServer();
  let stripeAccountId = operator.stripe_account_id;

  if (!stripeAccountId) {
    const account = await stripe.accounts.create({
      type: 'express',
      country: 'US',
      email: user.email ?? undefined,
      metadata: {
        operator_id: operator.id,
        operator_name: operator.name ?? 'Maquinita Operator',
      },
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
    });

    stripeAccountId = account.id;
    await adminDb.from('operators').update({ stripe_account_id: stripeAccountId }).eq('id', operator.id);
  }

  const appBaseUrl = getAppBaseUrl();
  const accountLink = await stripe.accountLinks.create({
    account: stripeAccountId,
    type: 'account_onboarding',
    refresh_url: `${appBaseUrl}/financials/banking?status=refresh`,
    return_url: `${appBaseUrl}/api/stripe/connect/return?status=connected`,
  });

  await adminDb.from('audit_log').insert({
    operator_id: operator.id,
    user_id: user.id,
    action: 'financials.connect.onboarding_started',
    entity_type: 'operators',
    entity_id: operator.id,
    payload: {
      stripe_account_id: stripeAccountId,
      account_link_created: true,
    },
  });

  return NextResponse.redirect(accountLink.url);
}
