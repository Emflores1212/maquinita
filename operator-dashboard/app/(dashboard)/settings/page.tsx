import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import AccessDenied from '@/components/auth/AccessDenied';
import NotificationSettingsCard from '@/components/settings/NotificationSettingsCard';
import ReceiptTemplateSettings from '@/components/settings/ReceiptTemplateSettings';
import { hasPermission, type UserRole } from '@/lib/permissions';
import { createServerClient } from '@/lib/supabase';

function readBrandingField(source: Record<string, unknown>, key: string) {
  const value = source[key];
  return typeof value === 'string' ? value : '';
}

export default async function SettingsPage() {
  const tProfitability = await getTranslations('settingsPage.profitability');
  const supabase = createServerClient();
  const db = supabase as any;
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login?returnUrl=/settings');
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

  const { data: operatorData } = await db
    .from('operators')
    .select('name, branding')
    .eq('id', profile.operator_id)
    .maybeSingle();

  const operator = (operatorData as { name?: string | null; branding?: unknown } | null) ?? null;
  const branding = (operator?.branding as Record<string, unknown> | null) ?? {};

  return (
    <div className="space-y-4">
      <NotificationSettingsCard />

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold text-slate-900">Integration Hub</h2>
        <p className="mt-1 text-sm text-slate-600">Manage API keys, webhooks, and external integrations.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <Link href="/settings/api" className="flex min-h-12 items-center justify-center rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700">
            API Keys
          </Link>
          <Link href="/settings/webhooks" className="flex min-h-12 items-center justify-center rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700">
            Webhooks
          </Link>
          <Link href="/settings/integrations" className="flex min-h-12 items-center justify-center rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700">
            Integrations
          </Link>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold text-slate-900">{tProfitability('title')}</h2>
        <p className="mt-1 text-sm text-slate-600">{tProfitability('subtitle')}</p>
        <div className="mt-3">
          <Link href="/settings/profitability" className="inline-flex h-11 items-center rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700">
            {tProfitability('open')}
          </Link>
        </div>
      </section>

      <ReceiptTemplateSettings
        operatorId={profile.operator_id}
        operatorName={operator?.name || 'Maquinita'}
        canEdit={canEdit}
        initial={{
          logoUrl: readBrandingField(branding, 'receiptLogoUrl'),
          primaryColor: readBrandingField(branding, 'receiptPrimaryColor') || '#0D2B4E',
          footerText: readBrandingField(branding, 'receiptFooterText'),
          supportEmail: readBrandingField(branding, 'receiptSupportEmail'),
          supportPhone: readBrandingField(branding, 'receiptSupportPhone'),
        }}
      />
    </div>
  );
}
