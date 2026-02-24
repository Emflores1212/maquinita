import { redirect } from 'next/navigation';
import MachineForm from '@/components/machines/MachineForm';
import { hasPermission } from '@/lib/permissions';
import { createServerClient } from '@/lib/supabase';

export default async function NewMachinePage() {
  const supabase = createServerClient();
  const db = supabase as any;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login?returnUrl=/machines/new');
  }

  const { data: profileData } = await db.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const role = (profileData as { role: 'admin' | 'manager' | 'driver' | 'viewer' | null } | null)?.role;

  if (!hasPermission(role, 'machines', 'w')) {
    redirect('/machines');
  }

  return <MachineForm mode="create" />;
}
