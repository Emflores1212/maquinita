import { notFound, redirect } from 'next/navigation';
import ConsumerLoginClient from '@/components/consumer/ConsumerLoginClient';
import { createServerClient } from '@/lib/supabase';

function sanitizeReturnUrl(slug: string, returnUrl: string | undefined) {
  if (!returnUrl || !returnUrl.startsWith('/')) {
    return `/${slug}/profile`;
  }

  return returnUrl;
}

export default async function ConsumerLoginPage({
  params,
  searchParams,
}: {
  params: { slug: string };
  searchParams: { returnUrl?: string };
}) {
  const supabase = createServerClient();
  const db = supabase as any;

  const { data: operatorData } = await db.from('operators').select('id, slug').eq('slug', params.slug).maybeSingle();
  const operator = operatorData as { id: string; slug: string } | null;

  if (!operator?.id) {
    notFound();
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect(sanitizeReturnUrl(params.slug, searchParams.returnUrl));
  }

  return <ConsumerLoginClient slug={params.slug} operatorId={operator.id} />;
}
