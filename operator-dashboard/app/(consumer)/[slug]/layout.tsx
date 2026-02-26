import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import ConsumerShell from '@/components/consumer/ConsumerShell';
import { normalizeBranding } from '@/lib/consumer';
import { createServerClient } from '@/lib/supabase';

async function getOperator(slug: string) {
  const supabase = createServerClient();
  const { data } = await supabase.from('operators').select('id, slug, name, branding').eq('slug', slug).maybeSingle();

  return (data as { id: string; slug: string; name: string; branding: Record<string, unknown> | null } | null) ?? null;
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const operator = await getOperator(params.slug);
  if (!operator?.id) {
    return {
      title: 'Maquinita',
      manifest: '/manifest.webmanifest',
    };
  }

  const branding = normalizeBranding(operator.branding as any);

  return {
    title: `${operator.name} | Maquinita`,
    manifest: '/manifest.webmanifest',
    themeColor: branding.primaryColor,
  };
}

export default async function ConsumerOperatorLayout({
  params,
  children,
}: {
  params: { slug: string };
  children: React.ReactNode;
}) {
  const operator = await getOperator(params.slug);
  if (!operator?.id) {
    notFound();
  }

  const branding = normalizeBranding(operator.branding as any);

  return (
    <ConsumerShell
      operator={{
        id: operator.id,
        slug: operator.slug,
        name: operator.name,
        logoUrl: branding.logoUrl,
        primaryColor: branding.primaryColor,
      }}
    >
      {children}
    </ConsumerShell>
  );
}
