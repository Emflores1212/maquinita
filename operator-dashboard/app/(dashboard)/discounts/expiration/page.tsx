import { redirect } from 'next/navigation';
import ExpirationRulesBuilder from '@/components/discounts/ExpirationRulesBuilder';
import type { DiscountTargetOption } from '@/components/discounts/types';
import { hasPermission, type UserRole } from '@/lib/permissions';
import { createServerClient } from '@/lib/supabase';

export default async function DiscountExpirationRulesPage() {
  const supabase = createServerClient();
  const db = supabase as any;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login?returnUrl=/discounts/expiration');
  }

  const { data: profileData } = await db.from('profiles').select('operator_id, role').eq('id', user.id).maybeSingle();
  const profile = profileData as { operator_id: string | null; role: UserRole | null } | null;

  if (!profile?.operator_id || !hasPermission(profile.role, 'discounts', 'w')) {
    redirect('/discounts');
  }

  const [productsData, categoriesData] = await Promise.all([
    db.from('products').select('id, name').eq('operator_id', profile.operator_id).neq('status', 'archived').order('name', { ascending: true }),
    db.from('product_categories').select('id, name').eq('operator_id', profile.operator_id).order('name', { ascending: true }),
  ]);

  const products: DiscountTargetOption[] = ((productsData.data as Array<{ id: string; name: string }> | null) ?? []).map((row) => ({
    id: row.id,
    name: row.name,
  }));

  const categories: DiscountTargetOption[] = ((categoriesData.data as Array<{ id: string; name: string }> | null) ?? []).map((row) => ({
    id: row.id,
    name: row.name,
  }));

  return <ExpirationRulesBuilder products={products} categories={categories} />;
}
