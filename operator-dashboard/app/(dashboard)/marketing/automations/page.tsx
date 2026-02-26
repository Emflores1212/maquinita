import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import AutomationsPageClient from '@/components/marketing/AutomationsPageClient';
import { hasPermission, type UserRole } from '@/lib/permissions';
import { createServerClient } from '@/lib/supabase';

export default async function MarketingAutomationsPage() {
  const t = await getTranslations('marketing.automations');
  const supabase = createServerClient();
  const db = supabase as any;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login?returnUrl=/marketing/automations');
  }

  const { data: profileData } = await db.from('profiles').select('operator_id, role').eq('id', user.id).maybeSingle();
  const profile = profileData as { operator_id: string | null; role: UserRole | null } | null;

  if (!profile?.operator_id || !hasPermission(profile.role, 'marketing', 'r')) {
    redirect('/dashboard');
  }

  const { data: rulesData } = await db
    .from('automation_rules')
    .select('id, name, trigger_type, trigger_value, reward_credits, is_active, created_at')
    .eq('operator_id', profile.operator_id)
    .order('created_at', { ascending: false });

  const rules =
    ((rulesData as Array<{
      id: string;
      name: string;
      trigger_type: 'welcome' | 'nth_purchase' | 'spend_threshold';
      trigger_value: number | null;
      reward_credits: number | null;
      is_active: boolean | null;
      created_at: string | null;
    }> | null) ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      triggerType: row.trigger_type,
      triggerValue: row.trigger_value,
      rewardCredits: Number(row.reward_credits ?? 0),
      isActive: Boolean(row.is_active),
      createdAt: row.created_at ?? new Date().toISOString(),
    }));

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">{t('pageTitle')}</h1>
        <p className="text-sm text-slate-600">{t('pageDescription')}</p>
      </header>
      <AutomationsPageClient rules={rules} />
    </div>
  );
}
