import { NextResponse } from 'next/server';
import { hasPermission, type UserRole } from '@/lib/permissions';
import { getAppBaseUrl, getStripeServer, resolveConnectStatus } from '@/lib/stripe';
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

  if (!profile?.operator_id || !hasPermission(profile.role, 'financials', 'r')) {
    return NextResponse.redirect(new URL('/dashboard', getAppBaseUrl()));
  }

  const adminDb = createAdminClient() as any;
  const { data: operatorData } = await adminDb
    .from('operators')
    .select('id, stripe_account_id')
    .eq('id', profile.operator_id)
    .maybeSingle();

  const operator = operatorData as { id: string; stripe_account_id: string | null } | null;
  if (!operator?.id || !operator.stripe_account_id) {
    return NextResponse.redirect(new URL('/financials/banking?status=unconnected', getAppBaseUrl()));
  }

  const stripe = getStripeServer();
  const account = await stripe.accounts.retrieve(operator.stripe_account_id);

  await adminDb
    .from('operators')
    .update({
      stripe_account_id: account.id,
    })
    .eq('id', operator.id);

  await adminDb.from('audit_log').insert({
    operator_id: operator.id,
    user_id: user.id,
    action: 'financials.connect.return',
    entity_type: 'operators',
    entity_id: operator.id,
    payload: {
      stripe_account_id: account.id,
      connect_status: resolveConnectStatus(account),
      payouts_enabled: account.payouts_enabled,
      charges_enabled: account.charges_enabled,
    },
  });

  return NextResponse.redirect(new URL('/financials/banking?status=connected', getAppBaseUrl()));
}
