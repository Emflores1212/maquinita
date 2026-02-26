import { createAdminClient } from '@/lib/supabase';
import { failure, success } from '../../_lib';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function dateOnlyIso(date: Date) {
  return date.toISOString().slice(0, 10);
}

export async function GET(request: Request) {
  const operatorId = request.headers.get('x-operator-id')?.trim();
  if (!operatorId) {
    return failure(401, 'UNAUTHORIZED', 'Missing x-operator-id header.');
  }

  const today = new Date();
  const startDate = new Date(today);
  startDate.setUTCDate(startDate.getUTCDate() - 29);
  startDate.setUTCHours(0, 0, 0, 0);

  const adminDb = createAdminClient();

  const { data: rowsData, error } = await adminDb
    .from('daily_rollups')
    .select('machine_id, revenue, transactions_count, units_sold, units_wasted, refunds')
    .eq('operator_id', operatorId)
    .gte('date', dateOnlyIso(startDate))
    .lte('date', dateOnlyIso(today));

  if (error) {
    return failure(500, 'QUERY_FAILED', error.message);
  }

  const rows =
    ((rowsData as Array<{
      machine_id: string;
      revenue: number;
      transactions_count: number;
      units_sold: number;
      units_wasted: number;
      refunds: number;
    }> | null) ?? []);

  let totalRevenue = 0;
  let totalTransactions = 0;
  let totalUnitsSold = 0;
  let totalUnitsWasted = 0;
  let totalRefunds = 0;
  const machineAggregates = new Map<string, { revenue: number; transactions: number; unitsSold: number; unitsWasted: number; refunds: number }>();

  for (const row of rows) {
    totalRevenue += Number(row.revenue ?? 0);
    totalTransactions += Number(row.transactions_count ?? 0);
    totalUnitsSold += Number(row.units_sold ?? 0);
    totalUnitsWasted += Number(row.units_wasted ?? 0);
    totalRefunds += Number(row.refunds ?? 0);

    const machine = machineAggregates.get(row.machine_id) ?? {
      revenue: 0,
      transactions: 0,
      unitsSold: 0,
      unitsWasted: 0,
      refunds: 0,
    };

    machine.revenue += Number(row.revenue ?? 0);
    machine.transactions += Number(row.transactions_count ?? 0);
    machine.unitsSold += Number(row.units_sold ?? 0);
    machine.unitsWasted += Number(row.units_wasted ?? 0);
    machine.refunds += Number(row.refunds ?? 0);
    machineAggregates.set(row.machine_id, machine);
  }

  const machineIds = Array.from(machineAggregates.keys());
  const machineNames = new Map<string, string>();

  if (machineIds.length > 0) {
    const { data: machineRows } = await adminDb
      .from('machines')
      .select('id, name')
      .eq('operator_id', operatorId)
      .in('id', machineIds);

    for (const row of (machineRows as Array<{ id: string; name: string }> | null) ?? []) {
      machineNames.set(row.id, row.name);
    }
  }

  const machineBreakdown = machineIds
    .map((machineId) => {
      const machine = machineAggregates.get(machineId)!;
      const denominator = machine.unitsSold + machine.unitsWasted;
      const wasteRate = denominator > 0 ? (machine.unitsWasted / denominator) * 100 : 0;
      return {
        machine_id: machineId,
        machine_name: machineNames.get(machineId) ?? 'Unknown Machine',
        revenue: Number(machine.revenue.toFixed(2)),
        transactions: machine.transactions,
        units_sold: machine.unitsSold,
        units_wasted: machine.unitsWasted,
        refunds: Number(machine.refunds.toFixed(2)),
        waste_rate: Number(wasteRate.toFixed(2)),
      };
    })
    .sort((left, right) => right.revenue - left.revenue);

  const denominator = totalUnitsSold + totalUnitsWasted;
  const aov = totalTransactions > 0 ? totalRevenue / totalTransactions : 0;
  const wasteRate = denominator > 0 ? (totalUnitsWasted / denominator) * 100 : 0;

  return success(
    {
      period: {
        label: 'last_30_days',
        start_date: dateOnlyIso(startDate),
        end_date: dateOnlyIso(today),
      },
      kpis: {
        total_revenue: Number(totalRevenue.toFixed(2)),
        total_transactions: totalTransactions,
        average_order_value: Number(aov.toFixed(2)),
        units_sold: totalUnitsSold,
        units_wasted: totalUnitsWasted,
        waste_rate: Number(wasteRate.toFixed(2)),
        total_refunds: Number(totalRefunds.toFixed(2)),
      },
      machine_breakdown: machineBreakdown,
    },
    {
      page: 1,
      total: machineBreakdown.length,
      limit: machineBreakdown.length,
    }
  );
}
