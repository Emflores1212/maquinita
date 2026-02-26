'use client';

import { Menu } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import NotificationBell from '@/components/layout/NotificationBell';
import LanguageToggle from '@/components/layout/LanguageToggle';

function resolveTitle(pathname: string, tNav: (key: string) => string) {
  if (pathname.startsWith('/machines')) return tNav('machines');
  if (pathname.startsWith('/products')) return tNav('products');
  if (pathname.startsWith('/inventory')) return tNav('inventory');
  if (pathname.startsWith('/restock')) return tNav('restock');
  if (pathname.startsWith('/transactions')) return tNav('transactions');
  if (pathname.startsWith('/financials')) return tNav('financials');
  if (pathname.startsWith('/marketing')) return tNav('marketing');
  if (pathname.startsWith('/discounts')) return tNav('discounts');
  if (pathname.startsWith('/analytics')) return tNav('analytics');
  if (pathname.startsWith('/settings')) return tNav('settings');
  return tNav('dashboard');
}

export default function TopBar({ operatorName, onOpenMobileMenu }: { operatorName: string; onOpenMobileMenu: () => void }) {
  const pathname = usePathname();
  const tNav = useTranslations('nav');
  const tTopBar = useTranslations('topbar');
  const pageTitle = resolveTitle(pathname, tNav);

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-4 lg:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={onOpenMobileMenu}
            className="rounded-md border border-slate-200 p-2 text-slate-700 lg:hidden"
            aria-label={tTopBar('mobileMenu')}
          >
            <Menu className="h-4 w-4" />
          </button>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900">{pageTitle}</p>
            <p className="truncate text-xs text-slate-500">
              {tTopBar('operator')}: {operatorName}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <NotificationBell />
          <LanguageToggle />
        </div>
      </div>
    </header>
  );
}
