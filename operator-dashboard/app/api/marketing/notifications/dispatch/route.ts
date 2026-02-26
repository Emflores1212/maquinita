import { NextResponse } from 'next/server';
import { z } from 'zod';
import { hasPermission, type UserRole } from '@/lib/permissions';
import { createRouteHandlerClient, createServerClient } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const payloadSchema = z.object({
  notificationId: z.string().uuid().optional().nullable(),
});

async function resolveOperatorContext() {
  const routeClient = createRouteHandlerClient();
  const {
    data: { user },
  } = await routeClient.auth.getUser();

  if (!user) {
    return { ok: false as const, error: NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 }) };
  }

  const serverClient = createServerClient();
  const db = serverClient as any;
  const { data: profileData } = await db.from('profiles').select('operator_id, role').eq('id', user.id).maybeSingle();
  const profile = profileData as { operator_id: string | null; role: UserRole | null } | null;

  if (!profile?.operator_id) {
    return { ok: false as const, error: NextResponse.json({ ok: false, error: 'Invalid operator profile' }, { status: 403 }) };
  }

  if (!hasPermission(profile.role, 'marketing', 'w')) {
    return { ok: false as const, error: NextResponse.json({ ok: false, error: 'Permission denied' }, { status: 403 }) };
  }

  return { ok: true as const, operatorId: profile.operator_id };
}

export async function POST(request: Request) {
  const auth = await resolveOperatorContext();
  if (!auth.ok) return auth.error;

  const body = await request.json().catch(() => null);
  const parsed = payloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'Invalid payload' }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ ok: false, error: 'Missing function env vars' }, { status: 500 });
  }

  const response = await fetch(`${supabaseUrl}/functions/v1/send-push`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      operator_id: auth.operatorId,
      notification_id: parsed.data.notificationId ?? null,
      source: 'dashboard_dispatch_route',
    }),
    cache: 'no-store',
  }).catch(() => null);

  if (!response?.ok) {
    return NextResponse.json({ ok: false, error: 'Failed to dispatch send-push function' }, { status: 502 });
  }

  const json = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  return NextResponse.json({
    ok: true,
    result: json ?? null,
  });
}
