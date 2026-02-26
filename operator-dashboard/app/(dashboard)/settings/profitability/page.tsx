import { redirect } from 'next/navigation';
import AccessDenied from '@/components/auth/AccessDenied';
import ProfitabilitySettingsClient from '@/components/settings/ProfitabilitySettingsClient';
import { hasPermission, type UserRole } from '@/lib/permissions';
import { createServerClient } from '@/lib/supabase';

export default async function ProfitabilitySettingsPage() {
  const supabase = createServerClient();
  const db = supabase;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login?returnUrl=/settings/profitability');
  }

  const { data: profileData } = await db.from('profiles').select('operator_id, role').eq('id', user.id).maybeSingle();
  const profile = profileData as { operator_id: string | null; role: UserRole | null } | null;

  if (!profile?.operator_id) {
    redirect('/dashboard');
  }

  if (!hasPermission(profile.role, 'settings', 'r')) {
    return <AccessDenied />;
  }

  const canEdit = hasPermission(profile.role, 'settings', 'w');

  const [categoriesData, productsData, cogsData] = await Promise.all([
    db.from('product_categories').select('id, name').eq('operator_id', profile.operator_id).order('name', { ascending: true }),
    db.from('products').select('id, name, category_id').eq('operator_id', profile.operator_id).order('name', { ascending: true }),
    db.from('cogs_settings').select('id, product_id, category_id, cogs_percentage').eq('operator_id', profile.operator_id),
  ]);

  const categories =
    ((categoriesData.data as Array<{ id: string; name: string }> | null) ?? []).map((category) => ({
      id: category.id,
      name: category.name,
    }));

  const products =
    ((productsData.data as Array<{ id: string; name: string; category_id: string | null }> | null) ?? []).map((product) => ({
      id: product.id,
      name: product.name,
      categoryId: product.category_id,
    }));

  const categoryCogs: Record<string, { settingId: string; cogsPercentage: number }> = {};
  const productCogs: Record<string, { settingId: string; cogsPercentage: number }> = {};

  for (const row of (cogsData.data as Array<{ id: string; product_id: string | null; category_id: string | null; cogs_percentage: number | null }> | null) ?? []) {
    const cogsPercentage = Number(row.cogs_percentage ?? 0);

    if (row.category_id) {
      categoryCogs[row.category_id] = {
        settingId: row.id,
        cogsPercentage,
      };
    }

    if (row.product_id) {
      productCogs[row.product_id] = {
        settingId: row.id,
        cogsPercentage,
      };
    }
  }

  return (
    <ProfitabilitySettingsClient
      canEdit={canEdit}
      categories={categories}
      products={products}
      categoryCogs={categoryCogs}
      productCogs={productCogs}
    />
  );
}
