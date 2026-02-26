import { redirect } from 'next/navigation';
import FinancialsDashboardClient from '@/components/financials/FinancialsDashboardClient';
import {
  aggregateByMachine,
  aggregateTaxByMachine,
  buildDailySeries,
  calculateNetToOperator,
  calculatePlatformFees,
  calculateStripeFeesEstimate,
  formatPeriodLabel,
  normalizeFeesConfig,
  resolvePeriodRange,
  resolvePreviousPeriodRange,
  summarizeDelta,
  type FinancialMetric,
  type FinancialPeriodPreset,
  type FinancialTransactionRow,
} from '@/lib/financials';
import { hasPermission, type UserRole } from '@/lib/permissions';
import { createServerClient } from '@/lib/supabase';
import type { Json } from '@/lib/types';

function asSingleParam(value: string | string[] | undefined) {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function safeNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asDateInputValue(value: Date) {
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, '0');
  const day = `${value.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parsePeriod(value: string | null): FinancialPeriodPreset {
  if (value === '7d' || value === '30d' || value === '90d' || value === '12m' || value === 'custom') {
    return value;
  }
  return '30d';
}

function parseMetric(value: string | null): FinancialMetric {
  return value === 'net' ? 'net' : 'gross';
}

function summarize(rows: FinancialTransactionRow[], fees: { feeRate: number; feeFixed: number }) {
  const grossRevenue = rows.reduce((sum, row) => sum + row.amount, 0);
  const refunds = rows.reduce((sum, row) => sum + row.refundAmount, 0);
  const transactions = rows.length;
  const platformFees = calculatePlatformFees(grossRevenue, transactions, {
    ...fees,
    saasMonthlyFee: 0,
  });
  const stripeFees = calculateStripeFeesEstimate(grossRevenue, transactions);
  const netToOperator = calculateNetToOperator({
    grossRevenue,
    refunds,
    platformFees,
    stripeFees,
  });

  return {
    grossRevenue,
    refunds,
    transactions,
    platformFees,
    stripeFees,
    netToOperator,
  };
}

export default async function FinancialsPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const supabase = createServerClient();
  const db = supabase;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login?returnUrl=/financials');
  }

  const { data: profileData } = await db.from('profiles').select('operator_id, role').eq('id', user.id).maybeSingle();
  const profile = profileData as { operator_id: string | null; role: UserRole | null } | null;

  if (!profile?.operator_id || !hasPermission(profile.role, 'financials', 'r')) {
    redirect('/dashboard');
  }
  const operatorId = profile.operator_id as string;

  const period = parsePeriod(asSingleParam(searchParams.period));
  const metric = parseMetric(asSingleParam(searchParams.metric));
  const from = asSingleParam(searchParams.from);
  const to = asSingleParam(searchParams.to);
  const machineIdFilter = asSingleParam(searchParams.machineId) ?? 'all';

  const currentRange = resolvePeriodRange(period, from, to);
  const previousRange = resolvePreviousPeriodRange(currentRange.start, currentRange.end);

  const [{ data: operatorData }, { data: machinesData }] = await Promise.all([
    db.from('operators').select('id, settings').eq('id', operatorId).maybeSingle(),
    db
      .from('machines')
      .select('id, name, settings')
      .eq('operator_id', operatorId)
      .neq('status', 'archived')
      .order('name', { ascending: true }),
  ]);

  const operator = operatorData as { id: string; settings: Json | null } | null;
  const machines = ((machinesData as Array<{ id: string; name: string; settings: Json | null }> | null) ?? []).map((machine) => ({
    id: machine.id,
    name: machine.name,
    settings: machine.settings,
  }));

  const machineNameById = new Map(machines.map((machine) => [machine.id, machine.name]));
  const machineSettingsById = new Map(machines.map((machine) => [machine.id, machine.settings]));

  const effectiveMachineId =
    machineIdFilter !== 'all' && machines.some((machine) => machine.id === machineIdFilter) ? machineIdFilter : 'all';

  const queryTransactions = async (startISO: string, endISO: string) => {
    let query = db
      .from('transactions')
      .select('id, machine_id, amount, refund_amount, tax_amount, created_at')
      .eq('operator_id', operatorId)
      .in('status', ['completed', 'refunded'])
      .gte('created_at', startISO)
      .lte('created_at', endISO);

    if (effectiveMachineId !== 'all') {
      query = query.eq('machine_id', effectiveMachineId);
    }

    const { data } = await query;
    return ((data as Array<{
      id: string;
      machine_id: string | null;
      amount: number | null;
      refund_amount: number | null;
      tax_amount: number | null;
      created_at: string | null;
    }> | null) ?? [])
      .filter((row) => Boolean(row.created_at))
      .map((row) => ({
        id: row.id,
        machineId: row.machine_id,
        amount: safeNumber(row.amount),
        refundAmount: safeNumber(row.refund_amount),
        taxAmount: safeNumber(row.tax_amount),
        createdAt: row.created_at ?? new Date().toISOString(),
      })) as FinancialTransactionRow[];
  };

  const [currentRows, previousRows] = await Promise.all([
    queryTransactions(currentRange.start.toISOString(), currentRange.end.toISOString()),
    queryTransactions(previousRange.start.toISOString(), previousRange.end.toISOString()),
  ]);

  const fees = normalizeFeesConfig(operator?.settings);
  const currentSummary = summarize(currentRows, fees);
  const previousSummary = summarize(previousRows, fees);

  const chartData = buildDailySeries(currentRows, currentRange, fees);
  const machineRows = aggregateByMachine({
    rows: currentRows,
    machineNameById,
    fees,
  });
  const taxRows = aggregateTaxByMachine({
    machineAggRows: machineRows,
    machineSettingsById,
  });

  return (
    <FinancialsDashboardClient
      filters={{
        period,
        from: from ?? asDateInputValue(currentRange.start),
        to: to ?? asDateInputValue(currentRange.end),
        machineId: effectiveMachineId,
        metric,
      }}
      machines={machines.map((machine) => ({ id: machine.id, name: machine.name }))}
      summary={currentSummary}
      deltas={{
        grossRevenue: summarizeDelta(currentSummary.grossRevenue, previousSummary.grossRevenue),
        platformFees: summarizeDelta(currentSummary.platformFees, previousSummary.platformFees),
        stripeFees: summarizeDelta(currentSummary.stripeFees, previousSummary.stripeFees),
        netToOperator: summarizeDelta(currentSummary.netToOperator, previousSummary.netToOperator),
      }}
      chartData={chartData}
      machineRows={machineRows}
      taxRows={taxRows}
      fees={fees}
      periodLabel={formatPeriodLabel(currentRange.start, currentRange.end)}
      selectedMachineLabel={effectiveMachineId === 'all' ? 'All Machines' : machineNameById.get(effectiveMachineId) ?? effectiveMachineId}
    />
  );
}
