'use client';

import { hasPermission, type PermissionAction, type PermissionModule } from '@/lib/permissions';
import { useAuth } from '@/components/providers/AuthProvider';

export function usePermission(module: PermissionModule, action: PermissionAction): boolean {
  const { role } = useAuth();

  return hasPermission(role, module, action);
}
