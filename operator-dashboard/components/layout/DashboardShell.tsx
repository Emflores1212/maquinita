'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { LayoutDashboard, Server, Tag, Truck, BarChart3, X } from 'lucide-react';
import Sidebar from '@/components/layout/Sidebar';
import TopBar from '@/components/layout/TopBar';

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function DashboardShell({
  children,
  operatorName,
}: {
  children: React.ReactNode;
  operatorName: string;
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const pathname = usePathname();
  const tNav = useTranslations('nav');
  const tHelp = useTranslations('help');
  const isQrPrintPage = /^\/machines\/[^/]+\/qr$/.test(pathname);
  const isRestockSessionPage = pathname.startsWith('/restock/session');

  const mobileTabs = [
    { key: 'dashboard', href: '/dashboard', icon: LayoutDashboard },
    { key: 'machines', href: '/machines', icon: Server },
    { key: 'inventory', href: '/inventory', icon: Tag },
    { key: 'restock', href: '/restock', icon: Truck },
    { key: 'analytics', href: '/analytics', icon: BarChart3 },
  ];

  if (isQrPrintPage) {
    return <div className="min-h-screen bg-white">{children}</div>;
  }

  if (isRestockSessionPage) {
    return (
      <div className="min-h-screen bg-slate-50 lg:pl-[240px]">
        <aside className="fixed inset-y-0 left-0 hidden w-[240px] border-r border-slate-200 bg-white lg:block">
          <div className="flex h-16 items-center border-b border-slate-200 px-4">
            <p className="text-lg font-bold text-[#0D2B4E]">maquinita</p>
          </div>
          <Sidebar onHelpClick={() => setHelpOpen(true)} />
        </aside>

        <div className="hidden lg:block">
          <TopBar operatorName={operatorName} onOpenMobileMenu={() => setMobileMenuOpen(true)} />
        </div>

        <main className="mx-auto w-full max-w-7xl pb-0 pt-0 lg:px-8 lg:pb-8 lg:pt-4">{children}</main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 lg:pl-[240px]">
      <aside className="fixed inset-y-0 left-0 hidden w-[240px] border-r border-slate-200 bg-white lg:block">
        <div className="flex h-16 items-center border-b border-slate-200 px-4">
          <p className="text-lg font-bold text-[#0D2B4E]">maquinita</p>
        </div>
        <Sidebar onHelpClick={() => setHelpOpen(true)} />
      </aside>

      <TopBar operatorName={operatorName} onOpenMobileMenu={() => setMobileMenuOpen(true)} />

      <main className="mx-auto w-full max-w-7xl px-4 pb-24 pt-4 lg:px-8 lg:pb-8">{children}</main>

      <nav className="fixed bottom-0 left-0 right-0 z-30 border-t border-slate-200 bg-white lg:hidden">
        <div className="grid grid-cols-5">
          {mobileTabs.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center gap-1 py-2 text-[11px] font-semibold ${
                  active ? 'text-[#0D2B4E]' : 'text-slate-500'
                }`}
              >
                <item.icon className="h-4 w-4" />
                <span>{tNav(item.key)}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      {mobileMenuOpen ? (
        <>
          <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={() => setMobileMenuOpen(false)} />
          <div className="fixed inset-y-0 left-0 z-50 w-[280px] border-r border-slate-200 bg-white lg:hidden">
            <div className="flex h-16 items-center justify-between border-b border-slate-200 px-4">
              <p className="text-lg font-bold text-[#0D2B4E]">maquinita</p>
              <button className="rounded-md p-1 hover:bg-slate-100" onClick={() => setMobileMenuOpen(false)} type="button">
                <X className="h-5 w-5" />
              </button>
            </div>
            <Sidebar
              onHelpClick={() => {
                setHelpOpen(true);
                setMobileMenuOpen(false);
              }}
              onNavigate={() => setMobileMenuOpen(false)}
            />
          </div>
        </>
      ) : null}

      {helpOpen ? (
        <>
          <div className="fixed inset-0 z-50 bg-black/30" onClick={() => setHelpOpen(false)} />
          <aside className="fixed right-0 top-0 z-50 h-full w-full max-w-md border-l border-slate-200 bg-white p-5 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-semibold text-slate-900">{tHelp('title')}</h3>
              <button className="rounded-md p-1 hover:bg-slate-100" onClick={() => setHelpOpen(false)} type="button">
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-sm text-slate-600">{tHelp('description')}</p>
          </aside>
        </>
      ) : null}
    </div>
  );
}
