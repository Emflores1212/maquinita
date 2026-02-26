import { redirect } from 'next/navigation';
import RestockSessionClient from '@/components/restock/RestockSessionClient';
import { hasPermission, type UserRole } from '@/lib/permissions';
import { createAdminClient, createServerClient } from '@/lib/supabase';

function asSingleParam(value: string | string[] | undefined): string | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function hasDriverMachineAccess(role: UserRole | null, assignedMachineIds: string[] | null, machineId: string) {
  if (role !== 'driver') return true;
  return (assignedMachineIds ?? []).includes(machineId);
}

export default async function RestockSessionPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const machineId = asSingleParam(searchParams.machineId);
  const sessionId = asSingleParam(searchParams.sessionId);

  if (!machineId) {
    redirect('/restock/picklist');
  }

  const supabase = createServerClient();
  const db = supabase;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?returnUrl=/restock/session?machineId=${machineId}`);
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

  if (!profile?.operator_id || !hasPermission(profile.role, 'restock', 'w')) {
    redirect('/dashboard');
  }

  const { data: machineData } = await db
    .from('machines')
    .select('id, name')
    .eq('id', machineId)
    .eq('operator_id', profile.operator_id)
    .maybeSingle();

  const machine = machineData as { id: string; name: string } | null;
  if (!machine?.id) {
    redirect('/restock/picklist');
  }

  if (!hasDriverMachineAccess(profile.role, profile.assigned_machine_ids, machine.id)) {
    redirect('/restock/picklist');
  }

  const adminDb = createAdminClient();
  const adminDbAny = adminDb as any;

  let resolvedSessionId = sessionId;
  if (resolvedSessionId) {
    const { data: sessionData } = await adminDbAny
      .from('restock_sessions')
      .select('id, status, machine_id')
      .eq('id', resolvedSessionId)
      .eq('operator_id', profile.operator_id)
      .maybeSingle();

    const session = sessionData as { id: string; status: string | null; machine_id: string } | null;
    if (!session?.id || session.machine_id !== machine.id || session.status !== 'in_progress') {
      resolvedSessionId = null;
    }
  }

  if (!resolvedSessionId) {
    const { data: insertedSession, error: insertError } = await adminDbAny
      .from('restock_sessions')
      .insert({
        operator_id: profile.operator_id,
        machine_id: machine.id,
        started_by: user.id,
        status: 'in_progress',
      })
      .select('id')
      .single();

    if (insertError || !insertedSession?.id) {
      redirect('/restock/picklist');
    }

    resolvedSessionId = insertedSession.id as string;
    redirect(`/restock/session?machineId=${machine.id}&sessionId=${resolvedSessionId}`);
  }

  const [{ data: productsData }, { data: parData }, { data: currentRows }] = await Promise.all([
    db
      .from('products')
      .select('id, name, photo_url')
      .eq('operator_id', profile.operator_id)
      .eq('status', 'active')
      .order('name', { ascending: true }),
    db.from('par_levels').select('product_id, quantity').eq('machine_id', machine.id),
    db
      .from('rfid_items')
      .select('product_id')
      .eq('operator_id', profile.operator_id)
      .eq('machine_id', machine.id)
      .eq('status', 'in_machine'),
  ]);

  const parMap = new Map<string, number>();
  for (const row of (parData as Array<{ product_id: string; quantity: number }> | null) ?? []) {
    parMap.set(row.product_id, Number(row.quantity ?? 0));
  }

  const currentMap = new Map<string, number>();
  for (const row of (currentRows as Array<{ product_id: string | null }> | null) ?? []) {
    if (!row.product_id) continue;
    currentMap.set(row.product_id, (currentMap.get(row.product_id) ?? 0) + 1);
  }

  const products = ((productsData as Array<{ id: string; name: string; photo_url: string | null }> | null) ?? []).map((product) => ({
    ...product,
    par: Number(parMap.get(product.id) ?? 0),
    currentCount: Number(currentMap.get(product.id) ?? 0),
  }));

  return (
    <RestockSessionClient
      operatorId={profile.operator_id}
      sessionId={resolvedSessionId}
      machineId={machine.id}
      machineName={machine.name}
      products={products}
    />
  );
}
