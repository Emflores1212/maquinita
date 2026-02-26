import { redirect } from 'next/navigation';
import AccessDenied from '@/components/auth/AccessDenied';
import ApiKeysSettingsClient from '@/components/settings/ApiKeysSettingsClient';
import { hasPermission, type UserRole } from '@/lib/permissions';
import { createServerClient } from '@/lib/supabase';

export default async function ApiSettingsPage() {
  const supabase = createServerClient();
  const db = supabase;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login?returnUrl=/settings/api');
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

  const { data: apiKeysData } = await db
    .from('api_keys')
    .select('id, name, key_prefix, permissions, usage_count_today, created_at, last_used_at, is_active')
    .eq('operator_id', profile.operator_id)
    .order('created_at', { ascending: false });

  const rows = ((apiKeysData as Array<Record<string, unknown>> | null) ?? []).map((row) => ({
    id: String(row.id ?? ''),
    name: String(row.name ?? ''),
    keyPrefix: String(row.key_prefix ?? ''),
    permissions: Array.isArray(row.permissions) ? row.permissions.map((entry) => String(entry)) : [],
    usageCountToday: Number(row.usage_count_today ?? 0),
    createdAt: String(row.created_at ?? ''),
    lastUsedAt: row.last_used_at ? String(row.last_used_at) : null,
    isActive: Boolean(row.is_active),
  }));

  return <ApiKeysSettingsClient rows={rows} canEdit={canEdit} />;
}
