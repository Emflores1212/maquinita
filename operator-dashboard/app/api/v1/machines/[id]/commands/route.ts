import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase';
import { canUseCommands, failure, resolveOperatorId, success } from '../../../_lib';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const issueCommandSchema = z.object({
  type: z.enum(['LOCKDOWN', 'REBOOT', 'UNLOCK']),
  payload: z.record(z.any()).optional(),
});

export async function POST(request: Request, context: { params: { id: string } }) {
  const operatorId = resolveOperatorId(request);
  if (!operatorId) {
    return failure(401, 'UNAUTHORIZED', 'Missing x-operator-id header.');
  }

  if (!canUseCommands(request)) {
    return failure(403, 'FORBIDDEN', 'API key does not have command permission.');
  }

  const payloadRaw = await request.json().catch(() => null);
  const parsed = issueCommandSchema.safeParse(payloadRaw);
  if (!parsed.success) {
    return failure(400, 'BAD_REQUEST', parsed.error.issues[0]?.message ?? 'Invalid command payload.');
  }

  const machineId = context.params.id;
  const adminDb = createAdminClient() as any;

  const { data: machineData } = await adminDb
    .from('machines')
    .select('id, operator_id')
    .eq('operator_id', operatorId)
    .eq('id', machineId)
    .maybeSingle();

  if (!machineData?.id) {
    return failure(404, 'NOT_FOUND', 'Machine not found.');
  }

  const { data: commandData, error: commandError } = await adminDb
    .from('machine_commands')
    .insert({
      machine_id: machineId,
      operator_id: operatorId,
      type: parsed.data.type,
      payload: parsed.data.payload ?? {},
      status: 'pending',
      issued_by: null,
    })
    .select('id, type, status, payload, issued_at')
    .maybeSingle();

  if (commandError) {
    if (commandError.code === '23505') {
      return failure(409, 'CONFLICT', 'There is already an active command of this type for this machine.');
    }
    return failure(500, 'QUERY_FAILED', commandError.message);
  }

  await adminDb.from('audit_log').insert({
    operator_id: operatorId,
    user_id: null,
    action: 'api.v1.machine.command.issued',
    entity_type: 'machine_commands',
    entity_id: commandData?.id ?? null,
    payload: {
      machine_id: machineId,
      type: parsed.data.type,
      source: 'api_v1',
    },
  });

  return success(commandData ?? null, {
    page: 1,
    total: commandData?.id ? 1 : 0,
    limit: 1,
  });
}
