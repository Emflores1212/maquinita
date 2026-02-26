import { redirect } from 'next/navigation';
import MachineQrPrint from '@/components/machines/MachineQrPrint';
import { createServerClient } from '@/lib/supabase';

export default async function MachineQrPage({ params }: { params: { id: string } }) {
  const supabase = createServerClient();
  const db = supabase;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?returnUrl=/machines/${params.id}/qr`);
  }

  const { data: profileData } = await db.from('profiles').select('operator_id').eq('id', user.id).maybeSingle();
  const operatorId = (profileData as { operator_id: string | null } | null)?.operator_id;

  if (!operatorId) {
    redirect('/machines');
  }

  const { data: machineData } = await db
    .from('machines')
    .select('id, name, mid, address')
    .eq('id', params.id)
    .eq('operator_id', operatorId)
    .maybeSingle();

  if (!machineData) {
    redirect('/machines');
  }

  const machine = machineData as { name: string; mid: string; address: string | null };

  return <MachineQrPrint name={machine.name} mid={machine.mid} address={machine.address} />;
}
