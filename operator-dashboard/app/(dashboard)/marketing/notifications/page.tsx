import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import NotificationsPageClient from '@/components/marketing/NotificationsPageClient';
import { hasPermission, type UserRole } from '@/lib/permissions';
import { createServerClient } from '@/lib/supabase';

export default async function MarketingNotificationsPage() {
  const t = await getTranslations('marketing.notifications');
  const supabase = createServerClient();
  const db = supabase;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login?returnUrl=/marketing/notifications');
  }

  const { data: profileData } = await db.from('profiles').select('operator_id, role').eq('id', user.id).maybeSingle();
  const profile = profileData as { operator_id: string | null; role: UserRole | null } | null;

  if (!profile?.operator_id || !hasPermission(profile.role, 'marketing', 'r')) {
    redirect('/dashboard');
  }

  const [machinesData, sendsData] = await Promise.all([
    db.from('machines').select('id, name').eq('operator_id', profile.operator_id).neq('status', 'archived').order('name', { ascending: true }),
    db
      .from('notification_sends')
      .select('id, title, body, target, sent_count, sent_at, scheduled_for, created_at')
      .eq('operator_id', profile.operator_id)
      .order('created_at', { ascending: false })
      .limit(100),
  ]);

  const machines = ((machinesData.data as Array<{ id: string; name: string }> | null) ?? []).map((machine) => ({
    id: machine.id,
    name: machine.name,
  }));

  const history =
    ((sendsData.data as Array<{
      id: string;
      title: string;
      body: string;
      target: Record<string, unknown> | null;
      sent_count: number | null;
      sent_at: string | null;
      scheduled_for: string | null;
      created_at: string | null;
    }> | null) ?? []).map((row) => ({
      id: row.id,
      title: row.title,
      body: row.body,
      target: row.target ?? {},
      sentCount: Number(row.sent_count ?? 0),
      sentAt: row.sent_at,
      scheduledFor: row.scheduled_for,
      createdAt: row.created_at ?? new Date().toISOString(),
    }));

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">{t('pageTitle')}</h1>
        <p className="text-sm text-slate-600">{t('pageDescription')}</p>
      </header>
      <NotificationsPageClient machines={machines} history={history} />
    </div>
  );
}
