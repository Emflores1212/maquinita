'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Upload, Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import PermissionGuard from '@/components/auth/PermissionGuard';
import type { ProductCategory, ProductListItem } from '@/components/products/types';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';

export default function ProductListClient({
  products,
  categories,
}: {
  products: ProductListItem[];
  categories: ProductCategory[];
}) {
  const t = useTranslations('productCatalog');
  const router = useRouter();
  const [searchInput, setSearchInput] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'archived'>('active');
  const search = useDebouncedValue(searchInput, 250).trim().toLowerCase();

  const filteredProducts = useMemo(() => {
    return products
      .filter((product) => {
        const matchesCategory = categoryFilter === 'all' || product.category_id === categoryFilter;
        const normalizedStatus = (product.status ?? 'active').toLowerCase();
        const matchesStatus = statusFilter === 'all' || normalizedStatus === statusFilter;
        const matchesSearch =
          search.length === 0 ||
          product.name.toLowerCase().includes(search) ||
          (product.sku ?? '').toLowerCase().includes(search);
        return matchesCategory && matchesStatus && matchesSearch;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [products, categoryFilter, statusFilter, search]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('title')}</h1>
          <p className="text-sm text-slate-500">{t('subtitle')}</p>
        </div>

        <PermissionGuard module="products" action="w">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/products/import"
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <Upload className="h-4 w-4" />
              {t('importCsv')}
            </Link>

            <Link
              href="/products/new/edit"
              className="inline-flex items-center gap-2 rounded-lg bg-[#0D2B4E] px-3 py-2 text-sm font-semibold text-white hover:bg-[#0A2240]"
            >
              <Plus className="h-4 w-4" />
              {t('addProduct')}
            </Link>
          </div>
        </PermissionGuard>
      </div>

      <div className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-4 lg:grid-cols-4">
        <label className="relative lg:col-span-2">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder={t('searchPlaceholder')}
            className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm outline-none focus:border-[#1565C0] focus:bg-white"
          />
        </label>

        <select
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#1565C0]"
          value={categoryFilter}
          onChange={(event) => setCategoryFilter(event.target.value)}
        >
          <option value="all">{t('categoryAll')}</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>

        <select
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#1565C0]"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}
        >
          <option value="all">{t('statusAll')}</option>
          <option value="active">{t('statusActive')}</option>
          <option value="archived">{t('statusArchived')}</option>
        </select>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">{t('tablePhoto')}</th>
              <th className="px-4 py-3">{t('tableName')}</th>
              <th className="px-4 py-3">SKU</th>
              <th className="px-4 py-3">{t('tableCategory')}</th>
              <th className="px-4 py-3">{t('tablePrice')}</th>
              <th className="px-4 py-3">{t('tableStatus')}</th>
            </tr>
          </thead>
          <tbody>
            {filteredProducts.map((product) => (
              <tr
                key={product.id}
                className="cursor-pointer border-t border-slate-100 transition-colors hover:bg-slate-50"
                onClick={() => router.push(`/products/${product.id}/edit`)}
              >
                <td className="px-4 py-3">
                  <div className="h-10 w-10 overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
                    {product.photo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={product.photo_url} alt={product.name} className="h-full w-full object-cover" />
                    ) : null}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <p className="font-semibold text-slate-900">{product.name}</p>
                  <p className="text-xs text-slate-500">{product.description ?? '-'}</p>
                </td>
                <td className="px-4 py-3 font-mono text-xs">{product.sku ?? '-'}</td>
                <td className="px-4 py-3">
                  {product.category_name ? (
                    <span
                      className="inline-flex rounded-full px-2 py-1 text-xs font-semibold text-white"
                      style={{ backgroundColor: product.category_color ?? '#6B7280' }}
                    >
                      {product.category_name}
                    </span>
                  ) : (
                    <span className="text-xs text-slate-500">-</span>
                  )}
                </td>
                <td className="px-4 py-3 font-semibold">${Number(product.base_price).toFixed(2)}</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-1 text-xs font-semibold ${
                      product.status === 'archived' ? 'bg-slate-200 text-slate-700' : 'bg-emerald-100 text-emerald-700'
                    }`}
                  >
                    {product.status === 'archived' ? t('statusArchived') : t('statusActive')}
                  </span>
                </td>
              </tr>
            ))}

            {filteredProducts.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-500">
                  {t('empty')}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
