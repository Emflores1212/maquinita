// @ts-nocheck
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

type ExpiringItem = {
  epc: string;
  operator_id: string;
  product_id: string | null;
  machine_id: string | null;
  expiration_date: string | null;
};

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

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(base: Date, days: number) {
  const copy = new Date(base);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function unique(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter(Boolean))) as string[];
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
  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  const resendFrom = Deno.env.get('RESEND_FROM_EMAIL') ?? 'Maquinita <no-reply@maquinita.app>';

  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' }, 500);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const today = new Date();
  const fromDate = formatDate(today);
  const toDate = formatDate(addDays(today, 3));

  const { data: itemsData, error: itemsError } = await supabase
    .from('rfid_items')
    .select('epc, operator_id, product_id, machine_id, expiration_date')
    .eq('status', 'in_machine')
    .not('expiration_date', 'is', null)
    .gte('expiration_date', fromDate)
    .lte('expiration_date', toDate);

  if (itemsError) {
    return json({ error: itemsError.message }, 500);
  }

  const items = (itemsData ?? []) as ExpiringItem[];
  if (items.length === 0) {
    return json({ ok: true, alertsInserted: 0, emailsSent: 0, operatorsProcessed: 0 });
  }

  const productIds = unique(items.map((item) => item.product_id));
  const machineIds = unique(items.map((item) => item.machine_id));

  const [{ data: productsData }, { data: machinesData }] = await Promise.all([
    productIds.length > 0
      ? supabase.from('products').select('id, name').in('id', productIds)
      : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
    machineIds.length > 0
      ? supabase.from('machines').select('id, name').in('id', machineIds)
      : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
  ]);

  const productMap = new Map(((productsData as Array<{ id: string; name: string }> | null) ?? []).map((row) => [row.id, row.name]));
  const machineMap = new Map(((machinesData as Array<{ id: string; name: string }> | null) ?? []).map((row) => [row.id, row.name]));

  const itemsByOperator = new Map<string, ExpiringItem[]>();
  for (const item of items) {
    const existing = itemsByOperator.get(item.operator_id) ?? [];
    existing.push(item);
    itemsByOperator.set(item.operator_id, existing);
  }

  let alertsInserted = 0;
  let emailsSent = 0;

  for (const [operatorId, operatorItems] of itemsByOperator) {
    const messages = operatorItems.map((item) => {
      const productName = item.product_id ? productMap.get(item.product_id) ?? item.product_id : '-';
      const machineName = item.machine_id ? machineMap.get(item.machine_id) ?? item.machine_id : '-';
      return `EXPIRING_SOON|epc=${item.epc}|product=${productName}|machine=${machineName}|date=${item.expiration_date}`;
    });

    const { data: existingAlerts } = await supabase
      .from('alerts')
      .select('message')
      .eq('operator_id', operatorId)
      .eq('type', 'EXPIRING_SOON')
      .is('resolved_at', null)
      .in('message', messages);

    const existingMessages = new Set(((existingAlerts as Array<{ message: string | null }> | null) ?? []).map((row) => row.message ?? ''));

    const newAlerts = operatorItems
      .map((item, index) => ({
        operator_id: operatorId,
        machine_id: item.machine_id,
        type: 'EXPIRING_SOON',
        severity: 'warning',
        message: messages[index],
      }))
      .filter((row) => !existingMessages.has(row.message));

    if (newAlerts.length > 0) {
      const { error: insertError } = await supabase.from('alerts').insert(newAlerts);
      if (!insertError) {
        alertsInserted += newAlerts.length;
      }
    }

    if (!resendApiKey) {
      continue;
    }

    const { data: adminProfiles } = await supabase
      .from('profiles')
      .select('id')
      .eq('operator_id', operatorId)
      .eq('role', 'admin');

    const adminIds = ((adminProfiles as Array<{ id: string }> | null) ?? []).map((row) => row.id);
    if (adminIds.length === 0) {
      continue;
    }

    const recipients: string[] = [];
    for (const adminId of adminIds) {
      const { data: userResult } = await supabase.auth.admin.getUserById(adminId);
      const email = userResult.user?.email;
      if (email) recipients.push(email);
    }

    if (recipients.length === 0) {
      continue;
    }

    const lines = operatorItems
      .slice(0, 100)
      .map((item) => {
        const productName = item.product_id ? productMap.get(item.product_id) ?? item.product_id : '-';
        const machineName = item.machine_id ? machineMap.get(item.machine_id) ?? item.machine_id : '-';
        return `<li><strong>${productName}</strong> — ${machineName} — EPC ${item.epc} — expires ${item.expiration_date}</li>`;
      })
      .join('');

    const emailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: resendFrom,
        to: recipients,
        subject: `Maquinita: ${operatorItems.length} items expiring in <= 3 days`,
        html: `<p>Items expiring soon:</p><ul>${lines}</ul>`,
      }),
    });

    if (emailResponse.ok) {
      emailsSent += 1;
    }
  }

  return json({
    ok: true,
    operatorsProcessed: itemsByOperator.size,
    alertsInserted,
    emailsSent,
    schedule: 'Use pg_cron at 06:00 daily to call this function endpoint.',
  });
});
