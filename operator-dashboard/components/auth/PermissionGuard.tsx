'use client';

import type { ReactNode } from 'react';
import AccessDenied from '@/components/auth/AccessDenied';
import { usePermission } from '@/hooks/usePermission';
import type { PermissionAction, PermissionModule } from '@/lib/permissions';

type PermissionGuardProps = {
  module: PermissionModule;
  action: PermissionAction;
  children: ReactNode;
  fallback?: ReactNode;
};

export default function PermissionGuard({ module, action, children, fallback = null }: PermissionGuardProps) {
  const permitted = usePermission(module, action);

  if (!permitted) {
    return fallback;
  }

  return <>{children}</>;
}

export function PermissionGuardWithDenied({ module, action, children }: Omit<PermissionGuardProps, 'fallback'>) {
  return (
    <PermissionGuard module={module} action={action} fallback={<AccessDenied />}>
      {children}
    </PermissionGuard>
  );
}
