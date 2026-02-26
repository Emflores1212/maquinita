import { redirect } from 'next/navigation';
import DashboardShell from '@/components/layout/DashboardShell';
import { createServerClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { data: profileData } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .maybeSingle();

  const profile = profileData as { full_name?: string | null } | null;
  const operatorName = profile?.full_name ?? user.email?.split('@')[0] ?? 'Operator';

  return <DashboardShell operatorName={operatorName}>{children}</DashboardShell>;
}
