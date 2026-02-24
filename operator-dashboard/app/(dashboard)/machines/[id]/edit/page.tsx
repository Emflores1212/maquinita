import { redirect } from 'next/navigation';
import MachineForm from '@/components/machines/MachineForm';
import { hasPermission } from '@/lib/permissions';
import { createServerClient } from '@/lib/supabase';

export default async function EditMachinePage({ params }: { params: { id: string } }) {
  const supabase = createServerClient();
  const db = supabase as any;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?returnUrl=/machines/${params.id}/edit`);
  }

  const { data: profileData } = await db.from('profiles').select('operator_id, role').eq('id', user.id).maybeSingle();
  const profile = profileData as { operator_id: string | null; role: 'admin' | 'manager' | 'driver' | 'viewer' | null } | null;

  if (!profile?.operator_id || !hasPermission(profile.role, 'machines', 'w')) {
    redirect('/machines');
  }

  const { data: machineData } = await db
    .from('machines')
    .select('*')
    .eq('id', params.id)
    .eq('operator_id', profile.operator_id)
    .maybeSingle();

  if (!machineData) {
    redirect('/machines');
  }

  const machine = machineData as {
    id: string;
    name: string;
    type: 'fridge' | 'pantry' | 'freezer';
    location_name: string | null;
    address: string | null;
    lat: number | null;
    lng: number | null;
    notes: string | null;
    mid: string;
  };

  return (
    <MachineForm
      mode="edit"
      machineId={machine.id}
      defaultValues={{
        name: machine.name,
        type: machine.type,
        locationName: machine.location_name ?? '',
        address: machine.address ?? '',
        lat: machine.lat,
        lng: machine.lng,
        notes: machine.notes ?? '',
        mid: machine.mid,
      }}
    />
  );
}
