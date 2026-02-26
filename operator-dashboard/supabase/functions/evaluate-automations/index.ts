// @ts-nocheck
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import webpush from 'npm:web-push@3.6.7';

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    },
  });
}

function asString(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function safeNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function sendCreditPushIfPossible(supabase: any, input: {
  operatorId: string;
  consumerId: string;
  amount: number;
  operatorName: string;
}) {
  const publicKey = Deno.env.get('NEXT_PUBLIC_VAPID_PUBLIC_KEY');
  const privateKey = Deno.env.get('VAPID_PRIVATE_KEY');
  if (!publicKey || !privateKey) return;

  webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT') ?? 'mailto:alerts@maquinita.app', publicKey, privateKey);
  const { data: subscriptions } = await supabase
    .from('push_subscriptions')
    .select('subscription')
    .eq('operator_id', input.operatorId)
    .eq('user_id', input.consumerId);

  for (const row of (subscriptions ?? []) as Array<{ subscription: unknown }>) {
    try {
      await webpush.sendNotification(
        row.subscription,
        JSON.stringify({
          title: 'Credits added',
          body: `You received $${input.amount.toFixed(2)} in credits from ${input.operatorName}!`,
          url: '/',
        })
      );
    } catch {
      // Ignore push failures for individual subscriptions.
    }
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ ok: false, error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' }, 500);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const body = await req.json().catch(() => null);
  const transactionId = asString(body?.transaction_id);
  if (!transactionId) {
    return json({ ok: false, error: 'Missing transaction_id' }, 400);
  }

  const { data: txData, error: txError } = await supabase
    .from('transactions')
    .select('id, operator_id, status, customer_phone, amount')
    .eq('id', transactionId)
    .maybeSingle();

  if (txError || !txData?.id) {
    return json({ ok: false, error: txError?.message ?? 'Transaction not found' }, 404);
  }
  if (txData.status !== 'completed') {
    return json({ ok: true, skipped: true, reason: 'status_not_completed' });
  }

  const customerPhone = asString(txData.customer_phone).trim();
  if (!customerPhone) {
    return json({ ok: true, skipped: true, reason: 'missing_customer_phone' });
  }

  const { data: consumerData } = await supabase
    .from('consumer_profiles')
    .select('id, credit_balance')
    .eq('operator_id', txData.operator_id)
    .eq('phone', customerPhone)
    .maybeSingle();

  if (!consumerData?.id) {
    return json({ ok: true, skipped: true, reason: 'consumer_not_found' });
  }

  const consumerId = consumerData.id as string;
  const { data: operatorData } = await supabase.from('operators').select('name').eq('id', txData.operator_id).maybeSingle();
  const operatorName = asString((operatorData as { name?: string | null } | null)?.name) || 'Maquinita';

  const [{ data: rulesData }, { data: statsData }] = await Promise.all([
    supabase
      .from('automation_rules')
      .select('id, name, trigger_type, trigger_value, reward_credits, is_active')
      .eq('operator_id', txData.operator_id)
      .eq('is_active', true),
    supabase
      .from('transactions')
      .select('id, amount')
      .eq('operator_id', txData.operator_id)
      .eq('customer_phone', customerPhone)
      .eq('status', 'completed'),
  ]);

  const completedTransactions = (statsData ?? []) as Array<{ id: string; amount: number | null }>;
  const purchaseCount = completedTransactions.length;
  const totalSpend = completedTransactions.reduce((sum, row) => sum + safeNumber(row.amount), 0);

  let awardedCount = 0;
  for (const rule of (rulesData ?? []) as Array<{
    id: string;
    name: string;
    trigger_type: 'welcome' | 'nth_purchase' | 'spend_threshold';
    trigger_value: number | null;
    reward_credits: number | null;
    is_active: boolean | null;
  }>) {
    const reward = safeNumber(rule.reward_credits);
    const triggerValue = safeNumber(rule.trigger_value);

    let conditionMet = false;
    if (rule.trigger_type === 'welcome') {
      conditionMet = purchaseCount === 1;
    } else if (rule.trigger_type === 'nth_purchase') {
      conditionMet = triggerValue > 0 && purchaseCount >= triggerValue;
    } else if (rule.trigger_type === 'spend_threshold') {
      conditionMet = triggerValue > 0 && totalSpend >= triggerValue;
    }

    if (!conditionMet || reward <= 0) {
      continue;
    }

    const { data: awardData, error: awardError } = await supabase
      .from('bonus_awards')
      .insert({
        rule_id: rule.id,
        consumer_id: consumerId,
        operator_id: txData.operator_id,
      })
      .select('id')
      .maybeSingle();

    if (awardError || !awardData?.id) {
      continue;
    }

    const currentBalance = safeNumber((consumerData as { credit_balance?: number | null }).credit_balance);
    const nextBalance = Number((currentBalance + reward).toFixed(2));

    await Promise.all([
      supabase
        .from('consumer_profiles')
        .update({
          credit_balance: nextBalance,
        })
        .eq('id', consumerId)
        .eq('operator_id', txData.operator_id),
      supabase.from('credit_ledger').insert({
        consumer_id: consumerId,
        operator_id: txData.operator_id,
        type: 'award',
        amount: reward,
        reference_id: rule.id,
        note: `Automation: ${rule.name}`,
      }),
      supabase.from('audit_log').insert({
        operator_id: txData.operator_id,
        user_id: null,
        action: 'marketing.automation.awarded',
        entity_type: 'automation_rules',
        entity_id: rule.id,
        payload: {
          consumer_id: consumerId,
          reward_credits: reward,
          trigger_type: rule.trigger_type,
          trigger_value: rule.trigger_value,
          transaction_id: txData.id,
        },
      }),
    ]);

    await sendCreditPushIfPossible(supabase, {
      operatorId: txData.operator_id,
      consumerId,
      amount: reward,
      operatorName,
    });

    awardedCount += 1;
  }

  return json({
    ok: true,
    transactionId: txData.id,
    purchaseCount,
    totalSpend: Number(totalSpend.toFixed(2)),
    awardedCount,
  });
});
