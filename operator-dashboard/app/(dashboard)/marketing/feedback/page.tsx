import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import FeedbackPageClient from '@/components/marketing/FeedbackPageClient';
import { hasPermission, type UserRole } from '@/lib/permissions';
import { createServerClient } from '@/lib/supabase';

type SearchParamValue = string | string[] | undefined;

function readSingle(value: SearchParamValue) {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export default async function MarketingFeedbackPage({
  searchParams,
}: {
  searchParams: Record<string, SearchParamValue>;
}) {
  const t = await getTranslations('marketing.feedback');
  const supabase = createServerClient();
  const db = supabase;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login?returnUrl=/marketing/feedback');
  }

  const { data: profileData } = await db.from('profiles').select('operator_id, role').eq('id', user.id).maybeSingle();
  const profile = profileData as { operator_id: string | null; role: UserRole | null } | null;

  if (!profile?.operator_id || !hasPermission(profile.role, 'marketing', 'r')) {
    redirect('/dashboard');
  }

  const machineFilter = readSingle(searchParams.machineId);
  const ratingFilter = readSingle(searchParams.rating);
  const fromDate = readSingle(searchParams.from);
  const toDate = readSingle(searchParams.to);

  let feedbackQuery = db
    .from('consumer_feedback')
    .select('id, machine_id, product_id, rating, comment, operator_reply, created_at, consumer_profiles(phone), machines(name), products(name)')
    .eq('operator_id', profile.operator_id)
    .order('created_at', { ascending: false })
    .limit(300);

  if (machineFilter && machineFilter !== 'all') {
    feedbackQuery = feedbackQuery.eq('machine_id', machineFilter);
  }
  if (ratingFilter && ratingFilter !== 'all') {
    feedbackQuery = feedbackQuery.eq('rating', Number(ratingFilter));
  }
  if (fromDate) {
    feedbackQuery = feedbackQuery.gte('created_at', `${fromDate}T00:00:00.000Z`);
  }
  if (toDate) {
    feedbackQuery = feedbackQuery.lte('created_at', `${toDate}T23:59:59.999Z`);
  }

  const [feedbackData, machinesData] = await Promise.all([
    feedbackQuery,
    db.from('machines').select('id, name').eq('operator_id', profile.operator_id).neq('status', 'archived').order('name', { ascending: true }),
  ]);

  const rows =
    ((feedbackData.data as Array<{
      id: string;
      created_at: string | null;
      rating: number | null;
      comment: string | null;
      operator_reply: string | null;
      machine_id: string | null;
      product_id: string | null;
      consumer_profiles: { phone?: string | null } | null;
      machines: { name?: string | null } | null;
      products: { name?: string | null } | null;
    }> | null) ?? []).map((row) => ({
      id: row.id,
      createdAt: row.created_at ?? new Date().toISOString(),
      consumerPhone: row.consumer_profiles?.phone ?? null,
      machineName: row.machines?.name ?? '-',
      machineId: row.machine_id,
      productName: row.products?.name ?? '-',
      rating: Number(row.rating ?? 0),
      comment: row.comment,
      operatorReply: row.operator_reply,
    }));

  const machineRatings = new Map<string, { sum: number; count: number }>();
  const productRatings = new Map<string, { sum: number; count: number }>();

  for (const row of rows) {
    if (row.machineName && row.machineName !== '-') {
      const current = machineRatings.get(row.machineName) ?? { sum: 0, count: 0 };
      current.sum += row.rating;
      current.count += 1;
      machineRatings.set(row.machineName, current);
    }
    if (row.productName && row.productName !== '-') {
      const current = productRatings.get(row.productName) ?? { sum: 0, count: 0 };
      current.sum += row.rating;
      current.count += 1;
      productRatings.set(row.productName, current);
    }
  }

  const machineSummary = [...machineRatings.entries()]
    .map(([label, stats]) => ({ label, value: stats.sum / Math.max(1, stats.count) }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  const productSummary = [...productRatings.entries()]
    .map(([label, stats]) => ({ label, value: stats.sum / Math.max(1, stats.count) }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  const machineOptions = ((machinesData.data as Array<{ id: string; name: string }> | null) ?? []).map((machine) => ({
    id: machine.id,
    name: machine.name,
  }));

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">{t('pageTitle')}</h1>
        <p className="text-sm text-slate-600">{t('pageDescription')}</p>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <form className="grid gap-3 md:grid-cols-5">
          <label className="block text-sm font-medium text-slate-700">
            {t('filterMachine')}
            <select name="machineId" defaultValue={machineFilter ?? 'all'} className="mt-1 h-12 w-full rounded-lg border border-slate-300 px-3 text-sm">
              <option value="all">{t('allMachines')}</option>
              {machineOptions.map((machine) => (
                <option key={machine.id} value={machine.id}>
                  {machine.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm font-medium text-slate-700">
            {t('filterRating')}
            <select name="rating" defaultValue={ratingFilter ?? 'all'} className="mt-1 h-12 w-full rounded-lg border border-slate-300 px-3 text-sm">
              <option value="all">{t('allRatings')}</option>
              <option value="5">5</option>
              <option value="4">4</option>
              <option value="3">3</option>
              <option value="2">2</option>
              <option value="1">1</option>
            </select>
          </label>

          <label className="block text-sm font-medium text-slate-700">
            {t('filterFrom')}
            <input type="date" name="from" defaultValue={fromDate ?? ''} className="mt-1 h-12 w-full rounded-lg border border-slate-300 px-3 text-sm" />
          </label>

          <label className="block text-sm font-medium text-slate-700">
            {t('filterTo')}
            <input type="date" name="to" defaultValue={toDate ?? ''} className="mt-1 h-12 w-full rounded-lg border border-slate-300 px-3 text-sm" />
          </label>

          <div className="flex items-end gap-2">
            <button type="submit" className="inline-flex h-12 items-center justify-center rounded-lg bg-[#0D2B4E] px-4 text-sm font-semibold text-white">
              {t('applyFilters')}
            </button>
            <Link
              href="/marketing/feedback"
              className="inline-flex h-12 items-center justify-center rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700"
            >
              {t('clearFilters')}
            </Link>
          </div>
        </form>
      </section>

      <FeedbackPageClient rows={rows} machineSummary={machineSummary} productSummary={productSummary} />
    </div>
  );
}
