'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase';
import { getStripeServer } from '@/lib/stripe';
import { parseTransactionItems, appendTimelineStep } from '@/lib/transactions';
import { sendTransactionEmail } from '@/lib/transaction-receipts';
import { insertAuditLog, requireActionContext, requirePermission } from '@/app/actions/_shared';

const refundSchema = z
  .object({
    transactionId: z.string().uuid(),
    mode: z.enum(['full', 'partial']),
    reason: z.enum(['customer_complaint', 'quality', 'machine_error', 'duplicate', 'other']),
    otherReason: z.string().trim().max(500).optional().nullable(),
    lineItemIndexes: z.array(z.number().int().min(0)).optional(),
    customAmount: z.number().positive().optional(),
  })
  .refine((value) => value.mode !== 'partial' || Boolean(value.customAmount || (value.lineItemIndexes?.length ?? 0) > 0), {
    message: 'Partial refund requires selected items or custom amount',
    path: ['lineItemIndexes'],
  });

const resendReceiptSchema = z.object({
  transactionId: z.string().uuid(),
});

const receiptTemplateSchema = z.object({
  logoUrl: z.string().trim().max(1000).optional().nullable(),
  primaryColor: z
    .string()
    .trim()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional()
    .nullable(),
  footerText: z.string().trim().max(500).optional().nullable(),
  supportEmail: z.string().trim().email().optional().nullable(),
  supportPhone: z.string().trim().max(50).optional().nullable(),
});

function centsFromDollars(value: number) {
  return Math.round(value * 100);
}

function dollarsFromCents(value: number) {
  return Math.round(value) / 100;
}

export async function issueRefundAction(payload: z.infer<typeof refundSchema>) {
  const parsed = refundSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false as const, error: 'Invalid refund payload' };
  }

  const ctx = await requireActionContext();
  if ('error' in ctx) return { ok: false as const, error: ctx.error };
  const permission = requirePermission(ctx.role, 'transactions', 'w');
  if (!permission.ok) return { ok: false as const, error: permission.error };

  const adminDb = createAdminClient();
  const { data: transactionData } = await adminDb
    .from('transactions')
    .select(
      'id, operator_id, stripe_charge_id, amount, refund_amount, status, items, machine_id, customer_email, tax_amount, discount_amount, card_last4, currency, created_at, status_timeline'
    )
    .eq('id', parsed.data.transactionId)
    .eq('operator_id', ctx.operatorId)
    .maybeSingle();

  const transaction = transactionData as
    | {
        id: string;
        operator_id: string;
        stripe_charge_id: string | null;
        amount: number | null;
        refund_amount: number | null;
        status: string | null;
        items: unknown;
        machine_id: string | null;
        customer_email: string | null;
        tax_amount: number | null;
        discount_amount: number | null;
        card_last4: string | null;
        currency: string | null;
        created_at: string | null;
        status_timeline: unknown;
      }
    | null;

  if (!transaction?.id) {
    return { ok: false as const, error: 'Transaction not found' };
  }

  if (!transaction.stripe_charge_id) {
    return { ok: false as const, error: 'Transaction has no Stripe payment_intent reference' };
  }

  const totalAmount = Number(transaction.amount ?? 0);
  const currentRefunded = Number(transaction.refund_amount ?? 0);
  const refundable = Math.max(0, totalAmount - currentRefunded);

  if (refundable <= 0) {
    return { ok: false as const, error: 'Transaction is already fully refunded' };
  }

  let refundAmount = refundable;
  if (parsed.data.mode === 'partial') {
    if (parsed.data.customAmount && Number.isFinite(parsed.data.customAmount)) {
      refundAmount = parsed.data.customAmount;
    } else {
      const items = parseTransactionItems(transaction.items);
      const selected = new Set(parsed.data.lineItemIndexes ?? []);
      refundAmount = items.reduce((sum, item, index) => (selected.has(index) ? sum + item.lineTotal : sum), 0);
    }
  }

  if (!Number.isFinite(refundAmount) || refundAmount <= 0) {
    return { ok: false as const, error: 'Refund amount must be greater than 0' };
  }

  if (refundAmount > refundable) {
    return { ok: false as const, error: 'Refund amount exceeds refundable balance' };
  }

  const refundCents = centsFromDollars(refundAmount);
  if (refundCents <= 0) {
    return { ok: false as const, error: 'Invalid refund amount' };
  }

  const stripe = getStripeServer();
  let stripeRefundId: string;
  try {
    const stripeRefund = await stripe.refunds.create({
      payment_intent: transaction.stripe_charge_id,
      amount: refundCents,
      metadata: {
        operator_id: ctx.operatorId,
        transaction_id: transaction.id,
        reason: parsed.data.reason,
        mode: parsed.data.mode,
      },
    });
    stripeRefundId = stripeRefund.id;
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : 'Stripe refund request failed',
    };
  }

  const updatedRefundAmount = dollarsFromCents(centsFromDollars(currentRefunded + refundAmount));
  const nextStatus = updatedRefundAmount >= totalAmount - 0.001 ? 'refunded' : 'refunded';
  const fallbackCreatedAt = transaction.created_at ?? new Date().toISOString();
  const nextTimeline = appendTimelineStep(
    transaction.status_timeline,
    {
      key: 'refund_created',
      label: `Refund Created (${parsed.data.mode})`,
      at: new Date().toISOString(),
    },
    fallbackCreatedAt
  );

  const { error: updateError } = await adminDb
    .from('transactions')
    .update({
      status: nextStatus,
      refund_amount: updatedRefundAmount,
      refunded_at: new Date().toISOString(),
      status_timeline: nextTimeline,
    })
    .eq('id', transaction.id)
    .eq('operator_id', ctx.operatorId);

  if (updateError) {
    return { ok: false as const, error: 'Refund created but local transaction update failed' };
  }

  const emailResult = await sendTransactionEmail({
    adminDb,
    transaction: {
      ...transaction,
      refund_amount: updatedRefundAmount,
    },
    mode: 'refund',
    refundAmount,
  });

  await insertAuditLog(adminDb, {
    operator_id: ctx.operatorId,
    user_id: ctx.userId,
    action: 'transaction.refund.created',
    entity_type: 'transactions',
    entity_id: transaction.id,
    payload: {
      transaction_id: transaction.id,
      stripe_refund_id: stripeRefundId,
      mode: parsed.data.mode,
      amount: refundAmount,
      reason: parsed.data.reason,
      other_reason: parsed.data.reason === 'other' ? parsed.data.otherReason ?? null : null,
      email_sent: emailResult.ok,
    },
  });

  revalidatePath('/transactions');
  revalidatePath('/dashboard');

  return {
    ok: true as const,
    refundAmount,
    totalRefunded: updatedRefundAmount,
    status: nextStatus,
    emailSent: emailResult.ok,
  };
}

export async function resendTransactionReceiptAction(payload: z.infer<typeof resendReceiptSchema>) {
  const parsed = resendReceiptSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false as const, error: 'Invalid transaction id' };
  }

  const ctx = await requireActionContext();
  if ('error' in ctx) return { ok: false as const, error: ctx.error };
  const permission = requirePermission(ctx.role, 'transactions', 'w');
  if (!permission.ok) return { ok: false as const, error: permission.error };

  const adminDb = createAdminClient();
  const { data: transactionData } = await adminDb
    .from('transactions')
    .select(
      'id, operator_id, machine_id, amount, tax_amount, discount_amount, refund_amount, items, customer_email, card_last4, currency, created_at'
    )
    .eq('id', parsed.data.transactionId)
    .eq('operator_id', ctx.operatorId)
    .maybeSingle();

  const transaction = transactionData as
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

  if (!transaction?.id) {
    return { ok: false as const, error: 'Transaction not found' };
  }

  if (!transaction.customer_email) {
    return { ok: false as const, error: 'Transaction has no customer email' };
  }

  const emailResult = await sendTransactionEmail({
    adminDb,
    transaction,
    mode: 'receipt',
  });

  if (!emailResult.ok) {
    return { ok: false as const, error: emailResult.error ?? 'Failed to send receipt email' };
  }

  await adminDb
    .from('transactions')
    .update({
      receipt_sent_at: new Date().toISOString(),
    })
    .eq('id', transaction.id)
    .eq('operator_id', ctx.operatorId);

  await insertAuditLog(adminDb, {
    operator_id: ctx.operatorId,
    user_id: ctx.userId,
    action: 'transaction.receipt.resent',
    entity_type: 'transactions',
    entity_id: transaction.id,
    payload: {
      transaction_id: transaction.id,
      customer_email: transaction.customer_email,
    },
  });

  revalidatePath('/transactions');
  return { ok: true as const };
}

export async function saveReceiptTemplateAction(payload: z.infer<typeof receiptTemplateSchema>) {
  const parsed = receiptTemplateSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false as const, error: 'Invalid receipt template payload' };
  }

  const ctx = await requireActionContext();
  if ('error' in ctx) return { ok: false as const, error: ctx.error };
  const permission = requirePermission(ctx.role, 'settings', 'w');
  if (!permission.ok) return { ok: false as const, error: permission.error };

  const adminDb = createAdminClient();
  const { data: operatorData } = await adminDb.from('operators').select('branding').eq('id', ctx.operatorId).maybeSingle();
  const currentBranding = ((operatorData as { branding?: Record<string, unknown> } | null)?.branding ?? {}) as Record<string, unknown>;

  const nextBranding = {
    ...currentBranding,
    receiptLogoUrl: parsed.data.logoUrl ?? null,
    receiptPrimaryColor: parsed.data.primaryColor ?? '#0D2B4E',
    receiptFooterText: parsed.data.footerText ?? null,
    receiptSupportEmail: parsed.data.supportEmail ?? null,
    receiptSupportPhone: parsed.data.supportPhone ?? null,
  };

  const { error: updateError } = await adminDb
    .from('operators')
    .update({
      branding: nextBranding,
    })
    .eq('id', ctx.operatorId);

  if (updateError) {
    return { ok: false as const, error: 'Failed to save receipt template settings' };
  }

  await insertAuditLog(adminDb, {
    operator_id: ctx.operatorId,
    user_id: ctx.userId,
    action: 'settings.receipt_template.updated',
    entity_type: 'operators',
    entity_id: ctx.operatorId,
    payload: {
      receiptPrimaryColor: parsed.data.primaryColor ?? '#0D2B4E',
      hasLogo: Boolean(parsed.data.logoUrl),
    },
  });

  revalidatePath('/settings');
  return { ok: true as const };
}
