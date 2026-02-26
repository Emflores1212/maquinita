import { createAdminClient } from '@/lib/supabase';
import { failure, resolveOperatorId, success } from '../../../_lib';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request, context: { params: { id: string } }) {
  const operatorId = resolveOperatorId(request);
  if (!operatorId) {
    return failure(401, 'UNAUTHORIZED', 'Missing x-operator-id header.');
  }

  const machineId = context.params.id;
  const adminDb = createAdminClient();

  const { data: machineData, error: machineError } = await adminDb
    .from('machines')
    .select('id, name, status, temperature, last_seen_at')
    .eq('operator_id', operatorId)
    .eq('id', machineId)
    .maybeSingle();

  if (machineError) {
    return failure(500, 'QUERY_FAILED', machineError.message);
  }

  if (!machineData?.id) {
    return failure(404, 'NOT_FOUND', 'Machine not found.');
  }

  const sinceIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: readingsData, error: readingsError } = await adminDb
    .from('temperature_readings')
    .select('temperature, recorded_at')
    .eq('operator_id', operatorId)
    .eq('machine_id', machineId)
    .gte('recorded_at', sinceIso)
    .order('recorded_at', { ascending: true });

  if (readingsError) {
    return failure(500, 'QUERY_FAILED', readingsError.message);
  }

  const history = ((readingsData as Array<{ temperature: number; recorded_at: string | null }> | null) ?? []).map((reading) => ({
    temperature: Number(reading.temperature ?? 0),
    recorded_at: reading.recorded_at,
  }));

  return success(
    {
      machine_id: machineData.id,
      machine_name: machineData.name,
      current: {
        temperature: machineData.temperature,
        status: machineData.status,
        last_seen_at: machineData.last_seen_at,
      },
      history,
    },
    {
      page: 1,
      total: history.length,
      limit: history.length,
    }
  );
}
