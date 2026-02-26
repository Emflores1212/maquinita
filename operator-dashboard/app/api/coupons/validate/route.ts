import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function safeDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code')?.trim().toUpperCase() ?? '';
  const machineId = url.searchParams.get('machineId')?.trim() ?? '';

  if (!code || !machineId) {
    return NextResponse.json({ valid: false, error: 'Missing code or machineId' }, { status: 400 });
  }

  const adminDb = createAdminClient() as any;

  const { data: machineData } = await adminDb
    .from('machines')
    .select('id, operator_id, status')
    .eq('id', machineId)
    .maybeSingle();

  const machine = machineData as { id: string; operator_id: string; status: string | null } | null;
  if (!machine?.id || !machine.operator_id || machine.status === 'archived') {
    return NextResponse.json({ valid: false }, { status: 200 });
  }

  const { data: discountData } = await adminDb
    .from('discounts')
    .select('id, operator_id, type, value, value_type, status, starts_at, ends_at, max_uses, uses_count, target_machine_ids')
    .eq('operator_id', machine.operator_id)
    .eq('type', 'coupon')
    .eq('coupon_code', code)
    .maybeSingle();

  const discount = discountData as
    | {
        id: string;
        operator_id: string;
        type: 'coupon';
        value: number;
        value_type: 'percentage' | 'fixed';
        status: string;
        starts_at: string | null;
        ends_at: string | null;
        max_uses: number | null;
        uses_count: number | null;
        target_machine_ids: string[] | null;
      }
    | null;

  if (!discount?.id) {
    return NextResponse.json({ valid: false }, { status: 200 });
  }

  if (String(discount.status).toLowerCase() !== 'active') {
    return NextResponse.json({ valid: false }, { status: 200 });
  }

  const now = new Date();
  const startsAt = safeDate(discount.starts_at);
  const endsAt = safeDate(discount.ends_at);

  if (startsAt && startsAt > now) {
    return NextResponse.json({ valid: false }, { status: 200 });
  }

  if (endsAt && endsAt <= now) {
    return NextResponse.json({ valid: false }, { status: 200 });
  }

  const maxUses = Number(discount.max_uses ?? 0);
  const usesCount = Number(discount.uses_count ?? 0);
  if (maxUses > 0 && usesCount >= maxUses) {
    return NextResponse.json({ valid: false }, { status: 200 });
  }

  const machineTargets = discount.target_machine_ids ?? [];
  if (machineTargets.length > 0 && !machineTargets.includes(machine.id)) {
    return NextResponse.json({ valid: false }, { status: 200 });
  }

  return NextResponse.json(
    {
      valid: true,
      discountValue: Number(discount.value ?? 0),
      valueType: discount.value_type,
      discountId: discount.id,
    },
    { status: 200 }
  );
}
