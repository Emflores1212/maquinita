// @ts-nocheck
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

type RollupAccumulator = {
  operator_id: string;
  machine_id: string;
  product_id: string;
  units_sold: number;
  revenue: number;
  refunds: number;
  units_wasted: number;
  tx_ids: Set<string>;
};

const WASTE_REASONS = new Set(['expired', 'damaged', 'quality_issue']);

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

function safeNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeDateKey(value: Date) {
  const year = value.getUTCFullYear();
  const month = `${value.getUTCMonth() + 1}`.padStart(2, '0');
  const day = `${value.getUTCDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function shiftDateKey(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return normalizeDateKey(shifted);
}

function getLocalDateKey(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const parts = formatter.formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value ?? '1970';
  const month = parts.find((part) => part.type === 'month')?.value ?? '01';
  const day = parts.find((part) => part.type === 'day')?.value ?? '01';

  return `${year}-${month}-${day}`;
}

function getTimezoneOffsetMs(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const map: Record<string, number> = {};
  for (const part of parts) {
    if (part.type === 'literal') continue;
    map[part.type] = Number(part.value);
  }

  const utcEquivalent = Date.UTC(
    map.year,
    (map.month ?? 1) - 1,
    map.day ?? 1,
    map.hour ?? 0,
    map.minute ?? 0,
    map.second ?? 0
  );

  return utcEquivalent - date.getTime();
}

function zonedDateTimeToUtc(dateKey: string, timeZone: string) {
  const [year, month, day] = dateKey.split('-').map(Number);
  const utcGuess = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
  const offset = getTimezoneOffsetMs(utcGuess, timeZone);
  return new Date(utcGuess.getTime() - offset);
}

function resolveDateWindow(inputDate: string | null | undefined, timeZone: string, now = new Date()) {
  const targetDate = inputDate && /^\d{4}-\d{2}-\d{2}$/.test(inputDate) ? inputDate : shiftDateKey(getLocalDateKey(now, timeZone), -1);
  const startUtc = zonedDateTimeToUtc(targetDate, timeZone);
  const nextDate = shiftDateKey(targetDate, 1);
  const endUtcExclusive = zonedDateTimeToUtc(nextDate, timeZone);

  return {
    targetDate,
    startUtc,
    endUtcExclusive,
  };
}

function parseTransactionItems(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .map((entry) => {
      const row = (entry ?? {}) as Record<string, unknown>;
      const productIdRaw = row.product_id ?? row.productId;
      const productId = typeof productIdRaw === 'string' ? productIdRaw : null;
      if (!productId) return null;

      const quantity = Math.max(0, Math.floor(safeNumber(row.quantity, 0)));
      if (quantity <= 0) return null;

      const unitPrice = safeNumber(row.unit_price ?? row.unitPrice ?? row.price, 0);
      const lineTotalRaw = row.line_total ?? row.lineTotal ?? row.total;
      const lineTotal = safeNumber(lineTotalRaw, quantity * unitPrice);

      return {
        productId,
        quantity,
        lineTotal: Number(lineTotal.toFixed(2)),
      };
    })
    .filter(Boolean);
}

function createAccumulator(operatorId: string, machineId: string, productId: string): RollupAccumulator {
  return {
    operator_id: operatorId,
    machine_id: machineId,
    product_id: productId,
    units_sold: 0,
    revenue: 0,
    refunds: 0,
    units_wasted: 0,
    tx_ids: new Set<string>(),
  };
}

function getAccumulator(map: Map<string, RollupAccumulator>, operatorId: string, machineId: string, productId: string) {
  const key = `${operatorId}::${machineId}::${productId}`;
  const existing = map.get(key);
  if (existing) return existing;
  const created = createAccumulator(operatorId, machineId, productId);
  map.set(key, created);
  return created;
}

function readTimezone(settings: unknown) {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return 'UTC';
  const timezone = (settings as Record<string, unknown>).timezone;
  if (typeof timezone === 'string' && timezone.trim()) {
    return timezone.trim();
  }
  return 'UTC';
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

  const startedAt = Date.now();

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceRoleKey) {
    return json({ ok: false, error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' }, 500);
  }

  let requestedDate: string | null = null;
  try {
    if (req.method !== 'GET' && req.body) {
      const body = await req.json();
      if (typeof body?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
        requestedDate = body.date;
      }
    }
  } catch {
    // Ignore malformed payload and fallback to previous local day.
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: operatorsData, error: operatorsError } = await supabase.from('operators').select('id, settings');
  if (operatorsError) {
    return json({ ok: false, error: operatorsError.message }, 500);
  }

  const operators = operatorsData ?? [];
  if (operators.length === 0) {
    return json({ ok: true, operatorsProcessed: 0, rowsUpserted: 0, transactionsScanned: 0, restockSessionsScanned: 0, runtimeMs: Date.now() - startedAt });
  }

  let rowsUpserted = 0;
  let transactionsScanned = 0;
  let restockSessionsScanned = 0;

  for (const operator of operators) {
    const operatorId = operator.id;
    const timeZone = readTimezone(operator.settings);
    const { targetDate, startUtc, endUtcExclusive } = resolveDateWindow(requestedDate, timeZone);

    const aggregateMap = new Map<string, RollupAccumulator>();

    const { data: txRows, error: txError } = await supabase
      .from('transactions')
      .select('id, machine_id, status, refund_amount, items')
      .eq('operator_id', operatorId)
      .in('status', ['completed', 'refunded'])
      .gte('created_at', startUtc.toISOString())
      .lt('created_at', endUtcExclusive.toISOString());

    if (txError) {
      continue;
    }

    for (const tx of txRows ?? []) {
      transactionsScanned += 1;
      if (!tx.machine_id) continue;

      const lines = parseTransactionItems(tx.items);
      if (lines.length === 0) continue;

      const lineTotalsByProduct = new Map<string, { quantity: number; lineTotal: number }>();
      let transactionLineTotal = 0;

      for (const line of lines) {
        const existing = lineTotalsByProduct.get(line.productId) ?? { quantity: 0, lineTotal: 0 };
        existing.quantity += line.quantity;
        existing.lineTotal += line.lineTotal;
        lineTotalsByProduct.set(line.productId, existing);
        transactionLineTotal += line.lineTotal;
      }

      for (const [productId, values] of lineTotalsByProduct.entries()) {
        const row = getAccumulator(aggregateMap, operatorId, tx.machine_id, productId);
        row.units_sold += values.quantity;
        row.revenue += values.lineTotal;
        row.tx_ids.add(tx.id);
      }

      const refundAmount = Math.max(0, safeNumber(tx.refund_amount, 0));
      if (refundAmount > 0 && transactionLineTotal > 0) {
        for (const [productId, values] of lineTotalsByProduct.entries()) {
          const row = getAccumulator(aggregateMap, operatorId, tx.machine_id, productId);
          const weight = values.lineTotal / transactionLineTotal;
          row.refunds += refundAmount * weight;
        }
      }
    }

    const { data: restockRows, error: restockError } = await supabase
      .from('restock_sessions')
      .select('machine_id, items_removed')
      .eq('operator_id', operatorId)
      .eq('status', 'completed')
      .gte('completed_at', startUtc.toISOString())
      .lt('completed_at', endUtcExclusive.toISOString());

    if (!restockError) {
      for (const session of restockRows ?? []) {
        restockSessionsScanned += 1;
        if (!session.machine_id) continue;
        const itemsRemoved = Array.isArray(session.items_removed) ? session.items_removed : [];

        for (const entry of itemsRemoved) {
          const row = (entry ?? {}) as Record<string, unknown>;
          const productId = typeof row.productId === 'string' ? row.productId : typeof row.product_id === 'string' ? row.product_id : null;
          const reason = typeof row.reason === 'string' ? row.reason : '';
          if (!productId || !WASTE_REASONS.has(reason)) continue;

          const quantity = Math.max(0, Math.floor(safeNumber(row.quantity, 1)));
          if (quantity <= 0) continue;

          const aggregate = getAccumulator(aggregateMap, operatorId, session.machine_id, productId);
          aggregate.units_wasted += quantity;
        }
      }
    }

    const upsertRows = Array.from(aggregateMap.values()).map((row) => ({
      operator_id: row.operator_id,
      machine_id: row.machine_id,
      product_id: row.product_id,
      date: targetDate,
      units_sold: row.units_sold,
      revenue: Number(row.revenue.toFixed(2)),
      refunds: Number(row.refunds.toFixed(2)),
      units_wasted: row.units_wasted,
      transactions_count: row.tx_ids.size,
    }));

    if (upsertRows.length === 0) {
      continue;
    }

    const { error: upsertError } = await supabase.from('daily_rollups').upsert(upsertRows, {
      onConflict: 'operator_id,machine_id,product_id,date',
      ignoreDuplicates: false,
    });

    if (!upsertError) {
      rowsUpserted += upsertRows.length;
    }
  }

  return json({
    ok: true,
    operatorsProcessed: operators.length,
    rowsUpserted,
    transactionsScanned,
    restockSessionsScanned,
    runtimeMs: Date.now() - startedAt,
  });
});
