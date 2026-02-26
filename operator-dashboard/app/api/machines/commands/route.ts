import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const commandUpdateSchema = z.object({
  mid: z.string().min(1),
  commandId: z.string().uuid(),
  event: z.enum(['acknowledged', 'executed', 'failed']),
  errorMessage: z.string().trim().max(500).optional(),
});

function resolveMachineApiKey(request: Request) {
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

async function getAuthorizedMachine(adminDb: any, mid: string, machineApiKey: string) {
  const { data: machineData } = await adminDb
    .from('machines')
    .select('id, operator_id, api_key, mid, settings')
    .eq('mid', mid)
    .maybeSingle();

  const machine = machineData as
    | {
        id: string;
        operator_id: string;
        api_key: string | null;
        mid: string;
        settings: Record<string, unknown> | null;
      }
    | null;

  if (!machine?.id || !machine.operator_id || !machine.api_key || machine.api_key !== machineApiKey) {
    return null;
  }

  return machine;
}

export async function GET(request: Request) {
  const machineApiKey = resolveMachineApiKey(request);
  if (!machineApiKey) {
    return NextResponse.json({ ok: false, error: 'Missing machine credentials' }, { status: 401 });
  }

  const url = new URL(request.url);
  const mid = url.searchParams.get('mid')?.trim();

  if (!mid) {
    return NextResponse.json({ ok: false, error: 'Missing mid query parameter' }, { status: 400 });
  }

  const adminDb = createAdminClient() as any;
  const machine = await getAuthorizedMachine(adminDb, mid, machineApiKey);

  if (!machine) {
    return NextResponse.json({ ok: false, error: 'Unauthorized machine credentials' }, { status: 401 });
  }

  const { data: commandData } = await adminDb
    .from('machine_commands')
    .select('id, type, payload, issued_at')
    .eq('machine_id', machine.id)
    .eq('operator_id', machine.operator_id)
    .eq('status', 'pending')
    .order('issued_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!commandData?.id) {
    return NextResponse.json({ ok: true, command: null }, { status: 200 });
  }

  return NextResponse.json(
    {
      ok: true,
      command: {
        id: commandData.id,
        type: commandData.type,
        payload: commandData.payload,
        issued_at: commandData.issued_at,
      },
    },
    { status: 200 }
  );
}

export async function POST(request: Request) {
  const machineApiKey = resolveMachineApiKey(request);
  if (!machineApiKey) {
    return NextResponse.json({ ok: false, error: 'Missing machine credentials' }, { status: 401 });
  }

  const payloadRaw = await request.json().catch(() => null);
  const parsed = commandUpdateSchema.safeParse(payloadRaw);

  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'Invalid command update payload' }, { status: 400 });
  }

  const adminDb = createAdminClient() as any;
  const machine = await getAuthorizedMachine(adminDb, parsed.data.mid, machineApiKey);

  if (!machine) {
    return NextResponse.json({ ok: false, error: 'Unauthorized machine credentials' }, { status: 401 });
  }

  const { data: commandData } = await adminDb
    .from('machine_commands')
    .select('id, status, type, issued_at, acknowledged_at, issued_by')
    .eq('id', parsed.data.commandId)
    .eq('machine_id', machine.id)
    .eq('operator_id', machine.operator_id)
    .maybeSingle();

  const command = commandData as
    | {
        id: string;
        status: 'pending' | 'acknowledged' | 'executed' | 'failed';
        type: 'LOCKDOWN' | 'UNLOCK' | 'REBOOT' | 'TEMP_ADJUST';
        issued_at: string;
        acknowledged_at: string | null;
        issued_by: string | null;
      }
    | null;

  if (!command?.id) {
    return NextResponse.json({ ok: false, error: 'Command not found' }, { status: 404 });
  }

  const event = parsed.data.event;
  const currentStatus = command.status;

  if (event === 'acknowledged' && currentStatus !== 'pending') {
    return NextResponse.json({ ok: false, error: 'Invalid command state transition' }, { status: 409 });
  }

  if (event === 'executed' && !['pending', 'acknowledged'].includes(currentStatus)) {
    return NextResponse.json({ ok: false, error: 'Invalid command state transition' }, { status: 409 });
  }

  if (event === 'failed' && !['pending', 'acknowledged'].includes(currentStatus)) {
    return NextResponse.json({ ok: false, error: 'Invalid command state transition' }, { status: 409 });
  }

  const nowIso = new Date().toISOString();
  const updatePayload: Record<string, unknown> = {};
  let auditAction = '';

  if (event === 'acknowledged') {
    updatePayload.status = 'acknowledged';
    updatePayload.acknowledged_at = nowIso;
    auditAction = 'machine.command.acknowledged';
  }

  if (event === 'executed') {
    updatePayload.status = 'executed';
    updatePayload.executed_at = nowIso;
    updatePayload.acknowledged_at = command.acknowledged_at ?? nowIso;
    auditAction = 'machine.command.executed';
  }

  if (event === 'failed') {
    updatePayload.status = 'failed';
    updatePayload.error_message = parsed.data.errorMessage ?? 'Command execution failed';
    auditAction = 'machine.command.failed';
  }

  await adminDb
    .from('machine_commands')
    .update(updatePayload)
    .eq('id', command.id)
    .eq('machine_id', machine.id)
    .eq('operator_id', machine.operator_id);

  if (event === 'executed' && (command.type === 'LOCKDOWN' || command.type === 'UNLOCK')) {
    const nextLockState = command.type === 'LOCKDOWN' ? 'locked' : 'unlocked';
    const nextSettings = {
      ...(machine.settings ?? {}),
      lockState: nextLockState,
    };

    await adminDb
      .from('machines')
      .update({ settings: nextSettings })
      .eq('id', machine.id)
      .eq('operator_id', machine.operator_id);
  }

  await adminDb.from('audit_log').insert({
    operator_id: machine.operator_id,
    user_id: command.issued_by,
    action: auditAction,
    entity_type: 'machine_commands',
    entity_id: command.id,
    payload: {
      machine_id: machine.id,
      mid: machine.mid,
      event,
      type: command.type,
      error_message: parsed.data.errorMessage ?? null,
    },
  });

  return NextResponse.json({ ok: true }, { status: 200 });
}
