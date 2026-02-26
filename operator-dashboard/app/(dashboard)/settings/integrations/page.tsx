import Link from 'next/link';
import { redirect } from 'next/navigation';
import AccessDenied from '@/components/auth/AccessDenied';
import { hasPermission, type UserRole } from '@/lib/permissions';
import { createServerClient } from '@/lib/supabase';

type IntegrationCard = {
  id: string;
  label: string;
  description: string;
  status: 'connected' | 'not_connected' | 'enterprise';
  actionLabel: string;
  actionHref?: string;
  disabled?: boolean;
};

function statusBadge(status: IntegrationCard['status']) {
  if (status === 'connected') return 'bg-emerald-100 text-emerald-700';
  if (status === 'enterprise') return 'bg-amber-100 text-amber-700';
  return 'bg-slate-200 text-slate-700';
}

function statusLabel(status: IntegrationCard['status']) {
  if (status === 'connected') return 'Connected';
  if (status === 'enterprise') return 'Enterprise';
  return 'Not Connected';
}

export default async function IntegrationsSettingsPage() {
  const supabase = createServerClient();
  const db = supabase;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login?returnUrl=/settings/integrations');
  }

  const { data: profileData } = await db.from('profiles').select('operator_id, role').eq('id', user.id).maybeSingle();
  const profile = profileData as { operator_id: string | null; role: UserRole | null } | null;

  if (!profile?.operator_id) {
    redirect('/dashboard');
  }

  if (!hasPermission(profile.role, 'settings', 'r')) {
    return <AccessDenied />;
  }

  const canEdit = hasPermission(profile.role, 'settings', 'w');

  const { data: operatorData } = await db
    .from('operators')
    .select('stripe_account_id')
    .eq('id', profile.operator_id)
    .maybeSingle();

  const stripeConnected = Boolean((operatorData as { stripe_account_id?: string | null } | null)?.stripe_account_id);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';

  const cards: IntegrationCard[] = [
    {
      id: 'quickbooks',
      label: 'QuickBooks Online',
      description: 'Daily transaction sync and payout reconciliation.',
      status: stripeConnected ? 'connected' : 'not_connected',
      actionLabel: stripeConnected ? 'Manage' : 'Connect via OAuth',
      actionHref: '/financials/banking',
    },
    {
      id: 'zapier',
      label: 'Zapier',
      description: 'Use webhooks to trigger Zaps on new transactions and alerts.',
      status: 'connected',
      actionLabel: 'Copy Webhook URL',
      actionHref: `${appUrl}/api/v1/transactions`,
    },
    {
      id: 'sheets',
      label: 'Google Sheets',
      description: 'Daily rollups synced to selected sheet for external reporting.',
      status: 'not_connected',
      actionLabel: 'Connect via OAuth',
      disabled: true,
    },
    {
      id: 'campus',
      label: 'Campus Cards (CBORD/Blackboard)',
      description: 'Enterprise card integrations for universities and campuses.',
      status: 'enterprise',
      actionLabel: 'Contact Sales',
      actionHref: 'mailto:sales@maquinita.app?subject=Campus%20Cards%20Integration',
    },
  ];

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h1 className="text-lg font-bold text-slate-900">Integration Hub</h1>
        <p className="mt-1 text-sm text-slate-600">Connect external systems and automate data flow for enterprise clients.</p>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        {cards.map((card) => {
          const action = (
            <span
              className={`inline-flex min-h-12 items-center justify-center rounded-lg px-4 text-sm font-semibold ${
                card.disabled || !canEdit
                  ? 'cursor-not-allowed bg-slate-200 text-slate-500'
                  : 'bg-[#0D2B4E] text-white'
              }`}
            >
              {card.actionLabel}
            </span>
          );

          return (
            <article key={card.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-slate-100 text-lg font-black text-slate-700">
                    {card.label
                      .split(' ')
                      .slice(0, 2)
                      .map((part) => part[0])
                      .join('')
                      .toUpperCase()}
                  </div>
                  <div>
                    <h2 className="text-base font-semibold text-slate-900">{card.label}</h2>
                    <p className="mt-1 text-sm text-slate-600">{card.description}</p>
                  </div>
                </div>
                <span className={`rounded-full px-2 py-1 text-xs font-semibold ${statusBadge(card.status)}`}>{statusLabel(card.status)}</span>
              </div>

              <div className="mt-4 flex items-center justify-between">
                <p className="text-xs font-semibold text-slate-500">Last sync: -</p>
                {card.actionHref && !card.disabled && canEdit ? (
                  <Link href={card.actionHref} className="inline-flex min-h-12 items-center justify-center rounded-lg bg-[#0D2B4E] px-4 text-sm font-semibold text-white">
                    {card.actionLabel}
                  </Link>
                ) : (
                  action
                )}
              </div>
            </article>
          );
        })}
      </section>
    </div>
  );
}
