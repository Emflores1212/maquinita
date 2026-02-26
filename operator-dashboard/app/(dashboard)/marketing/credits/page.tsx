import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import CreditsPageClient from '@/components/marketing/CreditsPageClient';
import { hasPermission, type UserRole } from '@/lib/permissions';
import { createServerClient } from '@/lib/supabase';

export default async function MarketingCreditsPage() {
  const t = await getTranslations('marketing.credits');
  const supabase = createServerClient();
  const db = supabase as any;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login?returnUrl=/marketing/credits');
  }

  const { data: profileData } = await db.from('profiles').select('operator_id, role').eq('id', user.id).maybeSingle();
  const profile = profileData as { operator_id: string | null; role: UserRole | null } | null;

  if (!profile?.operator_id || !hasPermission(profile.role, 'marketing', 'r')) {
    redirect('/dashboard');
  }

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">{t('pageTitle')}</h1>
        <p className="text-sm text-slate-600">{t('pageDescription')}</p>
      </header>
      <CreditsPageClient />
    </div>
  );
}
