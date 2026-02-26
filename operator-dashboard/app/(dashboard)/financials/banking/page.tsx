import { redirect } from 'next/navigation';
import BankingSettingsClient from '@/components/financials/BankingSettingsClient';
import { computeNextPayoutDate, type PayoutInterval, type WeeklyAnchor } from '@/lib/financials';
import { hasPermission, type UserRole } from '@/lib/permissions';
import { getStripeServer, resolveConnectStatus, type StripeConnectStatus } from '@/lib/stripe';
import { createAdminClient, createServerClient } from '@/lib/supabase';

function asSingleParam(value: string | string[] | undefined) {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function parseStatusMessage(statusParam: string | null): 'connected' | 'refresh' | 'forbidden' | 'error' | null {
  if (statusParam === 'connected') return 'connected';
  if (statusParam === 'refresh') return 'refresh';
  if (statusParam === 'forbidden') return 'forbidden';
  if (statusParam === 'error') return 'error';
  return null;
}

function parseStoredSchedule(settings: unknown): {
  interval: PayoutInterval | null;
  weeklyAnchor: WeeklyAnchor | null;
  monthlyAnchor: number | null;
} {
  const source = ((settings ?? {}) as Record<string, unknown>).payoutSchedule as Record<string, unknown> | undefined;
  const interval = source?.interval;
  const weeklyAnchor = source?.weeklyAnchor;
  const monthlyAnchor = Number(source?.monthlyAnchor ?? NaN);

  const parsedInterval: PayoutInterval | null =
    interval === 'daily' || interval === 'weekly' || interval === 'monthly' ? interval : null;
  const parsedWeeklyAnchor: WeeklyAnchor | null =
    weeklyAnchor === 'monday' ||
    weeklyAnchor === 'tuesday' ||
    weeklyAnchor === 'wednesday' ||
    weeklyAnchor === 'thursday' ||
    weeklyAnchor === 'friday' ||
    weeklyAnchor === 'saturday' ||
    weeklyAnchor === 'sunday'
      ? weeklyAnchor
      : null;

  return {
    interval: parsedInterval,
    weeklyAnchor: parsedWeeklyAnchor,
    monthlyAnchor: Number.isFinite(monthlyAnchor) ? Math.max(1, Math.min(28, Math.floor(monthlyAnchor))) : null,
  };
}

export default async function BankingPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const supabase = createServerClient();
  const db = supabase;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login?returnUrl=/financials/banking');
  }

  const { data: profileData } = await db.from('profiles').select('operator_id, role').eq('id', user.id).maybeSingle();
  const profile = profileData as { operator_id: string | null; role: UserRole | null } | null;

  if (!profile?.operator_id || !hasPermission(profile.role, 'financials', 'r')) {
    redirect('/dashboard');
  }

  const canWrite = hasPermission(profile.role, 'financials', 'w');
  const adminDb = createAdminClient();

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

  if (!operator?.id) {
    redirect('/dashboard');
  }

  let connectStatus: StripeConnectStatus = 'unconnected';
  let bankName: string | null = null;
  let bankLast4: string | null = null;
  let bankAccountType: string | null = null;
  let payoutInterval: PayoutInterval | null = null;
  let weeklyAnchor: WeeklyAnchor | null = null;
  let monthlyAnchor: number | null = null;

  if (operator.stripe_account_id) {
    const stripe = getStripeServer();
    const account = await stripe.accounts.retrieve(operator.stripe_account_id);
    connectStatus = resolveConnectStatus(account);

    const externalAccounts = await stripe.accounts.listExternalAccounts(operator.stripe_account_id, {
      object: 'bank_account',
      limit: 1,
    });

    const bankAccount = externalAccounts.data[0] as any;
    bankName = typeof bankAccount?.bank_name === 'string' ? bankAccount.bank_name : null;
    bankLast4 = typeof bankAccount?.last4 === 'string' ? bankAccount.last4 : null;
    bankAccountType = typeof bankAccount?.account_type === 'string' ? bankAccount.account_type : null;

    payoutInterval = (account.settings?.payouts?.schedule?.interval as PayoutInterval | undefined) ?? null;
    weeklyAnchor = (account.settings?.payouts?.schedule?.weekly_anchor as WeeklyAnchor | undefined) ?? null;
    monthlyAnchor = (account.settings?.payouts?.schedule?.monthly_anchor as number | undefined) ?? null;
  }

  if (!payoutInterval) {
    const stored = parseStoredSchedule(operator.settings);
    payoutInterval = stored.interval;
    weeklyAnchor = stored.weeklyAnchor;
    monthlyAnchor = stored.monthlyAnchor;
  }

  const nextPayoutDate = payoutInterval
    ? computeNextPayoutDate({
        interval: payoutInterval,
        weeklyAnchor,
        monthlyAnchor,
      })
    : null;

  const statusParam = asSingleParam(searchParams.status);
  const statusCode = parseStatusMessage(statusParam);

  return (
    <BankingSettingsClient
      canWrite={canWrite}
      status={connectStatus}
      statusCode={statusCode}
      account={{
        stripeAccountId: operator.stripe_account_id,
        bankName,
        bankLast4,
        bankAccountType,
        payoutInterval,
        weeklyAnchor,
        monthlyAnchor,
        nextPayoutDate: nextPayoutDate ? nextPayoutDate.toISOString() : null,
      }}
    />
  );
}
