import type { MachineListItem } from '@/components/machines/types';

export function statusRank(status: string | null): number {
  const normalized = (status ?? '').toLowerCase();
  if (normalized.includes('error') || normalized === 'offline') return 0;
  if (normalized.includes('warning')) return 1;
  if (normalized === 'online') return 2;
  return 3;
}

export function statusColor(status: string | null): string {
  const normalized = (status ?? '').toLowerCase();
  if (normalized.includes('error') || normalized === 'offline') return 'text-red-600 bg-red-100';
  if (normalized.includes('warning')) return 'text-amber-700 bg-amber-100';
  if (normalized === 'online') return 'text-emerald-700 bg-emerald-100';
  return 'text-slate-700 bg-slate-100';
}

export function statusDot(status: string | null): string {
  const normalized = (status ?? '').toLowerCase();
  if (normalized.includes('error') || normalized === 'offline') return '🔴';
  if (normalized.includes('warning')) return '🟠';
  if (normalized === 'online') return '🟢';
  return '⚪';
}

export function sortMachines(machines: MachineListItem[], sortBy: 'problems' | 'name' | 'revenue') {
  return [...machines].sort((a, b) => {
    if (sortBy === 'name') {
      return a.name.localeCompare(b.name);
    }

    if (sortBy === 'revenue') {
      if (b.todayRevenue !== a.todayRevenue) {
        return b.todayRevenue - a.todayRevenue;
      }
      return a.name.localeCompare(b.name);
    }

    const rankDiff = statusRank(a.status) - statusRank(b.status);
    if (rankDiff !== 0) {
      return rankDiff;
    }

    return a.name.localeCompare(b.name);
  });
}
