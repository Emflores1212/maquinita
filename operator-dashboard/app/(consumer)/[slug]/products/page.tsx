import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { createServerClient } from '@/lib/supabase';

function money(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(value);
}

export default async function ConsumerProductsPage({ params }: { params: { slug: string } }) {
  const t = await getTranslations('consumer.products');
  const supabase = createServerClient();

  const { data: operatorData } = await supabase.from('operators').select('id').eq('slug', params.slug).maybeSingle();
  const operator = operatorData as { id: string } | null;
  if (!operator?.id) {
    notFound();
  }

  const { data: productsData } = await supabase
    .from('products')
    .select('id, name, photo_url, base_price, product_categories(name)')
    .eq('operator_id', operator.id)
    .eq('status', 'active')
    .order('name', { ascending: true });

  const products =
    ((productsData as Array<{
      id: string;
      name: string;
      photo_url: string | null;
      base_price: number | null;
      product_categories: { name?: string | null } | null;
    }> | null) ?? []).map((product) => ({
      id: product.id,
      name: product.name,
      photoUrl: product.photo_url,
      basePrice: Number(product.base_price ?? 0),
      categoryName: product.product_categories?.name ?? 'Uncategorized',
    }));

  return (
    <div className="space-y-3">
      <h2 className="text-base font-semibold text-slate-900">{t('title')}</h2>
      {products.map((product) => (
        <article key={product.id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          {product.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={product.photoUrl} alt={product.name} className="h-14 w-14 rounded-lg object-cover" />
          ) : (
            <div className="h-14 w-14 rounded-lg bg-slate-100" />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-900">{product.name}</p>
            <p className="text-xs text-slate-500">{product.categoryName}</p>
          </div>
          <p className="text-sm font-bold text-slate-900">{money(product.basePrice)}</p>
        </article>
      ))}
      {products.length === 0 ? <p className="text-sm text-slate-500">{t('noProducts')}</p> : null}
    </div>
  );
}
