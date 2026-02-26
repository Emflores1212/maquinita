import { redirect } from 'next/navigation';
import PayoutsHistoryClient from '@/components/financials/PayoutsHistoryClient';
import { hasPermission, type UserRole } from '@/lib/permissions';
import { mapPayoutStatus } from '@/lib/stripe';
import { createServerClient } from '@/lib/supabase';

function safeNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export default async function PayoutsHistoryPage() {
  const supabase = createServerClient();
  const db = supabase;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login?returnUrl=/financials/payouts');
  }

  const { data: profileData } = await db.from('profiles').select('operator_id, role').eq('id', user.id).maybeSingle();
  const profile = profileData as { operator_id: string | null; role: UserRole | null } | null;

  if (!profile?.operator_id || !hasPermission(profile.role, 'financials', 'r')) {
    redirect('/dashboard');
  }

  const { data: payoutsData } = await db
    .from('payouts')
    .select('id, stripe_payout_id, amount, status, period_start, period_end, created_at')
    .eq('operator_id', profile.operator_id)
    .order('created_at', { ascending: false })
    .limit(200);

  const payouts =
    ((payoutsData as Array<{
      id: string;
      stripe_payout_id: string;
      amount: number | null;
      status: string | null;
      period_start: string | null;
      period_end: string | null;
      created_at: string | null;
    }> | null) ?? []).map((row) => ({
      id: row.id,
      stripePayoutId: row.stripe_payout_id,
      amount: safeNumber(row.amount),
      status: row.status,
      periodStart: row.period_start,
      periodEnd: row.period_end,
      createdAt: row.created_at ?? new Date().toISOString(),
    })) ?? [];

  const payoutIds = payouts.map((payout) => payout.id);

  const payoutTransactionsData =
    payoutIds.length > 0
      ? await db
          .from('payout_transactions')
          .select('payout_id, transaction_id, stripe_balance_transaction_id, amount, fee_amount, net_amount')
          .eq('operator_id', profile.operator_id)
          .in('payout_id', payoutIds)
      : { data: [] };

  const payoutTransactions =
    ((payoutTransactionsData.data as Array<{
      payout_id: string;
      transaction_id: string | null;
      stripe_balance_transaction_id: string;
      amount: number | null;
      fee_amount: number | null;
      net_amount: number | null;
    }> | null) ?? []).map((row) => ({
      payoutId: row.payout_id,
      transactionId: row.transaction_id,
      stripeBalanceTransactionId: row.stripe_balance_transaction_id,
      amount: safeNumber(row.amount),
      feeAmount: safeNumber(row.fee_amount),
      netAmount: safeNumber(row.net_amount),
    })) ?? [];

  const transactionIds = payoutTransactions.map((row) => row.transactionId).filter(Boolean) as string[];
  const { data: transactionsData } =
    transactionIds.length > 0
      ? await db
          .from('transactions')
          .select('id, machine_id, refund_amount')
          .eq('operator_id', profile.operator_id)
          .in('id', transactionIds)
      : { data: [] };

  const transactions = ((transactionsData as Array<{ id: string; machine_id: string | null; refund_amount: number | null }> | null) ?? []).map(
    (row) => ({
      id: row.id,
      machineId: row.machine_id,
      refundAmount: safeNumber(row.refund_amount),
    })
  );

  const machineIds = transactions.map((row) => row.machineId).filter(Boolean) as string[];
  const { data: machinesData } =
    machineIds.length > 0
      ? await db.from('machines').select('id, name').eq('operator_id', profile.operator_id).in('id', machineIds)
      : { data: [] };

  const machineNameById = new Map(
    (((machinesData as Array<{ id: string; name: string }> | null) ?? []).map((row) => [row.id, row.name]) as Array<[string, string]>)
  );
  const transactionById = new Map(transactions.map((row) => [row.id, row]));

  const rows = payouts.map((payout) => {
    const txRows = payoutTransactions.filter((row) => row.payoutId === payout.id);
    const gross = txRows.reduce((sum, row) => sum + (row.amount > 0 ? row.amount : 0), 0);
    const inferredRefunds = txRows.reduce((sum, row) => sum + (row.amount < 0 ? Math.abs(row.amount) : 0), 0);
    const joinedRefunds = txRows.reduce((sum, row) => {
      if (!row.transactionId) return sum;
      return sum + safeNumber(transactionById.get(row.transactionId)?.refundAmount, 0);
    }, 0);
    const refunds = inferredRefunds > 0 ? inferredRefunds : joinedRefunds;
    const fees = txRows.reduce((sum, row) => sum + row.feeAmount, 0);

    return {
      id: payout.id,
      createdAt: payout.createdAt,
      periodStart: payout.periodStart,
      periodEnd: payout.periodEnd,
      gross,
      fees,
      refunds,
      netPaid: payout.amount,
      status: mapPayoutStatus(payout.status),
      transactions: txRows.map((row) => ({
        stripeBalanceTransactionId: row.stripeBalanceTransactionId,
        transactionId: row.transactionId,
        machineName: row.transactionId
          ? machineNameById.get(transactionById.get(row.transactionId)?.machineId ?? '') ?? '-'
          : '-',
        amount: row.amount,
        feeAmount: row.feeAmount,
        netAmount: row.netAmount,
        refundAmount: row.transactionId ? safeNumber(transactionById.get(row.transactionId)?.refundAmount, 0) : 0,
      })),
    };
  });

  return <PayoutsHistoryClient rows={rows} />;
}
