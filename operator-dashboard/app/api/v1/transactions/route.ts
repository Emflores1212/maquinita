import { createAdminClient } from '@/lib/supabase';
import { failure, parsePage, resolveOperatorId, success } from '../_lib';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const operatorId = resolveOperatorId(request);
  if (!operatorId) {
    return failure(401, 'UNAUTHORIZED', 'Missing x-operator-id header.');
  }

  const adminDb = createAdminClient();
  const url = new URL(request.url);
  const { page, limit, from, to } = parsePage(url.searchParams);

  let query = adminDb
    .from('transactions')
    .select(
      'id, machine_id, discount_id, stripe_charge_id, amount, tax_amount, discount_amount, refund_amount, status, customer_phone, customer_email, is_offline_sync, synced_at, created_at',
      { count: 'exact' }
    )
    .eq('operator_id', operatorId)
    .order('created_at', { ascending: false })
    .range(from, to);

  const since = url.searchParams.get('since')?.trim();
  if (since) {
    query = query.gte('created_at', since);
  }

  const until = url.searchParams.get('until')?.trim();
  if (until) {
    query = query.lte('created_at', until);
  }

  const machineId = url.searchParams.get('machine_id')?.trim();
  if (machineId) {
    query = query.eq('machine_id', machineId);
  }

  const status = url.searchParams.get('status')?.trim();
  if (status) {
    query = query.eq('status', status);
  }

  const { data: txData, error: txError, count } = await query;
  if (txError) {
    return failure(500, 'QUERY_FAILED', txError.message);
  }

  const transactions =
    ((txData as Array<{
      id: string;
      machine_id: string | null;
      discount_id: string | null;
      stripe_charge_id: string | null;
      amount: number | null;
      tax_amount: number | null;
      discount_amount: number | null;
      refund_amount: number | null;
      status: string | null;
      customer_phone: string | null;
      customer_email: string | null;
      is_offline_sync: boolean | null;
      synced_at: string | null;
      created_at: string | null;
    }> | null) ?? []);

  const machineIds = Array.from(new Set(transactions.map((tx) => tx.machine_id).filter((value): value is string => Boolean(value))));
  const machineNameById = new Map<string, string>();

  if (machineIds.length > 0) {
    const { data: machineData } = await adminDb
      .from('machines')
      .select('id, name')
      .eq('operator_id', operatorId)
      .in('id', machineIds);

    for (const row of (machineData as Array<{ id: string; name: string }> | null) ?? []) {
      machineNameById.set(row.id, row.name);
    }
  }

  const rows = transactions.map((tx) => ({
    ...tx,
    machine_name: tx.machine_id ? machineNameById.get(tx.machine_id) ?? null : null,
  }));

  return success(rows, {
    page,
    total: count ?? 0,
    limit,
  });
}
