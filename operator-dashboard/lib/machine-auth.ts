import type { Database } from '@/lib/types';

type MachineRow = Database['public']['Tables']['machines']['Row'];

export type AuthorizedMachine = Pick<MachineRow, 'id' | 'operator_id' | 'api_key' | 'mid' | 'settings'>;

export function resolveMachineApiKey(request: Request) {
  const authHeader = request.headers.get('authorization') ?? request.headers.get('Authorization');
  if (authHeader) {
    const [scheme, token] = authHeader.split(' ');
    if (scheme?.toLowerCase() === 'bearer' && token?.trim()) {
      return token.trim();
    }
  }

  const fallback = request.headers.get('x-machine-api-key');
  return fallback?.trim() ?? null;
}

export async function getAuthorizedMachineByMid(adminDb: any, params: { mid: string; machineApiKey: string }) {
  const { data: machineData } = await adminDb
    .from('machines')
    .select('id, operator_id, api_key, mid, settings')
    .eq('mid', params.mid)
    .maybeSingle();

  const machine = (machineData as AuthorizedMachine | null) ?? null;

  if (!machine?.id || !machine.operator_id || !machine.api_key || machine.api_key !== params.machineApiKey) {
    return null;
  }

  return machine;
}
