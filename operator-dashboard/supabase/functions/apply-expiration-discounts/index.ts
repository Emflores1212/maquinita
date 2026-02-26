// @ts-nocheck
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

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

function parseTiers(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .map((row) => {
      const source = row ?? {};
      const daysRemaining = Number(source.days_remaining);
      const discountPct = Number(source.discount_pct);
      if (!Number.isFinite(daysRemaining) || !Number.isFinite(discountPct)) return null;
      return {
        days_remaining: Math.floor(daysRemaining),
        discount_pct: Number(discountPct.toFixed(2)),
      };
    })
    .filter(Boolean);
}

function normalizeDateOnly(value: string) {
  return value.slice(0, 10);
}

function daysRemaining(expirationDate: string, now: Date) {
  const base = normalizeDateOnly(expirationDate);
  const [year, month, day] = base.split('-').map(Number);
  if (!year || !month || !day) return null;

  const expiryUtc = Date.UTC(year, month - 1, day);
  const nowUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.floor((expiryUtc - nowUtc) / (1000 * 60 * 60 * 24));
}

function ruleAppliesToItem(rule: any, item: any, productCategoryById: Map<string, string | null>) {
  const targetProducts = rule.target_product_ids ?? [];
  const targetCategories = rule.target_category_ids ?? [];

  const noTargets = targetProducts.length === 0 && targetCategories.length === 0;
  if (noTargets) return true;

  if (item.product_id && targetProducts.includes(item.product_id)) {
    return true;
  }

  if (item.product_id && targetCategories.length > 0) {
    const categoryId = productCategoryById.get(item.product_id) ?? null;
    if (categoryId && targetCategories.includes(categoryId)) {
      return true;
    }
  }

  return false;
}

function resolveDiscountForItem(rule: any, itemDaysRemaining: number) {
  const tiers = parseTiers(rule.tiers);
  if (tiers.length === 0) return 0;

  let bestDiscount = 0;
  for (const tier of tiers) {
    if (itemDaysRemaining <= tier.days_remaining) {
      bestDiscount = Math.max(bestDiscount, Number(tier.discount_pct ?? 0));
    }
  }

  return Number(bestDiscount.toFixed(2));
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

  const { data: activeRulesData, error: rulesError } = await supabase
    .from('expiration_rules')
    .select('id, operator_id, target_product_ids, target_category_ids, tiers')
    .eq('is_active', true);

  if (rulesError) {
    return json({ ok: false, error: rulesError.message }, 500);
  }

  const activeRules = activeRulesData ?? [];
  if (activeRules.length === 0) {
    return json({ ok: true, operatorsProcessed: 0, itemsEvaluated: 0, itemsUpdated: 0 });
  }

  const rulesByOperator = new Map<string, any[]>();
  for (const rule of activeRules) {
    const existing = rulesByOperator.get(rule.operator_id) ?? [];
    existing.push(rule);
    rulesByOperator.set(rule.operator_id, existing);
  }

  let itemsEvaluated = 0;
  let itemsUpdated = 0;
  const now = new Date();

  for (const [operatorId, operatorRules] of rulesByOperator) {
    const { data: itemRows, error: itemsError } = await supabase
      .from('rfid_items')
      .select('epc, operator_id, product_id, status, expiration_date, current_discount')
      .eq('operator_id', operatorId)
      .eq('status', 'in_machine')
      .not('expiration_date', 'is', null);

    if (itemsError) {
      continue;
    }

    const items = itemRows ?? [];
    if (items.length === 0) {
      continue;
    }

    const productIds = Array.from(new Set(items.map((row) => row.product_id).filter(Boolean)));
    const { data: productRows } = productIds.length
      ? await supabase.from('products').select('id, category_id').in('id', productIds).eq('operator_id', operatorId)
      : { data: [] };

    const productCategoryById = new Map((productRows ?? []).map((row) => [row.id, row.category_id ?? null]));

    for (const item of items) {
      itemsEvaluated += 1;

      const remainingDays = daysRemaining(item.expiration_date, now);
      if (remainingDays === null) continue;

      let nextDiscount = 0;

      for (const rule of operatorRules) {
        if (!ruleAppliesToItem(rule, item, productCategoryById)) {
          continue;
        }
        nextDiscount = Math.max(nextDiscount, resolveDiscountForItem(rule, remainingDays));
      }

      const currentDiscount = Number(item.current_discount ?? 0);
      if (Math.abs(nextDiscount - currentDiscount) < 0.001) {
        continue;
      }

      const { error: updateError } = await supabase
        .from('rfid_items')
        .update({ current_discount: nextDiscount })
        .eq('epc', item.epc)
        .eq('operator_id', operatorId);

      if (!updateError) {
        itemsUpdated += 1;
      }
    }
  }

  return json({
    ok: true,
    operatorsProcessed: rulesByOperator.size,
    itemsEvaluated,
    itemsUpdated,
    schedule: 'Use pg_cron at 03:00 daily to invoke this function endpoint.',
  });
});
