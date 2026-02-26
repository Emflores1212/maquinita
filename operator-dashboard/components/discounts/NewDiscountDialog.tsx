'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { BadgePercent, Clock3, Ticket, Snowflake, Plus, Trash2 } from 'lucide-react';
import { createDiscountAction, updateDiscountAction } from '@/app/actions/discounts';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { DiscountListItem, DiscountTargetOption } from '@/components/discounts/types';

type DiscountType = 'standard' | 'happy_hour' | 'expiration' | 'coupon';
type ValueType = 'percentage' | 'fixed';

type TierInput = {
  days_remaining: number;
  discount_pct: number;
};

type FormState = {
  name: string;
  type: DiscountType;
  valueType: ValueType;
  value: number;
  startsAt: string;
  endsAt: string;
  couponCode: string;
  maxUses: string;
  scheduleDays: Array<'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat'>;
  scheduleFrom: string;
  scheduleTo: string;
  targetProductIds: string[];
  targetCategoryIds: string[];
  targetMachineIds: string[];
  expirationTiers: TierInput[];
};

const DAY_OPTIONS: Array<{ value: FormState['scheduleDays'][number]; label: string }> = [
  { value: 'sun', label: 'Sun' },
  { value: 'mon', label: 'Mon' },
  { value: 'tue', label: 'Tue' },
  { value: 'wed', label: 'Wed' },
  { value: 'thu', label: 'Thu' },
  { value: 'fri', label: 'Fri' },
  { value: 'sat', label: 'Sat' },
];

const TYPE_CARDS: Array<{
  value: DiscountType;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    value: 'standard',
    title: 'Standard',
    description: 'Always-on or date-range discount.',
    icon: BadgePercent,
  },
  {
    value: 'happy_hour',
    title: 'Happy Hour',
    description: 'Active only during selected time windows.',
    icon: Clock3,
  },
  {
    value: 'expiration',
    title: 'Expiration',
    description: 'Auto-reduces price as items approach expiry.',
    icon: Snowflake,
  },
  {
    value: 'coupon',
    title: 'Coupon',
    description: 'Code-based discount entered at machine.',
    icon: Ticket,
  },
];

function localDateTimeInputValue(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  const hour = `${date.getHours()}`.padStart(2, '0');
  const minute = `${date.getMinutes()}`.padStart(2, '0');
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

function parseSchedule(value: unknown): Pick<FormState, 'scheduleDays' | 'scheduleFrom' | 'scheduleTo'> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {
      scheduleDays: ['mon', 'tue', 'wed', 'thu', 'fri'],
      scheduleFrom: '11:00',
      scheduleTo: '13:00',
    };
  }

  const source = value as Record<string, unknown>;
  const scheduleDays: FormState['scheduleDays'] = Array.isArray(source.days)
    ? (source.days
        .map((item) => String(item).toLowerCase())
        .filter((item): item is FormState['scheduleDays'][number] =>
          ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].includes(item)
        ) as FormState['scheduleDays'])
    : ['mon', 'tue', 'wed', 'thu', 'fri'];

  return {
    scheduleDays: scheduleDays.length > 0 ? scheduleDays : ['mon', 'tue', 'wed', 'thu', 'fri'],
    scheduleFrom: typeof source.from === 'string' && source.from ? source.from : '11:00',
    scheduleTo: typeof source.to === 'string' && source.to ? source.to : '13:00',
  };
}

function defaultFormState(discount?: DiscountListItem | null): FormState {
  if (!discount) {
    return {
      name: '',
      type: 'standard',
      valueType: 'percentage',
      value: 10,
      startsAt: '',
      endsAt: '',
      couponCode: '',
      maxUses: '',
      scheduleDays: ['mon', 'tue', 'wed', 'thu', 'fri'],
      scheduleFrom: '11:00',
      scheduleTo: '13:00',
      targetProductIds: [],
      targetCategoryIds: [],
      targetMachineIds: [],
      expirationTiers: [
        { days_remaining: 3, discount_pct: 20 },
        { days_remaining: 1, discount_pct: 40 },
        { days_remaining: 0, discount_pct: 60 },
      ],
    };
  }

  const schedule = parseSchedule(discount.schedule);
  return {
    name: discount.name,
    type: (discount.type as DiscountType) ?? 'standard',
    valueType: (discount.value_type as ValueType) ?? 'percentage',
    value: Number(discount.value ?? 0),
    startsAt: localDateTimeInputValue(discount.starts_at),
    endsAt: localDateTimeInputValue(discount.ends_at),
    couponCode: discount.coupon_code ?? '',
    maxUses: discount.max_uses ? String(discount.max_uses) : '',
    scheduleDays: schedule.scheduleDays,
    scheduleFrom: schedule.scheduleFrom,
    scheduleTo: schedule.scheduleTo,
    targetProductIds: discount.target_product_ids ?? [],
    targetCategoryIds: discount.target_category_ids ?? [],
    targetMachineIds: discount.target_machine_ids ?? [],
    expirationTiers: [
      { days_remaining: 3, discount_pct: 20 },
      { days_remaining: 1, discount_pct: 40 },
      { days_remaining: 0, discount_pct: 60 },
    ],
  };
}

function toIso(value: string): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function MultiSelectChecklist({
  title,
  options,
  selected,
  onToggle,
}: {
  title: string;
  options: DiscountTargetOption[];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <div className="space-y-2 rounded-lg border border-slate-200 p-3">
      <p className="text-sm font-semibold text-slate-800">{title}</p>
      <div className="max-h-44 space-y-1 overflow-auto pr-1">
        {options.length === 0 ? <p className="text-sm text-slate-500">No options</p> : null}
        {options.map((option) => (
          <label key={option.id} className="flex min-h-12 cursor-pointer items-center gap-3 rounded-md px-2 py-2 hover:bg-slate-50">
            <input type="checkbox" checked={selected.includes(option.id)} onChange={() => onToggle(option.id)} className="h-4 w-4" />
            <span className="text-sm text-slate-700">{option.name}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

export default function NewDiscountDialog({
  open,
  onOpenChange,
  mode,
  discount,
  products,
  categories,
  machines,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'create' | 'edit';
  discount?: DiscountListItem | null;
  products: DiscountTargetOption[];
  categories: DiscountTargetOption[];
  machines: DiscountTargetOption[];
}) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<FormState>(() => defaultFormState(discount));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const title = mode === 'create' ? 'New Discount' : 'Edit Discount';

  const reviewRows = useMemo(
    () => [
      { label: 'Name', value: form.name || '-' },
      { label: 'Type', value: form.type },
      { label: 'Value', value: form.valueType === 'percentage' ? `${form.value}%` : `$${form.value.toFixed(2)}` },
      { label: 'Products', value: form.targetProductIds.length > 0 ? `${form.targetProductIds.length}` : 'All' },
      { label: 'Categories', value: form.targetCategoryIds.length > 0 ? `${form.targetCategoryIds.length}` : 'All' },
      { label: 'Machines', value: form.targetMachineIds.length > 0 ? `${form.targetMachineIds.length}` : 'All' },
    ],
    [form]
  );

  const resetForOpen = (nextDiscount?: DiscountListItem | null) => {
    setForm(defaultFormState(nextDiscount));
    setStep(1);
    setError(null);
  };

  useEffect(() => {
    if (open) {
      resetForOpen(discount);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, discount?.id]);

  const onDialogOpenChange = (nextOpen: boolean) => {
    onOpenChange(nextOpen);
  };

  const toggleId = (value: string, current: string[]): string[] => {
    if (current.includes(value)) {
      return current.filter((id) => id !== value);
    }
    return [...current, value];
  };

  const submit = () => {
    setError(null);

    if (!form.name.trim()) {
      setError('Name is required');
      setStep(2);
      return;
    }

    if (form.type === 'coupon' && !form.couponCode.trim()) {
      setError('Coupon code is required');
      setStep(2);
      return;
    }

    if (form.type === 'happy_hour' && form.scheduleDays.length === 0) {
      setError('Select at least one day for happy hour');
      setStep(2);
      return;
    }

    startTransition(async () => {
      const payload = {
        name: form.name,
        type: form.type,
        valueType: form.valueType,
        value: Number(form.value),
        targetProductIds: form.targetProductIds,
        targetCategoryIds: form.targetCategoryIds,
        targetMachineIds: form.targetMachineIds,
        startsAt: toIso(form.startsAt),
        endsAt: toIso(form.endsAt),
        schedule:
          form.type === 'happy_hour'
            ? {
                days: form.scheduleDays,
                from: form.scheduleFrom,
                to: form.scheduleTo,
              }
            : null,
        couponCode: form.type === 'coupon' ? form.couponCode : null,
        maxUses: form.type === 'coupon' && form.maxUses.trim() ? Number(form.maxUses) : null,
        expirationTiers: form.type === 'expiration' ? form.expirationTiers : undefined,
      };

      const result =
        mode === 'create'
          ? await createDiscountAction(payload)
          : await updateDiscountAction({
              ...payload,
              discountId: discount?.id ?? '',
            });

      if (!result.ok) {
        setError(result.error ?? 'Failed to save discount');
        return;
      }

      onOpenChange(false);
      router.refresh();
    });
  };

  const canContinueFromStep2 =
    form.name.trim().length > 0 &&
    form.value > 0 &&
    (form.type !== 'coupon' || form.couponCode.trim().length > 0) &&
    (form.type !== 'happy_hour' || form.scheduleDays.length > 0);

  return (
    <Dialog open={open} onOpenChange={onDialogOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Step {step} of 4</DialogDescription>
        </DialogHeader>

        <div className="mt-1 flex items-center gap-2 text-xs">
          {[1, 2, 3, 4].map((value) => (
            <div key={value} className={`h-1.5 flex-1 rounded-full ${value <= step ? 'bg-[#0D2B4E]' : 'bg-slate-200'}`} />
          ))}
        </div>

        {step === 1 ? (
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {TYPE_CARDS.map((card) => (
              <button
                key={card.value}
                type="button"
                onClick={() => setForm((current) => ({ ...current, type: card.value }))}
                className={`min-h-24 rounded-lg border p-4 text-left transition ${
                  form.type === card.value ? 'border-[#0D2B4E] bg-[#0D2B4E]/5' : 'border-slate-200 hover:bg-slate-50'
                }`}
              >
                <div className="mb-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-slate-100">
                  <card.icon className="h-4 w-4 text-slate-700" />
                </div>
                <p className="text-sm font-semibold text-slate-900">{card.title}</p>
                <p className="mt-1 text-xs text-slate-500">{card.description}</p>
              </button>
            ))}
          </div>
        ) : null}

        {step === 2 ? (
          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="space-y-1">
                <span className="text-sm font-medium text-slate-700">Name</span>
                <input
                  className="min-h-12 w-full rounded-lg border border-slate-200 px-3"
                  value={form.name}
                  onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                />
              </label>

              <label className="space-y-1">
                <span className="text-sm font-medium text-slate-700">Value Type</span>
                <select
                  className="min-h-12 w-full rounded-lg border border-slate-200 px-3"
                  value={form.valueType}
                  onChange={(event) => setForm((current) => ({ ...current, valueType: event.target.value as ValueType }))}
                >
                  <option value="percentage">Percentage</option>
                  <option value="fixed">Fixed</option>
                </select>
              </label>

              <label className="space-y-1">
                <span className="text-sm font-medium text-slate-700">Value</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="min-h-12 w-full rounded-lg border border-slate-200 px-3"
                  value={Number.isFinite(form.value) ? form.value : ''}
                  onChange={(event) => setForm((current) => ({ ...current, value: Number(event.target.value) }))}
                />
              </label>

              <label className="space-y-1">
                <span className="text-sm font-medium text-slate-700">Starts At</span>
                <input
                  type="datetime-local"
                  className="min-h-12 w-full rounded-lg border border-slate-200 px-3"
                  value={form.startsAt}
                  onChange={(event) => setForm((current) => ({ ...current, startsAt: event.target.value }))}
                />
              </label>

              <label className="space-y-1 sm:col-span-2">
                <span className="text-sm font-medium text-slate-700">Ends At</span>
                <input
                  type="datetime-local"
                  className="min-h-12 w-full rounded-lg border border-slate-200 px-3"
                  value={form.endsAt}
                  onChange={(event) => setForm((current) => ({ ...current, endsAt: event.target.value }))}
                />
              </label>
            </div>

            {form.type === 'coupon' ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="space-y-1">
                  <span className="text-sm font-medium text-slate-700">Coupon Code</span>
                  <input
                    className="min-h-12 w-full rounded-lg border border-slate-200 px-3 uppercase"
                    value={form.couponCode}
                    onChange={(event) => setForm((current) => ({ ...current, couponCode: event.target.value.toUpperCase() }))}
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-sm font-medium text-slate-700">Max Uses</span>
                  <input
                    type="number"
                    min="1"
                    className="min-h-12 w-full rounded-lg border border-slate-200 px-3"
                    value={form.maxUses}
                    onChange={(event) => setForm((current) => ({ ...current, maxUses: event.target.value }))}
                  />
                </label>
              </div>
            ) : null}

            {form.type === 'happy_hour' ? (
              <div className="space-y-3 rounded-lg border border-slate-200 p-3">
                <p className="text-sm font-semibold text-slate-800">Schedule</p>
                <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
                  {DAY_OPTIONS.map((day) => (
                    <button
                      key={day.value}
                      type="button"
                      onClick={() =>
                        setForm((current) => ({
                          ...current,
                          scheduleDays: current.scheduleDays.includes(day.value)
                            ? current.scheduleDays.filter((item) => item !== day.value)
                            : [...current.scheduleDays, day.value],
                        }))
                      }
                      className={`min-h-12 rounded-lg border text-xs font-semibold ${
                        form.scheduleDays.includes(day.value) ? 'border-[#0D2B4E] bg-[#0D2B4E] text-white' : 'border-slate-200 text-slate-700'
                      }`}
                    >
                      {day.label}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="space-y-1">
                    <span className="text-sm font-medium text-slate-700">From</span>
                    <input
                      type="time"
                      className="min-h-12 w-full rounded-lg border border-slate-200 px-3"
                      value={form.scheduleFrom}
                      onChange={(event) => setForm((current) => ({ ...current, scheduleFrom: event.target.value }))}
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-sm font-medium text-slate-700">To</span>
                    <input
                      type="time"
                      className="min-h-12 w-full rounded-lg border border-slate-200 px-3"
                      value={form.scheduleTo}
                      onChange={(event) => setForm((current) => ({ ...current, scheduleTo: event.target.value }))}
                    />
                  </label>
                </div>
              </div>
            ) : null}

            {form.type === 'expiration' ? (
              <div className="space-y-3 rounded-lg border border-slate-200 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-800">Expiration tiers</p>
                  <button
                    type="button"
                    onClick={() =>
                      setForm((current) => ({
                        ...current,
                        expirationTiers: [...current.expirationTiers, { days_remaining: 0, discount_pct: 0 }],
                      }))
                    }
                    className="inline-flex min-h-10 items-center gap-1 rounded-md border border-slate-200 px-3 text-sm"
                  >
                    <Plus className="h-4 w-4" /> Add tier
                  </button>
                </div>

                <div className="space-y-2">
                  {form.expirationTiers.map((tier, index) => (
                    <div key={`tier-${index}`} className="grid grid-cols-[1fr_1fr_auto] items-center gap-2">
                      <input
                        type="number"
                        min="0"
                        className="min-h-12 rounded-lg border border-slate-200 px-3"
                        value={tier.days_remaining}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            expirationTiers: current.expirationTiers.map((row, rowIndex) =>
                              rowIndex === index ? { ...row, days_remaining: Number(event.target.value) } : row
                            ),
                          }))
                        }
                        placeholder="Days remaining"
                      />
                      <input
                        type="number"
                        min="0"
                        max="100"
                        className="min-h-12 rounded-lg border border-slate-200 px-3"
                        value={tier.discount_pct}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            expirationTiers: current.expirationTiers.map((row, rowIndex) =>
                              rowIndex === index ? { ...row, discount_pct: Number(event.target.value) } : row
                            ),
                          }))
                        }
                        placeholder="Discount %"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setForm((current) => ({
                            ...current,
                            expirationTiers: current.expirationTiers.filter((_, rowIndex) => rowIndex !== index),
                          }))
                        }
                        className="inline-flex min-h-12 items-center justify-center rounded-md border border-red-200 px-3 text-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {step === 3 ? (
          <div className="mt-4 grid grid-cols-1 gap-3">
            <MultiSelectChecklist
              title="Products"
              options={products}
              selected={form.targetProductIds}
              onToggle={(id) => setForm((current) => ({ ...current, targetProductIds: toggleId(id, current.targetProductIds) }))}
            />
            <MultiSelectChecklist
              title="Categories"
              options={categories}
              selected={form.targetCategoryIds}
              onToggle={(id) => setForm((current) => ({ ...current, targetCategoryIds: toggleId(id, current.targetCategoryIds) }))}
            />
            <MultiSelectChecklist
              title="Machines"
              options={machines}
              selected={form.targetMachineIds}
              onToggle={(id) => setForm((current) => ({ ...current, targetMachineIds: toggleId(id, current.targetMachineIds) }))}
            />
          </div>
        ) : null}

        {step === 4 ? (
          <div className="mt-4 space-y-2 rounded-lg border border-slate-200 p-3">
            {reviewRows.map((row) => (
              <div key={row.label} className="flex items-center justify-between gap-4 border-b border-slate-100 py-2 last:border-b-0">
                <span className="text-sm text-slate-600">{row.label}</span>
                <span className="text-sm font-semibold text-slate-900">{row.value}</span>
              </div>
            ))}
          </div>
        ) : null}

        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        <DialogFooter>
          <button
            type="button"
            onClick={() => (step === 1 ? onOpenChange(false) : setStep((current) => Math.max(1, current - 1)))}
            className="min-h-12 rounded-lg border border-slate-200 px-4 text-sm font-semibold text-slate-700"
          >
            {step === 1 ? 'Cancel' : 'Back'}
          </button>

          {step < 4 ? (
            <button
              type="button"
              onClick={() => setStep((current) => Math.min(4, current + 1))}
              disabled={step === 2 && !canContinueFromStep2}
              className="min-h-12 rounded-lg bg-[#0D2B4E] px-4 text-sm font-semibold text-white disabled:opacity-60"
            >
              Next
            </button>
          ) : (
            <button
              type="button"
              onClick={submit}
              disabled={isPending}
              className="min-h-12 rounded-lg bg-[#0D2B4E] px-4 text-sm font-semibold text-white disabled:opacity-60"
            >
              {isPending ? 'Saving...' : mode === 'create' ? 'Activate' : 'Save'}
            </button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
