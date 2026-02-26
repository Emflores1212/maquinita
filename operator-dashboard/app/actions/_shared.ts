import { hasPermission, type PermissionAction, type PermissionModule, type UserRole } from '@/lib/permissions';
import { createServerClient } from '@/lib/supabase';
import type { Database } from '@/lib/types';

export type ActionContext =
  | { error: string }
  | {
      userId: string;
      operatorId: string;
      role: UserRole | null;
    };

type AuditInsert = Database['public']['Tables']['audit_log']['Insert'];

export async function requireActionContext(): Promise<ActionContext> {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: 'Not authenticated' };

  const { data: profileData, error: profileError } = await supabase.from('profiles').select('operator_id, role').eq('id', user.id).single();
  const profile = profileData as { operator_id: string | null; role: UserRole | null } | null;

  if (profileError || !profile?.operator_id) {
    return { error: 'Invalid profile context' };
  }

  return {
    userId: user.id,
    operatorId: profile.operator_id,
    role: profile.role,
  };
}

export function requirePermission(
  role: UserRole | null,
  module: PermissionModule,
  action: PermissionAction
): { ok: true } | { ok: false; error: string } {
  if (!hasPermission(role, module, action)) {
    return { ok: false, error: 'Permission denied' };
  }
  return { ok: true };
}

export async function insertAuditLog(adminDb: any, payload: AuditInsert) {
  await adminDb.from('audit_log').insert(payload);
}
