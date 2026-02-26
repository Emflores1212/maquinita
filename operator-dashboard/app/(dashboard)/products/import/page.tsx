import { redirect } from 'next/navigation';
import ProductImportClient from '@/components/products/ProductImportClient';
import { hasPermission, type UserRole } from '@/lib/permissions';
import { createServerClient } from '@/lib/supabase';

export default async function ProductImportPage() {
  const supabase = createServerClient();
  const db = supabase;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login?returnUrl=/products/import');
  }

  const { data: profileData } = await db.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const role = (profileData as { role: UserRole | null } | null)?.role;

  if (!hasPermission(role, 'products', 'w')) {
    redirect('/products');
  }

  return <ProductImportClient />;
}
