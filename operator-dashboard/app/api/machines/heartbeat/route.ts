import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAlert, resolveOpenAlert } from '@/lib/alerts';
import { createAdminClient } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const heartbeatSchema = z.object({
  mid: z.string().min(1),
  temperature: z.number(),
  rfidReaderStatus: z.enum(['ok', 'error']),
  connectivityType: z.string().min(1).optional(),
  firmwareVersion: z.string().min(1).optional(),
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

function resolveThreshold(settings: unknown): number {
  const raw = (settings as { tempThreshold?: unknown } | null)?.tempThreshold;
  const threshold = Number(raw ?? 42);
  return Number.isFinite(threshold) ? threshold : 42;
}

function resolveAutoLockdown(settings: unknown): boolean {
  return Boolean((settings as { autoLockdown?: unknown } | null)?.autoLockdown);
}

export async function POST(request: Request) {
  const machineApiKey = resolveMachineApiKey(request);
  if (!machineApiKey) {
    return NextResponse.json({ ok: false, error: 'Missing machine credentials' }, { status: 401 });
  }

  const payloadRaw = await request.json().catch(() => null);
  const parsed = heartbeatSchema.safeParse(payloadRaw);

  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'Invalid heartbeat payload' }, { status: 400 });
  }

  const adminDb = createAdminClient() as any;

  const { data: machineData } = await adminDb
    .from('machines')
    .select('id, operator_id, api_key, mid, settings')
    .eq('mid', parsed.data.mid)
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
    return NextResponse.json({ ok: false, error: 'Unauthorized machine credentials' }, { status: 401 });
  }

  const threshold = resolveThreshold(machine.settings);
  const tooWarm = Number(parsed.data.temperature) > threshold;
  const nowIso = new Date().toISOString();
  const nextSettings = {
    ...(machine.settings ?? {}),
    lastConnectivityType: parsed.data.connectivityType ?? null,
    lastFirmwareVersion: parsed.data.firmwareVersion ?? null,
    lastHeartbeatAt: nowIso,
  };

  await adminDb
    .from('machines')
    .update({
      temperature: parsed.data.temperature,
      last_seen_at: nowIso,
      status: tooWarm ? 'warning' : 'online',
      settings: nextSettings,
    })
    .eq('id', machine.id)
    .eq('operator_id', machine.operator_id);

  await adminDb.from('temperature_readings').insert({
    operator_id: machine.operator_id,
    machine_id: machine.id,
    temperature: parsed.data.temperature,
    recorded_at: nowIso,
  });

  await resolveOpenAlert(adminDb, machine.operator_id, machine.id, 'OFFLINE');

  if (parsed.data.rfidReaderStatus === 'error') {
    await createAlert({
      adminDb,
      operatorId: machine.operator_id,
      machineId: machine.id,
      type: 'RFID_ERROR',
      severity: 'warning',
      message: 'RFID reader reported error status in heartbeat.',
      respectDelay: true,
    });
  } else {
    await resolveOpenAlert(adminDb, machine.operator_id, machine.id, 'RFID_ERROR');
  }

  if (tooWarm) {
    const alertResult = await createAlert({
      adminDb,
      operatorId: machine.operator_id,
      machineId: machine.id,
      type: 'TOO_WARM',
      severity: 'warning',
      message: `Machine temperature ${Number(parsed.data.temperature).toFixed(1)}F exceeded threshold ${threshold.toFixed(1)}F.`,
      respectDelay: true,
    });

    if ((alertResult.created || alertResult.alert) && resolveAutoLockdown(machine.settings)) {
      const { data: pendingData } = await adminDb
        .from('machine_commands')
        .select('id')
        .eq('operator_id', machine.operator_id)
        .eq('machine_id', machine.id)
        .eq('type', 'LOCKDOWN')
        .in('status', ['pending', 'acknowledged'])
        .limit(1)
        .maybeSingle();

      if (!pendingData?.id) {
        await adminDb.from('machine_commands').insert({
          operator_id: machine.operator_id,
          machine_id: machine.id,
          type: 'LOCKDOWN',
          status: 'pending',
          payload: {
            reason: 'TOO_WARM',
            temperature: parsed.data.temperature,
            threshold,
            heartbeatAt: nowIso,
            connectivityType: parsed.data.connectivityType ?? null,
            firmwareVersion: parsed.data.firmwareVersion ?? null,
          },
        });

        await adminDb
          .from('machines')
          .update({
            settings: {
              ...nextSettings,
              lockState: 'locked_pending',
            },
          })
          .eq('id', machine.id)
          .eq('operator_id', machine.operator_id);
      }
    }
  } else {
    await resolveOpenAlert(adminDb, machine.operator_id, machine.id, 'TOO_WARM');
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
