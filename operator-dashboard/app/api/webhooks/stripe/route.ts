import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { createAdminClient } from '@/lib/supabase';
import { getStripeServer, getStripeWebhookSecret } from '@/lib/stripe';
import { buildDefaultTimeline, appendTimelineStep } from '@/lib/transactions';
import { sendTransactionEmail } from '@/lib/transaction-receipts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function safeJsonParse(value: string | null | undefined, fallback: unknown) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function numberFromMetadata(value: string | null | undefined, fallback = 0) {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function handlePaymentIntentSucceeded(event: Stripe.Event) {
  const paymentIntent = event.data.object as Stripe.PaymentIntent;
  const operatorId = paymentIntent.metadata?.operator_id;

  if (!operatorId) return;

  const machineId = paymentIntent.metadata?.machine_id || null;
  const items = safeJsonParse(paymentIntent.metadata?.items, []);
  const taxAmount = numberFromMetadata(paymentIntent.metadata?.tax_amount, 0);
  const discountAmount = numberFromMetadata(paymentIntent.metadata?.discount_amount, 0);
  const requestedDiscountId = paymentIntent.metadata?.discount_id || null;
  const amount = Number(paymentIntent.amount_received ?? paymentIntent.amount ?? 0) / 100;
  const customerEmail = paymentIntent.receipt_email || paymentIntent.metadata?.customer_email || null;
  const customerPhone = paymentIntent.metadata?.customer_phone || null;
  const cardLast4 = paymentIntent.metadata?.card_last4 || null;
  const createdAt = new Date((event.created ?? Math.floor(Date.now() / 1000)) * 1000).toISOString();

  const adminDb = createAdminClient() as any;
  let resolvedDiscountId: string | null = null;
  let resolvedDiscountType: string | null = null;

  if (requestedDiscountId) {
    const { data: discountData } = await adminDb
      .from('discounts')
      .select('id, type')
      .eq('id', requestedDiscountId)
      .eq('operator_id', operatorId)
      .maybeSingle();

    if (discountData?.id) {
      resolvedDiscountId = discountData.id;
      resolvedDiscountType = discountData.type ?? null;
    }
  }

  const { data: existingData } = await adminDb
    .from('transactions')
    .select('id, refund_amount, customer_email, status, discount_id')
    .eq('operator_id', operatorId)
    .eq('stripe_charge_id', paymentIntent.id)
    .maybeSingle();

  const existing = existingData as
    | {
        id: string;
        refund_amount: number | null;
        customer_email: string | null;
        status: string | null;
        discount_id: string | null;
      }
    | null;
  const timeline = buildDefaultTimeline(createdAt);
  const existingStatus = String(existing?.status ?? '').toLowerCase();
  const alreadyCountedCouponUse =
    existing &&
    (existingStatus === 'completed' || existingStatus === 'refunded') &&
    existing.discount_id &&
    resolvedDiscountId &&
    existing.discount_id === resolvedDiscountId;
  const shouldIncrementCouponUse = Boolean(resolvedDiscountId && resolvedDiscountType === 'coupon' && !alreadyCountedCouponUse);

  let transactionId: string | null = null;
  if (existing?.id) {
    transactionId = existing.id;
    await adminDb
      .from('transactions')
      .update({
        machine_id: machineId,
        amount,
        tax_amount: taxAmount,
        discount_amount: discountAmount,
        discount_id: resolvedDiscountId,
        status: 'completed',
        items,
        customer_phone: customerPhone,
        customer_email: customerEmail,
        card_last4: cardLast4,
        currency: paymentIntent.currency ?? 'usd',
        status_timeline: timeline,
      })
      .eq('id', existing.id)
      .eq('operator_id', operatorId);
  } else {
    const { data: insertedData } = await adminDb
      .from('transactions')
      .insert({
        operator_id: operatorId,
        machine_id: machineId,
        stripe_charge_id: paymentIntent.id,
        amount,
        tax_amount: taxAmount,
        discount_amount: discountAmount,
        discount_id: resolvedDiscountId,
        refund_amount: 0,
        status: 'completed',
        items,
        customer_phone: customerPhone,
        customer_email: customerEmail,
        card_last4: cardLast4,
        currency: paymentIntent.currency ?? 'usd',
        status_timeline: timeline,
        is_offline_sync: false,
        created_at: createdAt,
      })
      .select('id')
      .single();

    transactionId = (insertedData as { id?: string } | null)?.id ?? null;
  }

  if (!transactionId) return;

  if (shouldIncrementCouponUse && resolvedDiscountId) {
    await adminDb.rpc('increment_coupon_uses_count', {
      p_discount_id: resolvedDiscountId,
      p_operator_id: operatorId,
      p_increment: 1,
    });
  }

  const { data: profileData } = await adminDb
    .from('profiles')
    .select('id')
    .eq('operator_id', operatorId)
    .eq('role', 'admin')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  const auditUserId = (profileData as { id?: string } | null)?.id ?? null;

  await adminDb.from('audit_log').insert({
    operator_id: operatorId,
    user_id: auditUserId,
    action: 'transaction.webhook.payment_succeeded',
    entity_type: 'transactions',
    entity_id: transactionId,
    payload: {
      stripe_event_id: event.id,
      stripe_payment_intent_id: paymentIntent.id,
      amount,
      machine_id: machineId,
    },
  });

  if (customerEmail) {
    const { data: txData } = await adminDb
      .from('transactions')
      .select(
        'id, operator_id, machine_id, amount, tax_amount, discount_amount, refund_amount, items, customer_email, card_last4, currency, created_at'
      )
      .eq('id', transactionId)
      .eq('operator_id', operatorId)
      .maybeSingle();

    const tx = txData as
      | {
          id: string;
          operator_id: string;
          machine_id: string | null;
          amount: number | null;
          tax_amount: number | null;
          discount_amount: number | null;
          refund_amount: number | null;
          items: unknown;
          customer_email: string | null;
          card_last4: string | null;
          currency: string | null;
          created_at: string | null;
        }
      | null;

    if (tx?.id) {
      const emailResult = await sendTransactionEmail({
        adminDb,
        transaction: tx,
        mode: 'receipt',
      });

      if (emailResult.ok) {
        await adminDb
          .from('transactions')
          .update({ receipt_sent_at: new Date().toISOString() })
          .eq('id', tx.id)
          .eq('operator_id', operatorId);
      }
    }
  }
}

async function handleRefundCreated(event: Stripe.Event) {
  const refund = event.data.object as Stripe.Refund;
  const paymentIntentId =
    typeof refund.payment_intent === 'string'
      ? refund.payment_intent
      : refund.payment_intent && typeof refund.payment_intent === 'object'
        ? refund.payment_intent.id
        : null;

  if (!paymentIntentId) return;

  const adminDb = createAdminClient() as any;
  const { data: txData } = await adminDb
    .from('transactions')
    .select('id, operator_id, amount, refund_amount, status_timeline, created_at')
    .eq('stripe_charge_id', paymentIntentId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const transaction = txData as
    | {
        id: string;
        operator_id: string;
        amount: number | null;
        refund_amount: number | null;
        status_timeline: unknown;
        created_at: string | null;
      }
    | null;

  if (!transaction?.id) return;

  const refundAmount = Number(refund.amount ?? 0) / 100;
  const nextRefundAmount = Number(transaction.refund_amount ?? 0) + refundAmount;
  const totalAmount = Number(transaction.amount ?? 0);
  const nextStatus = nextRefundAmount >= totalAmount - 0.001 ? 'refunded' : 'refunded';
  const fallbackCreatedAt = transaction.created_at ?? new Date().toISOString();

  const nextTimeline = appendTimelineStep(
    transaction.status_timeline,
    {
      key: 'refund_created',
      label: 'Refund Created',
      at: new Date((event.created ?? Math.floor(Date.now() / 1000)) * 1000).toISOString(),
    },
    fallbackCreatedAt
  );

  await adminDb
    .from('transactions')
    .update({
      refund_amount: nextRefundAmount,
      status: nextStatus,
      refunded_at: new Date().toISOString(),
      status_timeline: nextTimeline,
    })
    .eq('id', transaction.id)
    .eq('operator_id', transaction.operator_id);

  await adminDb.from('audit_log').insert({
    operator_id: transaction.operator_id,
    action: 'transaction.webhook.refund_created',
    entity_type: 'transactions',
    entity_id: transaction.id,
    payload: {
      stripe_event_id: event.id,
      stripe_refund_id: refund.id,
      stripe_payment_intent_id: paymentIntentId,
      refund_amount: refundAmount,
      total_refunded: nextRefundAmount,
    },
  });
}

async function getOperatorIdByStripeAccount(adminDb: any, stripeAccountId: string | null | undefined) {
  if (!stripeAccountId) return null;
  const { data } = await adminDb
    .from('operators')
    .select('id')
    .eq('stripe_account_id', stripeAccountId)
    .maybeSingle();
  return (data as { id?: string } | null)?.id ?? null;
}

async function upsertPayout(params: {
  adminDb: any;
  operatorId: string;
  payout: Stripe.Payout;
}) {
  const createdAt = new Date((params.payout.created ?? Math.floor(Date.now() / 1000)) * 1000).toISOString();

  const { data } = await params.adminDb
    .from('payouts')
    .upsert(
      {
        operator_id: params.operatorId,
        stripe_payout_id: params.payout.id,
        amount: Number(params.payout.amount ?? 0) / 100,
        status: params.payout.status ?? 'pending',
        created_at: createdAt,
      },
      { onConflict: 'stripe_payout_id' }
    )
    .select('id')
    .single();

  return (data as { id?: string } | null)?.id ?? null;
}

async function listPayoutBalanceTransactions(params: {
  stripe: Stripe;
  stripeAccountId: string;
  payoutId: string;
}) {
  const results: Stripe.BalanceTransaction[] = [];
  let hasMore = true;
  let startingAfter: string | undefined;

  while (hasMore) {
    const response = await params.stripe.balanceTransactions.list(
      {
        payout: params.payoutId,
        limit: 100,
        ...(startingAfter ? { starting_after: startingAfter } : {}),
      },
      {
        stripeAccount: params.stripeAccountId,
      }
    );

    results.push(...response.data);
    hasMore = Boolean(response.has_more);
    startingAfter = response.data[response.data.length - 1]?.id;
    if (!startingAfter) hasMore = false;
  }

  return results;
}

async function resolvePaymentIntentReference(params: {
  stripe: Stripe;
  stripeAccountId: string;
  sourceId: string;
  chargeCache: Map<string, string | null>;
  refundCache: Map<string, string | null>;
}) {
  const sourceId = params.sourceId;

  if (sourceId.startsWith('pi_')) return sourceId;

  if (sourceId.startsWith('ch_')) {
    if (params.chargeCache.has(sourceId)) {
      return params.chargeCache.get(sourceId) ?? null;
    }

    const charge = await params.stripe.charges.retrieve(
      sourceId,
      {},
      {
        stripeAccount: params.stripeAccountId,
      }
    );

    const paymentIntentId =
      typeof charge.payment_intent === 'string'
        ? charge.payment_intent
        : charge.payment_intent && typeof charge.payment_intent === 'object'
          ? charge.payment_intent.id
          : null;

    params.chargeCache.set(sourceId, paymentIntentId);
    return paymentIntentId;
  }

  if (sourceId.startsWith('re_')) {
    if (params.refundCache.has(sourceId)) {
      return params.refundCache.get(sourceId) ?? null;
    }

    const refund = await params.stripe.refunds.retrieve(
      sourceId,
      {},
      {
        stripeAccount: params.stripeAccountId,
      }
    );

    const paymentIntentId =
      typeof refund.payment_intent === 'string'
        ? refund.payment_intent
        : refund.payment_intent && typeof refund.payment_intent === 'object'
          ? refund.payment_intent.id
          : null;

    params.refundCache.set(sourceId, paymentIntentId);
    return paymentIntentId;
  }

  return null;
}

async function reconcilePayoutTransactions(params: {
  adminDb: any;
  stripe: Stripe;
  operatorId: string;
  payoutId: string;
  stripePayoutId: string;
  stripeAccountId: string;
}) {
  const balanceTransactions = await listPayoutBalanceTransactions({
    stripe: params.stripe,
    stripeAccountId: params.stripeAccountId,
    payoutId: params.stripePayoutId,
  });

  const chargeCache = new Map<string, string | null>();
  const refundCache = new Map<string, string | null>();

  const transactionRefCache = new Map<string, string | null>();

  const localTransactionLookup = async (paymentIntentId: string | null) => {
    if (!paymentIntentId) return null;
    if (transactionRefCache.has(paymentIntentId)) {
      return transactionRefCache.get(paymentIntentId) ?? null;
    }

    const { data } = await params.adminDb
      .from('transactions')
      .select('id')
      .eq('operator_id', params.operatorId)
      .eq('stripe_charge_id', paymentIntentId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const localId = (data as { id?: string } | null)?.id ?? null;
    transactionRefCache.set(paymentIntentId, localId);
    return localId;
  };

  const upsertRows: Array<{
    payout_id: string;
    transaction_id: string | null;
    operator_id: string;
    stripe_balance_transaction_id: string;
    amount: number;
    fee_amount: number;
    net_amount: number;
  }> = [];

  for (const row of balanceTransactions) {
    const sourceId =
      typeof row.source === 'string' ? row.source : row.source && typeof row.source === 'object' ? row.source.id : null;

    let transactionId: string | null = null;

    if (sourceId) {
      const paymentIntentRef = await resolvePaymentIntentReference({
        stripe: params.stripe,
        stripeAccountId: params.stripeAccountId,
        sourceId,
        chargeCache,
        refundCache,
      });

      transactionId = await localTransactionLookup(paymentIntentRef);
    }

    upsertRows.push({
      payout_id: params.payoutId,
      transaction_id: transactionId,
      operator_id: params.operatorId,
      stripe_balance_transaction_id: row.id,
      amount: Number(row.amount ?? 0) / 100,
      fee_amount: Number(row.fee ?? 0) / 100,
      net_amount: Number(row.net ?? 0) / 100,
    });
  }

  if (upsertRows.length > 0) {
    await params.adminDb.from('payout_transactions').upsert(upsertRows, {
      onConflict: 'payout_id,stripe_balance_transaction_id',
    });
  }

  const mappedTransactionIds = upsertRows.map((row) => row.transaction_id).filter(Boolean) as string[];

  if (mappedTransactionIds.length > 0) {
    const { data: txRowsData } = await params.adminDb
      .from('transactions')
      .select('created_at')
      .eq('operator_id', params.operatorId)
      .in('id', mappedTransactionIds);

    const createdAtDates = ((txRowsData as Array<{ created_at: string | null }> | null) ?? [])
      .map((row) => row.created_at)
      .filter(Boolean)
      .map((value) => new Date(value as string))
      .filter((value) => !Number.isNaN(value.getTime()));

    if (createdAtDates.length > 0) {
      const minDate = new Date(Math.min(...createdAtDates.map((date) => date.getTime())));
      const maxDate = new Date(Math.max(...createdAtDates.map((date) => date.getTime())));

      await params.adminDb
        .from('payouts')
        .update({
          period_start: minDate.toISOString(),
          period_end: maxDate.toISOString(),
        })
        .eq('id', params.payoutId)
        .eq('operator_id', params.operatorId);
    }
  }

  await params.adminDb.from('audit_log').insert({
    operator_id: params.operatorId,
    action: 'financials.payout.reconciled',
    entity_type: 'payouts',
    entity_id: params.payoutId,
    payload: {
      stripe_payout_id: params.stripePayoutId,
      rows_processed: upsertRows.length,
      rows_mapped: mappedTransactionIds.length,
    },
  });
}

async function handlePayoutEvent(event: Stripe.Event) {
  const payout = event.data.object as Stripe.Payout;
  const stripeAccountId = event.account;

  if (!stripeAccountId) return;

  const adminDb = createAdminClient() as any;
  const operatorId = await getOperatorIdByStripeAccount(adminDb, stripeAccountId);

  if (!operatorId) return;

  const payoutId = await upsertPayout({
    adminDb,
    operatorId,
    payout,
  });

  if (!payoutId) return;

  await adminDb.from('audit_log').insert({
    operator_id: operatorId,
    action: 'financials.payout.webhook.received',
    entity_type: 'payouts',
    entity_id: payoutId,
    payload: {
      stripe_event_id: event.id,
      stripe_account_id: stripeAccountId,
      stripe_payout_id: payout.id,
      stripe_status: payout.status,
      stripe_event_type: event.type,
      amount: Number(payout.amount ?? 0) / 100,
    },
  });

  if (event.type === 'payout.paid' || event.type === 'payout.updated') {
    const stripe = getStripeServer();
    await reconcilePayoutTransactions({
      adminDb,
      stripe,
      operatorId,
      payoutId,
      stripePayoutId: payout.id,
      stripeAccountId,
    });
  }
}

async function processStripeEvent(event: Stripe.Event) {
  switch (event.type) {
    case 'payment_intent.succeeded':
      await handlePaymentIntentSucceeded(event);
      return;
    case 'refund.created':
      await handleRefundCreated(event);
      return;
    case 'payout.created':
    case 'payout.updated':
    case 'payout.paid':
    case 'payout.failed':
    case 'payout.canceled':
      await handlePayoutEvent(event);
      return;
    default:
      return;
  }
}

export async function POST(request: Request) {
  const body = await request.text();
  const signature = request.headers.get('stripe-signature');

  if (!signature) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 });
  }

  try {
    const stripe = getStripeServer();
    const event = stripe.webhooks.constructEvent(body, signature, getStripeWebhookSecret());

    queueMicrotask(() => {
      void processStripeEvent(event).catch((error) => {
        console.error('Stripe webhook async processing failed', error);
      });
    });

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to verify stripe webhook signature' },
      { status: 400 }
    );
  }
}
