import { createAdminClient } from '@/lib/supabase';
import { failure, resolveOperatorId, success } from '../../_lib';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request, context: { params: { id: string } }) {
  const operatorId = resolveOperatorId(request);
  if (!operatorId) {
    return failure(401, 'UNAUTHORIZED', 'Missing x-operator-id header.');
  }

  const machineId = context.params.id;
  const adminDb = createAdminClient() as any;

  const { data, error } = await adminDb
    .from('machines')
    .select('id, operator_id, name, mid, type, location_name, address, lat, lng, status, temperature, last_seen_at, settings, notes, created_at')
    .eq('operator_id', operatorId)
    .eq('id', machineId)
    .maybeSingle();

  if (error) {
    return failure(500, 'QUERY_FAILED', error.message);
  }

  if (!data?.id) {
    return failure(404, 'NOT_FOUND', 'Machine not found.');
  }

  return success(data, {
    page: 1,
    total: 1,
    limit: 1,
  });
}
