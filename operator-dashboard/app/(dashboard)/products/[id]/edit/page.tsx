import { redirect } from 'next/navigation';
import ProductEditorForm from '@/components/products/ProductEditorForm';
import type { MachineOption, MachinePrice, ProductCategory, ProductDetailData } from '@/components/products/types';
import { hasPermission, type UserRole } from '@/lib/permissions';
import { createServerClient } from '@/lib/supabase';

export default async function ProductEditPage({ params }: { params: { id: string } }) {
  const supabase = createServerClient();
  const db = supabase as any;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?returnUrl=/products/${params.id}/edit`);
  }

  const { data: profileData } = await db.from('profiles').select('operator_id, role').eq('id', user.id).maybeSingle();
  const profile = profileData as { operator_id: string | null; role: UserRole | null } | null;

  if (!profile?.operator_id || !hasPermission(profile.role, 'products', 'w')) {
    redirect('/products');
  }

  const isCreateMode = params.id === 'new';

  const { data: categoriesData } = await db
    .from('product_categories')
    .select('id, name, color, sort_order')
    .eq('operator_id', profile.operator_id)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });

  const categories = (categoriesData as ProductCategory[] | null) ?? [];

  const { data: machinesData } = await db
    .from('machines')
    .select('id, name')
    .eq('operator_id', profile.operator_id)
    .neq('status', 'archived')
    .order('name', { ascending: true });

  const machines = (machinesData as MachineOption[] | null) ?? [];

  let product: ProductDetailData | null = null;
  let machinePriceOverrides: MachinePrice[] = [];

  if (!isCreateMode) {
    const { data: productData } = await db
      .from('products')
      .select('id, name, sku, category_id, description, base_price, photo_url, nutritional, allergens, status')
      .eq('id', params.id)
      .eq('operator_id', profile.operator_id)
      .maybeSingle();

    if (!productData) {
      redirect('/products');
    }

    product = productData as ProductDetailData;

    const { data: priceData } = await db
      .from('machine_product_prices')
      .select('machine_id, product_id, price')
      .eq('product_id', params.id);

    machinePriceOverrides = (priceData as MachinePrice[] | null) ?? [];
  }

  return (
    <ProductEditorForm
      mode={isCreateMode ? 'create' : 'edit'}
      operatorId={profile.operator_id}
      product={product}
      categories={categories}
      machines={machines}
      machinePriceOverrides={machinePriceOverrides}
    />
  );
}
