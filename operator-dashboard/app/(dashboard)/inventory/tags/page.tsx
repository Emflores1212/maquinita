import { redirect } from 'next/navigation';
import TagManagementClient from '@/components/inventory/TagManagementClient';
import type { InventoryMachine, InventoryProduct, ShippingAddress, TagOrder } from '@/components/inventory/types';
import { hasPermission, type UserRole } from '@/lib/permissions';
import { createServerClient } from '@/lib/supabase';

function getDefaultShippingAddress(input: unknown, fallbackContactName: string): ShippingAddress {
  const record = (input as Record<string, unknown> | null) ?? {};
  const shipping = (record.shippingAddress as Record<string, unknown> | undefined) ?? {};

  return {
    line1: typeof shipping.line1 === 'string' ? shipping.line1 : '',
    line2: typeof shipping.line2 === 'string' ? shipping.line2 : '',
    city: typeof shipping.city === 'string' ? shipping.city : '',
    state: typeof shipping.state === 'string' ? shipping.state : '',
    postalCode: typeof shipping.postalCode === 'string' ? shipping.postalCode : '',
    country: typeof shipping.country === 'string' ? shipping.country : 'US',
    contactName: typeof shipping.contactName === 'string' ? shipping.contactName : fallbackContactName,
    phone: typeof shipping.phone === 'string' ? shipping.phone : '',
  };
}

export default async function InventoryTagsPage() {
  const supabase = createServerClient();
  const db = supabase as any;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login?returnUrl=/inventory/tags');
  }

  const { data: profileData } = await db
    .from('profiles')
    .select('operator_id, role, full_name')
    .eq('id', user.id)
    .maybeSingle();

  const profile = profileData as {
    operator_id: string | null;
    role: UserRole | null;
    full_name: string | null;
  } | null;

  if (!profile?.operator_id || !hasPermission(profile.role, 'inventory', 'r')) {
    redirect('/dashboard');
  }

  const canWrite = hasPermission(profile.role, 'inventory', 'w');

  const [productsData, machinesData, tagOrdersData, operatorData] = await Promise.all([
    db
      .from('products')
      .select('id, name, photo_url')
      .eq('operator_id', profile.operator_id)
      .eq('status', 'active')
      .order('name', { ascending: true }),
    db
      .from('machines')
      .select('id, name')
      .eq('operator_id', profile.operator_id)
      .neq('status', 'archived')
      .order('name', { ascending: true }),
    db
      .from('tag_orders')
      .select('id, tag_type, quantity, status, created_at')
      .eq('operator_id', profile.operator_id)
      .order('created_at', { ascending: false })
      .limit(50),
    db.from('operators').select('settings').eq('id', profile.operator_id).maybeSingle(),
  ]);

  const products = (productsData.data as InventoryProduct[] | null) ?? [];
  const machines = (machinesData.data as InventoryMachine[] | null) ?? [];
  const tagOrders = (tagOrdersData.data as TagOrder[] | null) ?? [];
  const operatorSettings = (operatorData.data as { settings?: unknown } | null)?.settings ?? null;

  const defaultShippingAddress = getDefaultShippingAddress(
    operatorSettings,
    profile.full_name ?? user.email?.split('@')[0] ?? ''
  );

  return (
    <TagManagementClient
      products={products}
      machines={machines}
      initialTagOrders={tagOrders}
      canWrite={canWrite}
      defaultShippingAddress={defaultShippingAddress}
    />
  );
}
