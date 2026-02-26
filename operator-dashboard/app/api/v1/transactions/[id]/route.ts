import { createAdminClient } from '@/lib/supabase';
import { failure, resolveOperatorId, success } from '../../_lib';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request, context: { params: { id: string } }) {
  const operatorId = resolveOperatorId(request);
  if (!operatorId) {
    return failure(401, 'UNAUTHORIZED', 'Missing x-operator-id header.');
  }

  const transactionId = context.params.id;
  const adminDb = createAdminClient();

  const { data: txData, error: txError } = await adminDb
    .from('transactions')
    .select(
      'id, operator_id, machine_id, discount_id, stripe_charge_id, amount, tax_amount, discount_amount, refund_amount, status, items, customer_phone, customer_email, card_last4, currency, status_timeline, is_offline_sync, synced_at, created_at'
    )
    .eq('operator_id', operatorId)
    .eq('id', transactionId)
    .maybeSingle();

  if (txError) {
    return failure(500, 'QUERY_FAILED', txError.message);
  }

  if (!txData?.id) {
    return failure(404, 'NOT_FOUND', 'Transaction not found.');
  }

  let machine: { id: string; name: string; address: string | null } | null = null;
  if (txData.machine_id) {
    const { data: machineData } = await adminDb
      .from('machines')
      .select('id, name, address')
      .eq('operator_id', operatorId)
      .eq('id', txData.machine_id)
      .maybeSingle();

    machine = (machineData as { id: string; name: string; address: string | null } | null) ?? null;
  }

  return success(
    {
      ...txData,
      machine,
    },
    {
      page: 1,
      total: 1,
      limit: 1,
    }
  );
}
