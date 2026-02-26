import { redirect } from 'next/navigation';
import TransactionsPageClient, { type TransactionListRow } from '@/components/transactions/TransactionsPageClient';
import { hasPermission, type UserRole } from '@/lib/permissions';
import { parseTimeline, parseTransactionItems } from '@/lib/transactions';
import { createServerClient } from '@/lib/supabase';

function asSingleParam(value: string | string[] | undefined) {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function asArrayParam(value: string | string[] | undefined) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean);
  if (!value.trim()) return [];
  return value.split(',').map((entry) => entry.trim()).filter(Boolean);
}

function normalizeSearch(value: string | null) {
  const next = value?.trim() ?? '';
  return next.length > 0 ? next : null;
}

function safeNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clampPage(value: number) {
  if (!Number.isFinite(value) || value < 1) return 1;
  return Math.floor(value);
}

function applyTransactionFilters(params: {
  query: any;
  operatorId: string;
  allowedMachineIds: string[] | null;
  since: string | null;
  until: string | null;
  machineIdsFilter: string[];
  statusFilter: string | null;
  searchFilter: string | null;
}) {
  let query = params.query.eq('operator_id', params.operatorId);

  if (params.allowedMachineIds) {
    if (params.allowedMachineIds.length === 0) {
      query = query.in('machine_id', ['00000000-0000-0000-0000-000000000000']);
    } else {
      query = query.in('machine_id', params.allowedMachineIds);
    }
  }

  if (params.machineIdsFilter.length > 0) {
    query = query.in('machine_id', params.machineIdsFilter);
  }

  if (params.since) {
    query = query.gte('created_at', `${params.since}T00:00:00`);
  }
  if (params.until) {
    query = query.lte('created_at', `${params.until}T23:59:59`);
  }

  if (params.statusFilter && params.statusFilter !== 'all') {
    query = query.eq('status', params.statusFilter);
  }

  if (params.searchFilter) {
    const escaped = params.searchFilter.replace(/[%_]/g, '');
    query = query.or(`id.ilike.%${escaped}%,customer_email.ilike.%${escaped}%,stripe_charge_id.ilike.%${escaped}%`);
  }

  return query;
}

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const supabase = createServerClient();
  const db = supabase as any;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login?returnUrl=/transactions');
  }

  const { data: profileData } = await db
    .from('profiles')
    .select('operator_id, role, assigned_machine_ids')
    .eq('id', user.id)
    .maybeSingle();

  const profile = profileData as
    | {
        operator_id: string | null;
        role: UserRole | null;
        assigned_machine_ids: string[] | null;
      }
    | null;

  if (!profile?.operator_id || !hasPermission(profile.role, 'transactions', 'r')) {
    redirect('/dashboard');
  }

  const canWrite = hasPermission(profile.role, 'transactions', 'w');
  const isDriver = profile.role === 'driver';
  const allowedMachineIds = isDriver ? profile.assigned_machine_ids ?? [] : null;

  const since = asSingleParam(searchParams.since);
  const until = asSingleParam(searchParams.until);
  const status = asSingleParam(searchParams.status) ?? 'all';
  const search = normalizeSearch(asSingleParam(searchParams.search));
  const machineIds = asArrayParam(searchParams.machines);
  const page = clampPage(safeNumber(asSingleParam(searchParams.page), 1));
  const perPage = 25;
  const exportCap = 100000;

  let machinesQuery = db
    .from('machines')
    .select('id, name, address')
    .eq('operator_id', profile.operator_id)
    .neq('status', 'archived')
    .order('name', { ascending: true });

  if (isDriver) {
    if (!allowedMachineIds || allowedMachineIds.length === 0) {
      machinesQuery = machinesQuery.in('id', ['00000000-0000-0000-0000-000000000000']);
    } else {
      machinesQuery = machinesQuery.in('id', allowedMachineIds);
    }
  }

  const { data: machinesData } = await machinesQuery;
  const machines = ((machinesData as Array<{ id: string; name: string; address: string | null }> | null) ?? []).map((machine) => ({
    id: machine.id,
    name: machine.name,
    address: machine.address,
  }));
  const machineNameById = new Map(machines.map((machine) => [machine.id, machine.name]));
  const machineAddressById = new Map(machines.map((machine) => [machine.id, machine.address]));

  const effectiveMachineIdsFilter =
    machineIds.length > 0
      ? machineIds.filter((machineId) => machines.some((machine) => machine.id === machineId))
      : [];

  const filteredCountQuery = applyTransactionFilters({
    query: db.from('transactions').select('id', { count: 'exact', head: true }),
    operatorId: profile.operator_id,
    allowedMachineIds,
    since,
    until,
    machineIdsFilter: effectiveMachineIdsFilter,
    statusFilter: status,
    searchFilter: search,
  });

  const { count } = await filteredCountQuery;
  const totalCount = Number(count ?? 0);
  const totalPages = Math.max(1, Math.ceil(totalCount / perPage));
  const currentPage = Math.min(page, totalPages);
  const from = (currentPage - 1) * perPage;
  const to = from + perPage - 1;

  const transactionsQuery = applyTransactionFilters({
    query: db
      .from('transactions')
      .select(
        'id, machine_id, stripe_charge_id, amount, tax_amount, discount_amount, refund_amount, status, items, customer_phone, customer_email, card_last4, currency, status_timeline, created_at, is_offline_sync, synced_at'
      )
      .order('created_at', { ascending: false })
      .range(from, to),
    operatorId: profile.operator_id,
    allowedMachineIds,
    since,
    until,
    machineIdsFilter: effectiveMachineIdsFilter,
    statusFilter: status,
    searchFilter: search,
  });

  const summaryRowsQuery = applyTransactionFilters({
    query: db
      .from('transactions')
      .select('amount, refund_amount')
      .order('created_at', { ascending: false })
      .limit(exportCap),
    operatorId: profile.operator_id,
    allowedMachineIds,
    since,
    until,
    machineIdsFilter: effectiveMachineIdsFilter,
    statusFilter: status,
    searchFilter: search,
  });

  const exportRowsQuery = applyTransactionFilters({
    query: db
      .from('transactions')
      .select('id, created_at, machine_id, amount, status, refund_amount, customer_email, is_offline_sync, synced_at')
      .order('created_at', { ascending: false })
      .limit(exportCap),
    operatorId: profile.operator_id,
    allowedMachineIds,
    since,
    until,
    machineIdsFilter: effectiveMachineIdsFilter,
    statusFilter: status,
    searchFilter: search,
  });

  const [{ data: transactionsData }, { data: summaryRowsData }, { data: exportRowsData }] = await Promise.all([
    transactionsQuery,
    summaryRowsQuery,
    exportRowsQuery,
  ]);

  const transactionsRows =
    (transactionsData as Array<{
      id: string;
      machine_id: string | null;
      stripe_charge_id: string | null;
      amount: number | null;
      tax_amount: number | null;
      discount_amount: number | null;
      refund_amount: number | null;
      status: string | null;
      items: unknown;
      customer_phone: string | null;
      customer_email: string | null;
      card_last4: string | null;
      currency: string | null;
      status_timeline: unknown;
      created_at: string | null;
      is_offline_sync: boolean | null;
      synced_at: string | null;
    }> | null) ?? [];

  const summaryRows = (summaryRowsData as Array<{ amount: number | null; refund_amount: number | null }> | null) ?? [];
  const totalRevenue = summaryRows.reduce((sum, row) => sum + safeNumber(row.amount, 0), 0);
  const totalRefunded = summaryRows.reduce((sum, row) => sum + safeNumber(row.refund_amount, 0), 0);
  const averageValue = totalCount > 0 ? totalRevenue / totalCount : 0;

  const transactions: TransactionListRow[] = transactionsRows.map((row) => {
    const createdAt = row.created_at ?? new Date().toISOString();
    const items = parseTransactionItems(row.items);
    const timeline = parseTimeline(row.status_timeline, createdAt);
    const machineName = row.machine_id ? machineNameById.get(row.machine_id) ?? row.machine_id : '-';
    const machineAddress = row.machine_id ? machineAddressById.get(row.machine_id) ?? null : null;

    return {
      id: row.id,
      shortId: row.id.slice(0, 8),
      machineId: row.machine_id,
      machineName,
      machineAddress,
      stripeChargeId: row.stripe_charge_id,
      amount: safeNumber(row.amount),
      taxAmount: safeNumber(row.tax_amount),
      discountAmount: safeNumber(row.discount_amount),
      refundAmount: safeNumber(row.refund_amount),
      status: row.status ?? 'pending',
      items,
      customerPhone: row.customer_phone,
      customerEmail: row.customer_email,
      cardLast4: row.card_last4,
      currency: row.currency ?? 'usd',
      statusTimeline: timeline,
      createdAt,
      isOfflineSync: Boolean(row.is_offline_sync),
      syncedAt: row.synced_at,
    };
  });

  const exportRows =
    (exportRowsData as Array<{
      id: string;
      created_at: string | null;
      machine_id: string | null;
      amount: number | null;
      status: string | null;
      refund_amount: number | null;
      customer_email: string | null;
      is_offline_sync: boolean | null;
      synced_at: string | null;
    }> | null) ?? [];

  return (
    <TransactionsPageClient
      canWrite={canWrite}
      filters={{
        since,
        until,
        machines: effectiveMachineIdsFilter,
        status,
        search: search ?? '',
        page: currentPage,
      }}
      machines={machines.map((machine) => ({ id: machine.id, name: machine.name }))}
      summary={{
        totalRevenue,
        totalTransactions: totalCount,
        avgValue: averageValue,
        totalRefunded,
      }}
      transactions={transactions}
      pagination={{
        page: currentPage,
        totalPages,
        totalItems: totalCount,
        perPage,
      }}
      exportRows={exportRows.map((row) => ({
        id: row.id,
        createdAt: row.created_at,
        machineName: row.machine_id ? machineNameById.get(row.machine_id) ?? row.machine_id : '-',
        amount: safeNumber(row.amount),
        status: row.status ?? 'pending',
        refundAmount: safeNumber(row.refund_amount),
        customerEmail: row.customer_email ?? '',
        isOfflineSync: Boolean(row.is_offline_sync),
        syncedAt: row.synced_at,
      }))}
    />
  );
}
