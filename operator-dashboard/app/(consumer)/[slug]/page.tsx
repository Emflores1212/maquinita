import { notFound } from 'next/navigation';
import ConsumerMapScreen from '@/components/consumer/ConsumerMapScreen';
import { createServerClient } from '@/lib/supabase';

export default async function ConsumerMapPage({ params }: { params: { slug: string } }) {
  const supabase = createServerClient();

  const { data: operatorData } = await supabase
    .from('operators')
    .select('id, slug')
    .eq('slug', params.slug)
    .maybeSingle();

  const operator = operatorData as { id: string; slug: string } | null;
  if (!operator?.id) {
    notFound();
  }

  const { data: machinesData } = await supabase
    .from('machines')
    .select('id, name, status, location_name, address, lat, lng')
    .eq('operator_id', operator.id)
    .neq('status', 'archived')
    .order('name', { ascending: true });

  const machines =
    ((machinesData as Array<{
      id: string;
      name: string;
      status: string | null;
      location_name: string | null;
      address: string | null;
      lat: number | null;
      lng: number | null;
    }> | null) ?? []).map((machine) => ({
      id: machine.id,
      name: machine.name,
      status: machine.status,
      locationName: machine.location_name,
      address: machine.address,
      lat: machine.lat,
      lng: machine.lng,
    }));

  return <ConsumerMapScreen slug={params.slug} machines={machines} />;
}
