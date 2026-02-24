import StockingActivityClient from '@/components/inventory/StockingActivityClient';
import { hasPermission, type UserRole } from '@/lib/permissions';
import { createAdminClient, createServerClient } from '@/lib/supabase';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';

function asSingleParam(value: string | string[] | undefined) {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function parseJsonArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function countAdded(items: unknown[]) {
  return items.reduce<number>((sum, item) => {
    const quantity = Number((item as { quantity?: number }).quantity ?? 1);
    return sum + (Number.isFinite(quantity) ? Math.max(1, Math.floor(quantity)) : 1);
  }, 0);
}

function countRemoved(items: unknown[]) {
  return items.reduce<number>((sum, item) => {
    const quantity = Number((item as { quantity?: number }).quantity ?? 1);
    return sum + (Number.isFinite(quantity) ? Math.max(1, Math.floor(quantity)) : 1);
  }, 0);
}

export default async function InventoryActivityPage({
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
    redirect('/login?returnUrl=/inventory/activity');
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

  const canRead = hasPermission(profile?.role ?? null, 'inventory', 'r') || hasPermission(profile?.role ?? null, 'restock', 'r');
  const canTransfer = hasPermission(profile?.role ?? null, 'inventory', 'w') || hasPermission(profile?.role ?? null, 'restock', 'w');

  if (!profile?.operator_id || !canRead) {
    redirect('/dashboard');
  }

  let machinesQuery = db
    .from('machines')
    .select('id, name')
    .eq('operator_id', profile.operator_id)
    .neq('status', 'archived')
    .order('name', { ascending: true });

  if (profile.role === 'driver') {
    const assigned = profile.assigned_machine_ids ?? [];
    if (assigned.length === 0) {
      machinesQuery = machinesQuery.in('id', ['00000000-0000-0000-0000-000000000000']);
    } else {
      machinesQuery = machinesQuery.in('id', assigned);
    }
  }

  const [{ data: machinesData }, { data: usersData }] = await Promise.all([
    machinesQuery,
    db.from('profiles').select('id, full_name').eq('operator_id', profile.operator_id).order('full_name', { ascending: true }),
  ]);

  const machines = ((machinesData as Array<{ id: string; name: string }> | null) ?? []).map((row) => ({ id: row.id, name: row.name }));
  const users = (usersData as Array<{ id: string; full_name: string | null }> | null) ?? [];

  const machineFilter = asSingleParam(searchParams.machineId);
  const userFilter = asSingleParam(searchParams.userId);
  const fromFilter = asSingleParam(searchParams.from);
  const toFilter = asSingleParam(searchParams.to);

  let sessionsQuery = db
    .from('restock_sessions')
    .select(
      'id, machine_id, started_by, started_at, completed_at, status, items_added, items_removed, physical_counts, notes, photo_urls, discrepancy_count'
    )
    .eq('operator_id', profile.operator_id)
    .order('started_at', { ascending: false })
    .limit(200);

  if (profile.role === 'driver') {
    const assigned = profile.assigned_machine_ids ?? [];
    if (assigned.length === 0) {
      sessionsQuery = sessionsQuery.in('machine_id', ['00000000-0000-0000-0000-000000000000']);
    } else {
      sessionsQuery = sessionsQuery.in('machine_id', assigned);
    }
  }

  if (machineFilter) sessionsQuery = sessionsQuery.eq('machine_id', machineFilter);
  if (userFilter) sessionsQuery = sessionsQuery.eq('started_by', userFilter);
  if (fromFilter) sessionsQuery = sessionsQuery.gte('started_at', `${fromFilter}T00:00:00`);
  if (toFilter) sessionsQuery = sessionsQuery.lte('started_at', `${toFilter}T23:59:59`);

  const { data: sessionsData } = await sessionsQuery;
  const sessionsRaw =
    (sessionsData as Array<{
      id: string;
      machine_id: string;
      started_by: string | null;
      started_at: string | null;
      completed_at: string | null;
      status: string | null;
      items_added: unknown;
      items_removed: unknown;
      physical_counts: unknown;
      notes: string | null;
      photo_urls: string[] | null;
      discrepancy_count: number | null;
    }> | null) ?? [];

  const machineNameById = new Map(machines.map((machine) => [machine.id, machine.name]));
  const userNameById = new Map(users.map((row) => [row.id, row.full_name ?? row.id]));

  const allPhotoPaths = Array.from(
    new Set(sessionsRaw.flatMap((session) => (Array.isArray(session.photo_urls) ? session.photo_urls : [])).filter(Boolean))
  );

  const signedPhotoByPath = new Map<string, string>();
  if (allPhotoPaths.length > 0) {
    const adminDb = createAdminClient() as any;
    const { data: signedRows } = await adminDb.storage.from('cabinet-photos').createSignedUrls(allPhotoPaths, 60 * 60);
    const signed = (signedRows as Array<{ signedUrl?: string; path?: string; error?: unknown }> | null) ?? [];
    signed.forEach((row, index) => {
      if (row?.signedUrl) {
        signedPhotoByPath.set(allPhotoPaths[index] as string, row.signedUrl);
      }
    });
  }

  const sessions = sessionsRaw.map((session) => {
    const itemsAdded = parseJsonArray(session.items_added);
    const itemsRemoved = parseJsonArray(session.items_removed);
    const physicalCounts = parseJsonArray(session.physical_counts);

    return {
      id: session.id,
      startedAt: session.started_at,
      completedAt: session.completed_at,
      machineId: session.machine_id,
      machineName: machineNameById.get(session.machine_id) ?? session.machine_id,
      operatorName: session.started_by ? userNameById.get(session.started_by) ?? session.started_by : '-',
      status: session.status,
      addedCount: countAdded(itemsAdded),
      removedCount: countRemoved(itemsRemoved),
      discrepancyCount: Number(session.discrepancy_count ?? 0),
      notes: session.notes,
      photoUrls: (Array.isArray(session.photo_urls) ? session.photo_urls : [])
        .map((path) => signedPhotoByPath.get(path) ?? '')
        .filter(Boolean),
      itemsAdded: itemsAdded.map((row) => ({
        epc: typeof (row as { epc?: unknown }).epc === 'string' ? ((row as { epc: string }).epc as string) : null,
        productId:
          typeof (row as { productId?: unknown }).productId === 'string'
            ? ((row as { productId: string }).productId as string)
            : null,
        productName:
          typeof (row as { productName?: unknown }).productName === 'string'
            ? ((row as { productName: string }).productName as string)
            : null,
      })),
      itemsRemoved: itemsRemoved.map((row) => ({
        mode: ((row as { mode?: 'epc' | 'product' }).mode === 'epc' ? 'epc' : 'product') as 'epc' | 'product',
        epc: typeof (row as { epc?: unknown }).epc === 'string' ? ((row as { epc: string }).epc as string) : null,
        productId:
          typeof (row as { productId?: unknown }).productId === 'string'
            ? ((row as { productId: string }).productId as string)
            : null,
        productName:
          typeof (row as { productName?: unknown }).productName === 'string'
            ? ((row as { productName: string }).productName as string)
            : null,
        quantity: Math.max(1, Math.floor(Number((row as { quantity?: number }).quantity ?? 1))),
        reason:
          (row as { reason?: 'expired' | 'damaged' | 'quality_issue' | 'other' }).reason === 'damaged' ||
          (row as { reason?: 'expired' | 'damaged' | 'quality_issue' | 'other' }).reason === 'quality_issue' ||
          (row as { reason?: 'expired' | 'damaged' | 'quality_issue' | 'other' }).reason === 'other'
            ? ((row as { reason: 'expired' | 'damaged' | 'quality_issue' | 'other' }).reason as
                | 'expired'
                | 'damaged'
                | 'quality_issue'
                | 'other')
            : 'expired',
        otherReason:
          typeof (row as { otherReason?: unknown }).otherReason === 'string'
            ? ((row as { otherReason: string }).otherReason as string)
            : null,
      })),
      physicalCounts: physicalCounts.map((row) => ({
        productId:
          typeof (row as { productId?: unknown }).productId === 'string'
            ? ((row as { productId: string }).productId as string)
            : 'unknown',
        productName:
          typeof (row as { productName?: unknown }).productName === 'string'
            ? ((row as { productName: string }).productName as string)
            : null,
        expected: Math.max(0, Math.floor(Number((row as { expected?: number }).expected ?? 0))),
        counted: Math.max(0, Math.floor(Number((row as { counted?: number }).counted ?? 0))),
        status:
          (row as { status?: 'matches_expected' | 'correction' | 'unconfirmed' }).status === 'matches_expected' ||
          (row as { status?: 'matches_expected' | 'correction' | 'unconfirmed' }).status === 'unconfirmed'
            ? ((row as { status: 'matches_expected' | 'correction' | 'unconfirmed' }).status as
                | 'matches_expected'
                | 'correction'
                | 'unconfirmed')
            : 'correction',
      })),
    };
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-slate-900">Stocking Activity</h1>

      <form className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" method="GET">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <label className="text-sm font-semibold text-slate-700">
            Machine
            <select
              name="machineId"
              defaultValue={machineFilter ?? ''}
              className="mt-1 h-12 w-full rounded-lg border border-slate-300 px-3 text-sm"
            >
              <option value="">All</option>
              {machines.map((machine) => (
                <option key={machine.id} value={machine.id}>
                  {machine.name}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm font-semibold text-slate-700">
            Operator
            <select name="userId" defaultValue={userFilter ?? ''} className="mt-1 h-12 w-full rounded-lg border border-slate-300 px-3 text-sm">
              <option value="">All</option>
              {users.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.full_name ?? row.id}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm font-semibold text-slate-700">
            From
            <input type="date" name="from" defaultValue={fromFilter ?? ''} className="mt-1 h-12 w-full rounded-lg border border-slate-300 px-3 text-sm" />
          </label>

          <label className="text-sm font-semibold text-slate-700">
            To
            <input type="date" name="to" defaultValue={toFilter ?? ''} className="mt-1 h-12 w-full rounded-lg border border-slate-300 px-3 text-sm" />
          </label>
        </div>

        <div className="mt-3 flex gap-2">
          <button type="submit" className="inline-flex h-12 items-center rounded-lg bg-[#0D2B4E] px-4 text-sm font-bold text-white">
            Apply Filters
          </button>
          <a href="/inventory/activity" className="inline-flex h-12 items-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700">
            Reset
          </a>
        </div>
      </form>

      <Suspense>
        <StockingActivityClient sessions={sessions} machines={machines} canTransfer={canTransfer} />
      </Suspense>
    </div>
  );
}
