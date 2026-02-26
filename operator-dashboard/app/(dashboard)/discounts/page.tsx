import { redirect } from 'next/navigation';
import DiscountsPageClient from '@/components/discounts/DiscountsPageClient';
import type {
  DiscountListItem,
  DiscountPerformanceTxRow,
  DiscountTargetOption,
  ExpirationRuleListItem,
} from '@/components/discounts/types';
import { hasPermission, type UserRole } from '@/lib/permissions';
import { createServerClient } from '@/lib/supabase';

export default async function DiscountsPage() {
  const supabase = createServerClient();
  const db = supabase as any;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login?returnUrl=/discounts');
  }

  const { data: profileData } = await db.from('profiles').select('operator_id, role').eq('id', user.id).maybeSingle();
  const profile = profileData as { operator_id: string | null; role: UserRole | null } | null;

  if (!profile?.operator_id || !hasPermission(profile.role, 'discounts', 'r')) {
    redirect('/dashboard');
  }

  const [discountsData, expirationRulesData, productsData, categoriesData, machinesData, transactionsData] = await Promise.all([
    db.from('discounts').select('*').eq('operator_id', profile.operator_id).order('created_at', { ascending: false }),
    db.from('expiration_rules').select('*').eq('operator_id', profile.operator_id).order('created_at', { ascending: false }),
    db.from('products').select('id, name').eq('operator_id', profile.operator_id).neq('status', 'archived').order('name', { ascending: true }),
    db.from('product_categories').select('id, name').eq('operator_id', profile.operator_id).order('name', { ascending: true }),
    db.from('machines').select('id, name').eq('operator_id', profile.operator_id).neq('status', 'archived').order('name', { ascending: true }),
    db
      .from('transactions')
      .select('id, discount_id, machine_id, amount, discount_amount, status, created_at')
      .eq('operator_id', profile.operator_id)
      .not('discount_id', 'is', null)
      .in('status', ['completed', 'refunded'])
      .order('created_at', { ascending: false })
      .limit(5000),
  ]);

  const discounts = ((discountsData.data as DiscountListItem[] | null) ?? []).map((row) => ({
    ...row,
    target_product_ids: row.target_product_ids ?? [],
    target_category_ids: row.target_category_ids ?? [],
    target_machine_ids: row.target_machine_ids ?? [],
  }));

  const expirationRules = (expirationRulesData.data as ExpirationRuleListItem[] | null) ?? [];

  const products: DiscountTargetOption[] = ((productsData.data as Array<{ id: string; name: string }> | null) ?? []).map((row) => ({
    id: row.id,
    name: row.name,
  }));

  const categories: DiscountTargetOption[] = ((categoriesData.data as Array<{ id: string; name: string }> | null) ?? []).map((row) => ({
    id: row.id,
    name: row.name,
  }));

  const machines: DiscountTargetOption[] = ((machinesData.data as Array<{ id: string; name: string }> | null) ?? []).map((row) => ({
    id: row.id,
    name: row.name,
  }));

  const machineNameById = new Map(machines.map((machine) => [machine.id, machine.name]));

  const performanceRows: DiscountPerformanceTxRow[] =
    ((transactionsData.data as Array<{
      id: string;
      discount_id: string | null;
      machine_id: string | null;
      amount: number | null;
      discount_amount: number | null;
      status: string | null;
      created_at: string | null;
    }> | null) ?? [])
      .filter((row) => row.discount_id && row.created_at)
      .map((row) => ({
        id: row.id,
        discountId: row.discount_id as string,
        machineId: row.machine_id,
        machineName: row.machine_id ? machineNameById.get(row.machine_id) ?? row.machine_id : 'Unknown',
        amount: Number(row.amount ?? 0),
        discountAmount: Number(row.discount_amount ?? 0),
        status: row.status ?? 'completed',
        createdAt: row.created_at as string,
      }));

  return (
    <DiscountsPageClient
      discounts={discounts}
      expirationRules={expirationRules}
      products={products}
      categories={categories}
      machines={machines}
      performanceRows={performanceRows}
      canWrite={hasPermission(profile.role, 'discounts', 'w')}
    />
  );
}
