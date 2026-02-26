'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MapPin, Package, UserCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import AddToHomeBanner from '@/components/consumer/AddToHomeBanner';
import type { ConsumerOperatorSummary } from '@/components/consumer/types';

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function ConsumerShell({
  operator,
  children,
}: {
  operator: ConsumerOperatorSummary;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const t = useTranslations('consumer.nav');
  const isLoginRoute = pathname.endsWith('/login');

  return (
    <div className="min-h-screen bg-slate-50" style={{ '--brand-primary': operator.primaryColor } as React.CSSProperties}>
      <header className="border-b border-slate-200 bg-white px-4 py-3">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-3">
          {operator.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={operator.logoUrl} alt={operator.name} className="h-10 w-10 rounded-lg object-cover" />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-lg text-sm font-bold text-white" style={{ backgroundColor: 'var(--brand-primary)' }}>
              {operator.name.slice(0, 2).toUpperCase()}
            </div>
          )}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Maquinita</p>
            <h1 className="text-base font-bold text-slate-900">{operator.name}</h1>
          </div>
        </div>
      </header>

      <main className={`mx-auto w-full max-w-3xl px-4 ${isLoginRoute ? 'py-6' : 'pb-24 pt-4'}`}>
        {!isLoginRoute ? <AddToHomeBanner slug={operator.slug} /> : null}
        {children}
      </main>

      {!isLoginRoute ? (
        <nav className="fixed bottom-0 left-0 right-0 z-30 border-t border-slate-200 bg-white">
          <div className="mx-auto grid w-full max-w-3xl grid-cols-3">
            <Link
              href={`/${operator.slug}`}
              className={`flex min-h-12 flex-col items-center justify-center gap-1 text-xs font-semibold ${
                isActive(pathname, `/${operator.slug}`) && !pathname.includes('/products') && !pathname.includes('/profile') ? 'text-[#0D2B4E]' : 'text-slate-500'
              }`}
            >
              <MapPin className="h-4 w-4" />
              <span>{t('map')}</span>
            </Link>
            <Link
              href={`/${operator.slug}/products`}
              className={`flex min-h-12 flex-col items-center justify-center gap-1 text-xs font-semibold ${
                isActive(pathname, `/${operator.slug}/products`) ? 'text-[#0D2B4E]' : 'text-slate-500'
              }`}
            >
              <Package className="h-4 w-4" />
              <span>{t('products')}</span>
            </Link>
            <Link
              href={`/${operator.slug}/profile`}
              className={`flex min-h-12 flex-col items-center justify-center gap-1 text-xs font-semibold ${
                isActive(pathname, `/${operator.slug}/profile`) ? 'text-[#0D2B4E]' : 'text-slate-500'
              }`}
            >
              <UserCircle className="h-4 w-4" />
              <span>{t('profile')}</span>
            </Link>
          </div>
        </nav>
      ) : null}
    </div>
  );
}
