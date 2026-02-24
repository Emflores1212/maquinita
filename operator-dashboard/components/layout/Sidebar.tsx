'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  LayoutDashboard,
  Server,
  Package,
  Tag,
  Truck,
  Receipt,
  DollarSign,
  BadgePercent,
  BarChart3,
  Settings,
  HelpCircle,
  type LucideIcon,
} from 'lucide-react';
import PermissionGuard from '@/components/auth/PermissionGuard';
import type { PermissionModule } from '@/lib/permissions';

type NavItem = {
  key: string;
  href: string;
  icon: LucideIcon;
  module: PermissionModule;
};

const NAV_ITEMS: NavItem[] = [
  { key: 'dashboard', href: '/dashboard', icon: LayoutDashboard, module: 'dashboard' },
  { key: 'machines', href: '/machines', icon: Server, module: 'machines' },
  { key: 'products', href: '/products', icon: Package, module: 'products' },
  { key: 'inventory', href: '/inventory', icon: Tag, module: 'inventory' },
  { key: 'restock', href: '/restock', icon: Truck, module: 'restock' },
  { key: 'transactions', href: '/transactions', icon: Receipt, module: 'transactions' },
  { key: 'financials', href: '/financials', icon: DollarSign, module: 'financials' },
  { key: 'discounts', href: '/discounts', icon: BadgePercent, module: 'discounts' },
  { key: 'analytics', href: '/analytics', icon: BarChart3, module: 'analytics' },
];

const SETTINGS_ITEM: NavItem = { key: 'settings', href: '/settings', icon: Settings, module: 'settings' };

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function Sidebar({ onHelpClick, onNavigate }: { onHelpClick: () => void; onNavigate?: () => void }) {
  const pathname = usePathname();
  const t = useTranslations('nav');

  return (
    <nav className="flex h-full flex-col justify-between">
      <div className="space-y-2 px-3 py-4">
        {NAV_ITEMS.map((item) => (
          <PermissionGuard key={item.href} module={item.module} action="r">
            <Link
              href={item.href}
              onClick={onNavigate}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                isActive(pathname, item.href)
                  ? 'bg-[#0D2B4E] text-white'
                  : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <item.icon className="h-4 w-4" />
              <span>{t(item.key)}</span>
            </Link>
          </PermissionGuard>
        ))}

        <div className="my-3 border-t border-slate-200" />

        <PermissionGuard module={SETTINGS_ITEM.module} action="r">
          <Link
            href={SETTINGS_ITEM.href}
            onClick={onNavigate}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
              isActive(pathname, SETTINGS_ITEM.href)
                ? 'bg-[#0D2B4E] text-white'
                : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <SETTINGS_ITEM.icon className="h-4 w-4" />
            <span>{t(SETTINGS_ITEM.key)}</span>
          </Link>
        </PermissionGuard>
      </div>

      <div className="border-t border-slate-200 p-3">
        <button
          type="button"
          onClick={onHelpClick}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 hover:text-slate-900"
        >
          <HelpCircle className="h-4 w-4" />
          <span>{t('help')}</span>
        </button>
      </div>
    </nav>
  );
}
