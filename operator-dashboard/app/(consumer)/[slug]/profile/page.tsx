import { notFound, redirect } from 'next/navigation';
import ConsumerProfileClient from '@/components/consumer/ConsumerProfileClient';
import type { ConsumerFeedbackTarget, ConsumerPurchaseRow } from '@/components/consumer/types';
import { createAdminClient, createServerClient } from '@/lib/supabase';
import { parseTransactionItems } from '@/lib/transactions';
import type { Json } from '@/lib/types';

function summarizeItems(items: Json | null) {
  const parsed = parseTransactionItems(items ?? []);
  if (parsed.length === 0) {
    return '-';
  }

  const compact = parsed.map((item) => `${item.quantity}x ${item.name}`);
  if (compact.length <= 2) {
    return compact.join(', ');
  }

  return `${compact.slice(0, 2).join(', ')} +${compact.length - 2} more`;
}

function firstProduct(items: Json | null) {
  const parsed = parseTransactionItems(items ?? []);
  if (parsed.length === 0) {
    return null;
  }

  const first = parsed[0];
  return {
    productId: first.productId,
    productName: first.name,
  };
}

type PurchaseTargetDraft = ConsumerFeedbackTarget & {
  createdAt: string;
};

type ConsumerProfileRow = {
  id: string;
  operator_id: string;
  phone: string | null;
  full_name: string | null;
  credit_balance: number | null;
  notification_opt_in: boolean | null;
};

export default async function ConsumerProfilePage({ params }: { params: { slug: string } }) {
  const supabase = createServerClient();
  const db = supabase;

  const { data: operatorData } = await db.from('operators').select('id, slug').eq('slug', params.slug).maybeSingle();
  const operator = operatorData as { id: string; slug: string } | null;

  if (!operator?.id) {
    notFound();
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/${params.slug}/login?returnUrl=/${params.slug}/profile`);
  }

  const adminDb = createAdminClient();
  const adminDbAny = adminDb as any;

  const consumerProfileResult = await adminDbAny
    .from('consumer_profiles')
    .select('id, operator_id, phone, full_name, credit_balance, notification_opt_in')
    .eq('id', user.id)
    .eq('operator_id', operator.id)
    .maybeSingle();
  let consumerProfileData = consumerProfileResult.data as ConsumerProfileRow | null;

  if (!consumerProfileData?.id) {
    const fallbackPhone = typeof user.phone === 'string' && user.phone.trim().length > 0 ? user.phone.trim() : null;
    const fallbackName =
      typeof user.user_metadata?.full_name === 'string' && user.user_metadata.full_name.trim().length > 0
        ? user.user_metadata.full_name.trim()
        : null;

    await adminDbAny.from('consumer_profiles').upsert(
      {
        id: user.id,
        operator_id: operator.id,
        phone: fallbackPhone,
        full_name: fallbackName,
      },
      { onConflict: 'id' }
    );

    const refreshed = await adminDbAny
      .from('consumer_profiles')
      .select('id, operator_id, phone, full_name, credit_balance, notification_opt_in')
      .eq('id', user.id)
      .eq('operator_id', operator.id)
      .maybeSingle();

    consumerProfileData = refreshed.data as ConsumerProfileRow | null;
  }

  const consumerProfile = consumerProfileData;

  if (!consumerProfile?.id) {
    redirect(`/${params.slug}/login?returnUrl=/${params.slug}/profile`);
  }

  const consumerPhone =
    typeof consumerProfile.phone === 'string' && consumerProfile.phone.trim().length > 0
      ? consumerProfile.phone.trim()
      : typeof user.phone === 'string' && user.phone.trim().length > 0
        ? user.phone.trim()
        : null;

  const transactionRows = consumerPhone
    ? ((
        (await adminDb
          .from('transactions')
          .select('id, amount, created_at, machine_id, items')
          .eq('operator_id', operator.id)
          .eq('customer_phone', consumerPhone)
          .in('status', ['completed', 'refunded'])
          .order('created_at', { ascending: false })
          .limit(20)).data as Array<{
          id: string;
          amount: number | null;
          created_at: string | null;
          machine_id: string | null;
          items: Json | null;
        }> | null
      ) ?? [])
    : [];

  const machineIds = [...new Set(transactionRows.map((row) => row.machine_id).filter(Boolean))] as string[];

  const machineRows = machineIds.length
    ? ((
        (await adminDb
          .from('machines')
          .select('id, name')
          .eq('operator_id', operator.id)
          .in('id', machineIds)).data as Array<{ id: string; name: string }> | null
      ) ?? [])
    : [];

  const machineNameById = new Map(machineRows.map((row) => [row.id, row.name]));

  const purchases: ConsumerPurchaseRow[] = transactionRows.map((row) => ({
    id: row.id,
    createdAt: row.created_at ?? new Date().toISOString(),
    amount: Number(row.amount ?? 0),
    machineName: (row.machine_id ? machineNameById.get(row.machine_id) : null) ?? '-',
    itemsSummary: summarizeItems(row.items),
  }));

  const purchaseTargets: PurchaseTargetDraft[] = [];
  for (const row of transactionRows) {
    const first = firstProduct(row.items);
    if (!first?.productId) {
      continue;
    }

    purchaseTargets.push({
      transactionId: row.id,
      createdAt: row.created_at ?? new Date().toISOString(),
      machineId: row.machine_id,
      machineName: (row.machine_id ? machineNameById.get(row.machine_id) : null) ?? '-',
      productId: first.productId,
      productName: first.productName,
    });
  }

  const feedbackRows = purchaseTargets.length
    ? ((
        (await adminDbAny
          .from('consumer_feedback')
          .select('machine_id, product_id, created_at')
          .eq('operator_id', operator.id)
          .eq('consumer_id', user.id)).data as Array<{
          machine_id: string | null;
          product_id: string | null;
          created_at: string | null;
        }> | null
      ) ?? [])
    : [];

  const feedbackTargets: ConsumerFeedbackTarget[] = purchaseTargets
    .filter((target) => {
      return !feedbackRows.some((feedback) => {
        if (feedback.machine_id !== target.machineId) return false;
        if (feedback.product_id !== target.productId) return false;

        if (!feedback.created_at) return true;
        return new Date(feedback.created_at).getTime() >= new Date(target.createdAt).getTime();
      });
    })
    .slice(0, 3)
    .map((target) => ({
      transactionId: target.transactionId,
      machineId: target.machineId,
      machineName: target.machineName,
      productId: target.productId,
      productName: target.productName,
    }));

  return (
    <ConsumerProfileClient
      slug={params.slug}
      operatorId={operator.id}
      fullName={consumerProfile.full_name}
      phone={consumerPhone}
      creditBalance={Number(consumerProfile.credit_balance ?? 0)}
      purchases={purchases}
      feedbackTargets={feedbackTargets}
      notificationOptIn={Boolean(consumerProfile.notification_opt_in)}
    />
  );
}
