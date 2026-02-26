'use client';

import Link from 'next/link';
import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Activity, Clock3, Ticket, Snowflake } from 'lucide-react';
import { endDiscountAction, toggleExpirationRuleAction } from '@/app/actions/discounts';
import DiscountPerformanceSheet from '@/components/discounts/DiscountPerformanceSheet';
import NewDiscountDialog from '@/components/discounts/NewDiscountDialog';
import type {
  DiscountListItem,
  DiscountPerformanceTxRow,
  DiscountTargetOption,
  ExpirationRuleListItem,
} from '@/components/discounts/types';
import PermissionGuard from '@/components/auth/PermissionGuard';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  formatDiscountTargets,
  formatDiscountValue,
  normalizeDiscountStatus,
  normalizeDiscountType,
  resolveDiscountTab,
} from '@/lib/discounts';

function statusBadgeClass(status: string) {
  const normalized = status.toLowerCase();
  if (normalized === 'active') return 'bg-emerald-100 text-emerald-700';
  if (normalized === 'scheduled') return 'bg-sky-100 text-sky-700';
  if (normalized === 'paused') return 'bg-amber-100 text-amber-700';
  if (normalized === 'ended') return 'bg-slate-200 text-slate-700';
  return 'bg-slate-100 text-slate-700';
}

function typeIcon(type: string) {
  const normalized = normalizeDiscountType(type);
  if (normalized === 'happy_hour') return Clock3;
  if (normalized === 'coupon') return Ticket;
  if (normalized === 'expiration') return Snowflake;
  return Activity;
}

function typeLabel(type: string) {
  return normalizeDiscountType(type).replace('_', ' ');
}

export default function DiscountsPageClient({
  discounts,
  expirationRules,
  products,
  categories,
  machines,
  performanceRows,
  canWrite,
}: {
  discounts: DiscountListItem[];
  expirationRules: ExpirationRuleListItem[];
  products: DiscountTargetOption[];
  categories: DiscountTargetOption[];
  machines: DiscountTargetOption[];
  performanceRows: DiscountPerformanceTxRow[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [editingDiscount, setEditingDiscount] = useState<DiscountListItem | null>(null);
  const [performanceDiscount, setPerformanceDiscount] = useState<DiscountListItem | null>(null);
  const [isPending, startTransition] = useTransition();

  const tabs = useMemo(() => {
    const now = new Date();

    const active = discounts.filter(
      (discount) =>
        resolveDiscountTab({
          status: normalizeDiscountStatus(discount.status),
          startsAt: discount.starts_at,
          endsAt: discount.ends_at,
          endedAt: discount.ended_at,
          now,
        }) === 'active'
    );
    const scheduled = discounts.filter(
      (discount) =>
        resolveDiscountTab({
          status: normalizeDiscountStatus(discount.status),
          startsAt: discount.starts_at,
          endsAt: discount.ends_at,
          endedAt: discount.ended_at,
          now,
        }) === 'scheduled'
    );
    const past = discounts.filter(
      (discount) =>
        resolveDiscountTab({
          status: normalizeDiscountStatus(discount.status),
          startsAt: discount.starts_at,
          endsAt: discount.ends_at,
          endedAt: discount.ended_at,
          now,
        }) === 'past'
    );
    const coupons = discounts.filter((discount) => normalizeDiscountType(discount.type) === 'coupon');

    return { active, scheduled, past, coupons };
  }, [discounts]);

  const performanceByDiscountId = useMemo(() => {
    const map = new Map<string, DiscountPerformanceTxRow[]>();

    for (const row of performanceRows) {
      const existing = map.get(row.discountId) ?? [];
      existing.push(row);
      map.set(row.discountId, existing);
    }

    return map;
  }, [performanceRows]);

  const endDiscount = (discountId: string) => {
    startTransition(async () => {
      const result = await endDiscountAction({ discountId });
      if (result.ok) {
        router.refresh();
      }
    });
  };

  const toggleRule = (ruleId: string, isActive: boolean) => {
    startTransition(async () => {
      const result = await toggleExpirationRuleAction({ ruleId, isActive });
      if (result.ok) {
        router.refresh();
      }
    });
  };

  const renderCards = (rows: DiscountListItem[]) => {
    if (rows.length === 0) {
      return (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">No discounts in this tab yet.</div>
      );
    }

    return (
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        {rows.map((discount) => {
          const Icon = typeIcon(discount.type);
          const targetsLabel = formatDiscountTargets({
            productCount: discount.target_product_ids?.length ?? 0,
            categoryCount: discount.target_category_ids?.length ?? 0,
            machineCount: discount.target_machine_ids?.length ?? 0,
            fallbackAllLabel: 'All products / all machines',
          });

          return (
            <article key={discount.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="mb-2 flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-slate-100">
                    <Icon className="h-4 w-4 text-slate-700" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{discount.name}</p>
                    <p className="text-xs text-slate-500">{typeLabel(discount.type)}</p>
                  </div>
                </div>
                <span className={`rounded-full px-2 py-1 text-xs font-semibold ${statusBadgeClass(discount.status ?? 'active')}`}>
                  {discount.status ?? 'active'}
                </span>
              </div>

              <div className="space-y-1 text-sm text-slate-700">
                <p>
                  <span className="text-slate-500">Value:</span>{' '}
                  <strong>{formatDiscountValue((discount.value_type as 'percentage' | 'fixed') ?? 'percentage', Number(discount.value ?? 0))}</strong>
                </p>
                <p>
                  <span className="text-slate-500">Target:</span> {targetsLabel}
                </p>
                <p>
                  <span className="text-slate-500">Ends:</span>{' '}
                  {discount.ends_at ? new Date(discount.ends_at).toLocaleString() : 'No end date'}
                </p>
                {normalizeDiscountType(discount.type) === 'coupon' ? (
                  <p>
                    <span className="text-slate-500">Coupon:</span> <strong>{discount.coupon_code ?? '-'}</strong>
                    {discount.max_uses ? ` (${discount.uses_count ?? 0}/${discount.max_uses})` : ''}
                  </p>
                ) : null}
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setEditingDiscount(discount)}
                  className="min-h-11 rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-700"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => setPerformanceDiscount(discount)}
                  className="min-h-11 rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-700"
                >
                  Performance
                </button>
                <PermissionGuard module="discounts" action="w">
                  <button
                    type="button"
                    onClick={() => endDiscount(discount.id)}
                    disabled={isPending || discount.status === 'ended'}
                    className="min-h-11 rounded-lg bg-red-600 px-3 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    End
                  </button>
                </PermissionGuard>
              </div>
            </article>
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Discounts Engine</h1>
          <p className="text-sm text-slate-500">Create and manage standard, happy-hour, expiration, and coupon discounts.</p>
        </div>
        <PermissionGuard module="discounts" action="w">
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="inline-flex min-h-12 items-center gap-2 rounded-lg bg-[#0D2B4E] px-4 text-sm font-semibold text-white"
          >
            <Plus className="h-4 w-4" />
            New Discount
          </button>
        </PermissionGuard>
      </div>

      <Tabs defaultValue="active" className="w-full">
        <TabsList className="h-auto w-full flex-wrap justify-start gap-1 bg-transparent p-0">
          <TabsTrigger value="active">Active</TabsTrigger>
          <TabsTrigger value="scheduled">Scheduled</TabsTrigger>
          <TabsTrigger value="past">Past</TabsTrigger>
          <TabsTrigger value="expiration_rules">Expiration Rules</TabsTrigger>
          <TabsTrigger value="coupon_codes">Coupon Codes</TabsTrigger>
        </TabsList>

        <TabsContent value="active">{renderCards(tabs.active)}</TabsContent>
        <TabsContent value="scheduled">{renderCards(tabs.scheduled)}</TabsContent>
        <TabsContent value="past">{renderCards(tabs.past)}</TabsContent>

        <TabsContent value="expiration_rules">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-slate-600">Rules that auto-apply discount tiers by item expiration date.</p>
            <Link
              href="/discounts/expiration"
              className="inline-flex min-h-11 items-center rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-700"
            >
              Open Builder
            </Link>
          </div>

          <div className="space-y-3">
            {expirationRules.length === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">No expiration rules created yet.</div>
            ) : (
              expirationRules.map((rule) => (
                <article key={rule.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{rule.name ?? 'Expiration Rule'}</p>
                      <p className="text-xs text-slate-500">
                        Targets: {rule.target_product_ids?.length ?? 0} products · {rule.target_category_ids?.length ?? 0} categories
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleRule(rule.id, !(rule.is_active ?? false))}
                      disabled={!canWrite || isPending}
                      className={`min-h-11 rounded-lg px-3 text-sm font-semibold ${
                        rule.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-700'
                      }`}
                    >
                      {rule.is_active ? 'Active' : 'Inactive'}
                    </button>
                  </div>
                </article>
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="coupon_codes">{renderCards(tabs.coupons)}</TabsContent>
      </Tabs>

      <NewDiscountDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        mode="create"
        products={products}
        categories={categories}
        machines={machines}
      />

      <NewDiscountDialog
        open={Boolean(editingDiscount)}
        onOpenChange={(value) => {
          if (!value) {
            setEditingDiscount(null);
          }
        }}
        mode="edit"
        discount={editingDiscount}
        products={products}
        categories={categories}
        machines={machines}
      />

      <DiscountPerformanceSheet
        discount={performanceDiscount}
        rows={performanceDiscount ? performanceByDiscountId.get(performanceDiscount.id) ?? [] : []}
        open={Boolean(performanceDiscount)}
        canWrite={canWrite}
        onClose={() => setPerformanceDiscount(null)}
        onEnded={() => {
          setPerformanceDiscount(null);
          router.refresh();
        }}
      />
    </div>
  );
}
