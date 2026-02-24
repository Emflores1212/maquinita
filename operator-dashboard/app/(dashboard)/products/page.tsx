import { redirect } from 'next/navigation';
import ProductListClient from '@/components/products/ProductListClient';
import type { ProductCategory, ProductListItem } from '@/components/products/types';
import { hasPermission, type UserRole } from '@/lib/permissions';
import { createServerClient } from '@/lib/supabase';

export default async function ProductsPage() {
  const supabase = createServerClient();
  const db = supabase as any;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login?returnUrl=/products');
  }

  const { data: profileData } = await db.from('profiles').select('operator_id, role').eq('id', user.id).maybeSingle();
  const profile = profileData as { operator_id: string | null; role: UserRole | null } | null;

  if (!profile?.operator_id || !hasPermission(profile.role, 'products', 'r')) {
    redirect('/dashboard');
  }

  const { data: categoriesData } = await db
    .from('product_categories')
    .select('id, name, color, sort_order')
    .eq('operator_id', profile.operator_id)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });

  const categories = (categoriesData as ProductCategory[] | null) ?? [];
  const categoryById = new Map(categories.map((category) => [category.id, category]));

  const { data: productsData } = await db
    .from('products')
    .select('id, name, sku, category_id, base_price, status, photo_url, description')
    .eq('operator_id', profile.operator_id)
    .eq('status', 'active')
    .order('name', { ascending: true });

  const products = ((productsData as Array<Omit<ProductListItem, 'category_name' | 'category_color'>> | null) ?? []).map((product) => {
    const category = product.category_id ? categoryById.get(product.category_id) : null;
    return {
      ...product,
      category_name: category?.name ?? null,
      category_color: category?.color ?? null,
    };
  }) as ProductListItem[];

  return <ProductListClient products={products} categories={categories} />;
}
