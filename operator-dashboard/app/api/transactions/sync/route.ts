import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase';
import { buildDefaultTimeline } from '@/lib/transactions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const offlineTransactionSchema = z.object({
  externalId: z.string().trim().max(120).optional(),
  createdAt: z.string().datetime().optional(),
  stripeChargeId: z.string().trim().optional(),
  discountId: z.string().uuid().optional().nullable(),
  amount: z.number(),
  taxAmount: z.number().optional().default(0),
  discountAmount: z.number().optional().default(0),
  status: z.enum(['pending', 'completed', 'failed', 'refunded']).optional().default('completed'),
  items: z.array(z.any()).optional().default([]),
  customerEmail: z.string().email().optional().nullable(),
  customerPhone: z.string().trim().max(50).optional().nullable(),
  cardLast4: z.string().trim().max(4).optional().nullable(),
  currency: z.string().trim().min(3).max(12).optional().default('usd'),
});

const syncPayloadSchema = z.object({
  machineId: z.string().uuid(),
  transactions: z.array(offlineTransactionSchema).min(1).max(500),
});

function normalizeMachineApiKey(value: string | null) {
  return value?.trim() || null;
}

export async function POST(request: Request) {
  const payloadRaw = await request.json().catch(() => null);
  const parsed = syncPayloadSchema.safeParse(payloadRaw);

  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'Invalid sync payload' }, { status: 400 });
  }

  const machineApiKey = normalizeMachineApiKey(request.headers.get('x-machine-api-key'));
  if (!machineApiKey) {
    return NextResponse.json({ ok: false, error: 'Missing x-machine-api-key header' }, { status: 401 });
  }

  const adminDb = createAdminClient() as any;
  const { data: machineData } = await adminDb
    .from('machines')
    .select('id, operator_id, api_key, name')
    .eq('id', parsed.data.machineId)
    .maybeSingle();

  const machine = machineData as
    | {
        id: string;
        operator_id: string;
        api_key: string | null;
        name: string | null;
      }
    | null;

  if (!machine?.id || !machine.operator_id || !machine.api_key || machine.api_key !== machineApiKey) {
    return NextResponse.json({ ok: false, error: 'Unauthorized machine credentials' }, { status: 401 });
  }

  const requestedDiscountIds = Array.from(
    new Set(
      parsed.data.transactions
        .map((transaction) => transaction.discountId ?? null)
        .filter((value): value is string => Boolean(value))
    )
  );

  let allowedDiscountIds = new Set<string>();
  if (requestedDiscountIds.length > 0) {
    const { data: discountRows } = await adminDb
      .from('discounts')
      .select('id')
      .eq('operator_id', machine.operator_id)
      .in('id', requestedDiscountIds);

    const validIds = ((discountRows as Array<{ id: string }> | null) ?? []).map((row) => row.id);
    if (validIds.length !== requestedDiscountIds.length) {
      return NextResponse.json({ ok: false, error: 'Invalid discountId for machine operator context' }, { status: 400 });
    }

    allowedDiscountIds = new Set(validIds);
  }

  const nowIso = new Date().toISOString();
  const rows = parsed.data.transactions.map((transaction, index) => {
    const createdAt = transaction.createdAt ?? nowIso;
    const timeline = buildDefaultTimeline(createdAt);

    return {
      operator_id: machine.operator_id,
      machine_id: machine.id,
      stripe_charge_id: transaction.stripeChargeId ?? null,
      discount_id: transaction.discountId && allowedDiscountIds.has(transaction.discountId) ? transaction.discountId : null,
      amount: transaction.amount,
      tax_amount: transaction.taxAmount,
      discount_amount: transaction.discountAmount,
      refund_amount: transaction.status === 'refunded' ? transaction.amount : 0,
      status: transaction.status,
      items: transaction.items,
      customer_email: transaction.customerEmail ?? null,
      customer_phone: transaction.customerPhone ?? null,
      card_last4: transaction.cardLast4 ?? null,
      currency: transaction.currency,
      status_timeline: timeline,
      is_offline_sync: true,
      synced_at: nowIso,
      created_at: createdAt,
      receipt_sent_at: null,
      _sort_index: index,
    };
  });

  const insertRows = rows.map(({ _sort_index, ...rest }) => rest);
  const { data: insertedData, error: insertError } = await adminDb.from('transactions').insert(insertRows).select('id');

  if (insertError) {
    return NextResponse.json({ ok: false, error: insertError.message }, { status: 500 });
  }

  const inserted = (insertedData as Array<{ id: string }> | null) ?? [];

  const usageIncrements = rows
    .filter((row) => row.discount_id && (row.status === 'completed' || row.status === 'refunded'))
    .reduce<Map<string, number>>((map, row) => {
      const discountId = row.discount_id as string;
      map.set(discountId, (map.get(discountId) ?? 0) + 1);
      return map;
    }, new Map());

  for (const [discountId, incrementBy] of usageIncrements) {
    await adminDb.rpc('increment_coupon_uses_count', {
      p_discount_id: discountId,
      p_operator_id: machine.operator_id,
      p_increment: incrementBy,
    });
  }

  await adminDb.from('alerts').insert({
    operator_id: machine.operator_id,
    machine_id: machine.id,
    type: 'OFFLINE_SYNC',
    severity: 'info',
    message: `${inserted.length} offline transactions synced`,
  });

  await adminDb.from('audit_log').insert({
    operator_id: machine.operator_id,
    action: 'transactions.offline_synced',
    entity_type: 'transactions',
    payload: {
      machine_id: machine.id,
      machine_name: machine.name,
      synced_count: inserted.length,
      synced_at: nowIso,
    },
  });

  return NextResponse.json(
    {
      ok: true,
      syncedCount: inserted.length,
      syncedAt: nowIso,
      message: `${inserted.length} offline transactions synced`,
    },
    { status: 200 }
  );
}
