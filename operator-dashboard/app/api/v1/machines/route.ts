import { createAdminClient } from '@/lib/supabase';
import { failure, parsePage, resolveOperatorId, success } from '../_lib';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const operatorId = resolveOperatorId(request);
  if (!operatorId) {
    return failure(401, 'UNAUTHORIZED', 'Missing x-operator-id header.');
  }

  const adminDb = createAdminClient() as any;
  const { searchParams } = new URL(request.url);
  const { page, limit, from, to } = parsePage(searchParams);

  let query = adminDb
    .from('machines')
    .select(
      'id, operator_id, name, mid, type, location_name, address, lat, lng, status, temperature, last_seen_at, settings, created_at',
      { count: 'exact' }
    )
    .eq('operator_id', operatorId)
    .order('name', { ascending: true })
    .range(from, to);

  const status = searchParams.get('status')?.trim();
  if (status) {
    query = query.eq('status', status);
  }

  const type = searchParams.get('type')?.trim();
  if (type) {
    query = query.eq('type', type);
  }

  const { data, error, count } = await query;
  if (error) {
    return failure(500, 'QUERY_FAILED', error.message);
  }

  return success(data ?? [], {
    page,
    total: count ?? 0,
    limit,
  });
}
