import { unstable_cache } from 'next/cache';
import { createAdminClient } from '@/lib/supabase';

export type TodayMetrics = {
  revenue: number;
  transactionCount: number;
  itemsSold: number;
  revenueByMachine: Record<string, number>;
};

function startOfTodayISO() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return start.toISOString();
}

const getTodayMetricsCached = unstable_cache(
  async (operatorId: string, machineIdsKey: string): Promise<TodayMetrics> => {
    const adminClient = createAdminClient() as any;
    const startISO = startOfTodayISO();

    let query = adminClient
      .from('transactions')
      .select('machine_id, amount, items')
      .eq('operator_id', operatorId)
      .eq('status', 'completed')
      .gte('created_at', startISO);

    if (machineIdsKey !== 'all') {
      const ids = machineIdsKey.split(',').filter(Boolean);
      if (ids.length > 0) {
        query = query.in('machine_id', ids);
      }
    }

    const { data } = await query;

    const rows = (data as Array<{ machine_id: string | null; amount: number | null; items: unknown }> | null) ?? [];

    const revenueByMachine: Record<string, number> = {};
    let revenue = 0;
    let itemsSold = 0;

    for (const row of rows) {
      const amount = Number(row.amount ?? 0);
      revenue += amount;

      if (row.machine_id) {
        revenueByMachine[row.machine_id] = (revenueByMachine[row.machine_id] ?? 0) + amount;
      }

      const items = Array.isArray(row.items) ? row.items : [];
      for (const item of items as Array<{ quantity?: number | string }>) {
        itemsSold += Number(item?.quantity ?? 0);
      }
    }

    return {
      revenue,
      transactionCount: rows.length,
      itemsSold,
      revenueByMachine,
    };
  },
  ['today-metrics'],
  { revalidate: 300 }
);

export async function getTodayMetrics(operatorId: string, machineIds: string[] | null): Promise<TodayMetrics> {
  const machineIdsKey = machineIds && machineIds.length > 0 ? machineIds.join(',') : 'all';
  return getTodayMetricsCached(operatorId, machineIdsKey);
}
