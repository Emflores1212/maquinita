import { redirect } from 'next/navigation';
import AccessDenied from '@/components/auth/AccessDenied';
import WebhooksSettingsClient from '@/components/settings/WebhooksSettingsClient';
import { hasPermission, type UserRole } from '@/lib/permissions';
import { createServerClient } from '@/lib/supabase';

export default async function WebhooksSettingsPage() {
  const supabase = createServerClient();
  const db = supabase;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login?returnUrl=/settings/webhooks');
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

  const { data: subscriptionsData } = await db
    .from('webhook_subscriptions')
    .select('id, url, events, is_active, created_at')
    .eq('operator_id', profile.operator_id)
    .order('created_at', { ascending: false });

  const subscriptions = ((subscriptionsData as Array<Record<string, unknown>> | null) ?? []).map((row) => ({
    id: String(row.id ?? ''),
    url: String(row.url ?? ''),
    events: Array.isArray(row.events) ? row.events.map((entry) => String(entry)) : [],
    isActive: Boolean(row.is_active),
    createdAt: String(row.created_at ?? ''),
  }));

  const subscriptionIds = subscriptions.map((row) => row.id).filter(Boolean);
  let deliveries: Array<{
    id: string;
    subscriptionId: string;
    event: string | null;
    status: number | null;
    responseBody: string | null;
    attemptCount: number;
    nextRetryAt: string | null;
    createdAt: string;
  }> = [];

  if (subscriptionIds.length > 0) {
    const { data: deliveriesData } = await db
      .from('webhook_deliveries')
      .select('id, subscription_id, event, status, response_body, attempt_count, next_retry_at, created_at')
      .in('subscription_id', subscriptionIds)
      .order('created_at', { ascending: false })
      .limit(50);

    deliveries = ((deliveriesData as Array<Record<string, unknown>> | null) ?? []).map((row) => ({
      id: String(row.id ?? ''),
      subscriptionId: String(row.subscription_id ?? ''),
      event: row.event ? String(row.event) : null,
      status: typeof row.status === 'number' ? row.status : row.status ? Number(row.status) : null,
      responseBody: row.response_body ? String(row.response_body) : null,
      attemptCount: Number(row.attempt_count ?? 1),
      nextRetryAt: row.next_retry_at ? String(row.next_retry_at) : null,
      createdAt: String(row.created_at ?? ''),
    }));
  }

  return <WebhooksSettingsClient subscriptions={subscriptions} deliveries={deliveries} canEdit={canEdit} />;
}
