import type { Database } from '@/lib/types';

export type UserRole = 'admin' | 'manager' | 'driver' | 'viewer';
export type PermissionAction = 'r' | 'w';
export type PermissionModule =
  | 'dashboard'
  | 'machines'
  | 'products'
  | 'inventory'
  | 'restock'
  | 'transactions'
  | 'financials'
  | 'discounts'
  | 'analytics'
  | 'settings'
  | 'users';

export const PERMISSIONS: Record<UserRole, Partial<Record<PermissionModule, PermissionAction[]>>> = {
  admin: {
    dashboard: ['r', 'w'],
    machines: ['r', 'w'],
    products: ['r', 'w'],
    inventory: ['r', 'w'],
    restock: ['r', 'w'],
    transactions: ['r', 'w'],
    financials: ['r', 'w'],
    discounts: ['r', 'w'],
    analytics: ['r'],
    settings: ['r', 'w'],
    users: ['r', 'w'],
  },
  manager: {
    dashboard: ['r'],
    machines: ['r', 'w'],
    products: ['r', 'w'],
    inventory: ['r', 'w'],
    restock: ['r', 'w'],
    transactions: ['r', 'w'],
    financials: ['r'],
    discounts: ['r', 'w'],
    analytics: ['r'],
  },
  driver: {
    restock: ['r', 'w'],
    machines: ['r'],
  },
  viewer: {
    dashboard: ['r'],
    machines: ['r'],
    products: ['r'],
    inventory: ['r'],
    transactions: ['r'],
    discounts: ['r'],
    analytics: ['r'],
  },
};

export function hasPermission(role: UserRole | null | undefined, module: PermissionModule, action: PermissionAction): boolean {
  if (!role) {
    return false;
  }

  const modulePermissions = PERMISSIONS[role][module];
  if (!modulePermissions) {
    return false;
  }

  return modulePermissions.includes(action);
}

export function getDriverAssignedMachineIds(profile: Database['public']['Tables']['profiles']['Row'] | null): string[] | null {
  if (!profile || profile.role !== 'driver') {
    return null;
  }

  return profile.assigned_machine_ids ?? [];
}

export function applyDriverMachineFilter<T extends { in: (column: string, values: string[]) => T }>(
  query: T,
  profile: Database['public']['Tables']['profiles']['Row'] | null
): T {
  const assignedMachineIds = getDriverAssignedMachineIds(profile);

  if (!assignedMachineIds) {
    return query;
  }

  if (assignedMachineIds.length === 0) {
    return query.in('id', ['00000000-0000-0000-0000-000000000000']);
  }

  return query.in('id', assignedMachineIds);
}
