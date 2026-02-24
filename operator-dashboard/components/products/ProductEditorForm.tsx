'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, Plus, UploadCloud, Archive } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  archiveProduct,
  createProductCategoryAction,
  updateProductPhotoAction,
  upsertProductAction,
} from '@/app/actions/products';
import { createBrowserClient } from '@/lib/supabase-browser';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { MachineOption, MachinePrice, ProductCategory, ProductDetailData } from '@/components/products/types';

const allergenKeys = ['gluten', 'dairy', 'nuts', 'soy', 'eggs', 'fish', 'shellfish', 'sesame'] as const;

const schema = z.object({
  name: z.string().min(1),
  sku: z.string().optional(),
  categoryId: z.string().optional(),
  description: z.string().optional(),
  basePrice: z.string().refine((value) => Number(value) > 0, { message: 'invalid_price' }),
  servingSize: z.string().optional(),
  calories: z.string().optional(),
  totalFat: z.string().optional(),
  saturatedFat: z.string().optional(),
  sodium: z.string().optional(),
  totalCarbs: z.string().optional(),
  fiber: z.string().optional(),
  sugars: z.string().optional(),
  protein: z.string().optional(),
  allergens: z.array(z.string()).default([]),
  machinePrices: z.array(
    z.object({
      machineId: z.string().uuid(),
      price: z.string().optional(),
    })
  ),
});

type FormValues = z.infer<typeof schema>;

function parseNumber(value: string | undefined): number | null {
  if (!value?.trim()) {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return parsed;
}

function toNutritionalPayload(values: FormValues) {
  return {
    servingSize: parseNumber(values.servingSize),
    calories: parseNumber(values.calories),
    totalFat: parseNumber(values.totalFat),
    saturatedFat: parseNumber(values.saturatedFat),
    sodium: parseNumber(values.sodium),
    totalCarbs: parseNumber(values.totalCarbs),
    fiber: parseNumber(values.fiber),
    sugars: parseNumber(values.sugars),
    protein: parseNumber(values.protein),
  };
}

export default function ProductEditorForm({
  mode,
  operatorId,
  product,
  categories,
  machines,
  machinePriceOverrides,
}: {
  mode: 'create' | 'edit';
  operatorId: string;
  product: ProductDetailData | null;
  categories: ProductCategory[];
  machines: MachineOption[];
  machinePriceOverrides: MachinePrice[];
}) {
  const t = useTranslations('productEditor');
  const router = useRouter();

  const [isSaving, startSave] = useTransition();
  const [isCreatingCategory, startCreateCategory] = useTransition();
  const [isArchiving, startArchiving] = useTransition();
  const [serverMessage, setServerMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [categoryOptions, setCategoryOptions] = useState(categories);
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryColor, setNewCategoryColor] = useState('#6B7280');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string>(product?.photo_url ?? '');

  const machinePriceMap = useMemo(() => {
    return new Map(machinePriceOverrides.map((row) => [row.machine_id, row.price]));
  }, [machinePriceOverrides]);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: product?.name ?? '',
      sku: product?.sku ?? '',
      categoryId: product?.category_id ?? '',
      description: product?.description ?? '',
      basePrice: product?.base_price ? Number(product.base_price).toFixed(2) : '',
      servingSize: product?.nutritional?.servingSize ? String(product.nutritional.servingSize) : '',
      calories: product?.nutritional?.calories ? String(product.nutritional.calories) : '',
      totalFat: product?.nutritional?.totalFat ? String(product.nutritional.totalFat) : '',
      saturatedFat: product?.nutritional?.saturatedFat ? String(product.nutritional.saturatedFat) : '',
      sodium: product?.nutritional?.sodium ? String(product.nutritional.sodium) : '',
      totalCarbs: product?.nutritional?.totalCarbs ? String(product.nutritional.totalCarbs) : '',
      fiber: product?.nutritional?.fiber ? String(product.nutritional.fiber) : '',
      sugars: product?.nutritional?.sugars ? String(product.nutritional.sugars) : '',
      protein: product?.nutritional?.protein ? String(product.nutritional.protein) : '',
      allergens: product?.allergens ?? [],
      machinePrices: machines.map((machine) => ({
        machineId: machine.id,
        price: machinePriceMap.has(machine.id) ? Number(machinePriceMap.get(machine.id)).toFixed(2) : '',
      })),
    },
  });

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    control,
    formState: { errors, isSubmitting },
  } = form;

  const { fields: machinePriceFields } = useFieldArray({
    control,
    name: 'machinePrices',
  });

  const basePrice = watch('basePrice');
  const selectedAllergens = watch('allergens') ?? [];

  const setPhotoFromFile = (file: File) => {
    setPhotoFile(file);
    setPhotoPreviewUrl(URL.createObjectURL(file));
  };

  const onDropFile = (event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (file) {
      setPhotoFromFile(file);
    }
  };

  const createCategory = () => {
    const name = newCategoryName.trim();
    if (!name) {
      setServerMessage({ type: 'error', text: t('categoryCreateNameRequired') });
      return;
    }

    startCreateCategory(async () => {
      const result = await createProductCategoryAction({
        name,
        color: newCategoryColor,
      });

      if (!result.ok || !('id' in result)) {
        setServerMessage({ type: 'error', text: result.error ?? t('categoryCreateError') });
        return;
      }

      setCategoryOptions((current) => {
        if (current.some((item) => item.id === result.id)) {
          return current;
        }
        return [
          ...current,
          {
            id: result.id,
            name: result.name,
            color: result.color,
            sort_order: current.length + 1,
          },
        ];
      });
      setValue('categoryId', result.id, { shouldDirty: true });
      setShowNewCategory(false);
      setNewCategoryName('');
      setServerMessage({ type: 'success', text: t('categoryCreateSuccess') });
    });
  };

  const onSubmit = (values: FormValues) => {
    setServerMessage(null);

    startSave(async () => {
      const basePriceNumber = Number(values.basePrice);

      const result = await upsertProductAction({
        id: mode === 'edit' ? product?.id : undefined,
        name: values.name,
        sku: values.sku?.trim() || null,
        categoryId: values.categoryId?.trim() || null,
        description: values.description?.trim() || null,
        basePrice: basePriceNumber,
        nutritional: toNutritionalPayload(values),
        allergens: selectedAllergens,
        machinePrices: values.machinePrices.map((machinePrice) => ({
          machineId: machinePrice.machineId,
          price: parseNumber(machinePrice.price),
        })),
      });

      if (!result.ok || !result.id) {
        setServerMessage({ type: 'error', text: result.error ?? t('saveError') });
        return;
      }

      if (photoFile) {
        const supabase = createBrowserClient();
        const storagePath = `${operatorId}/${result.id}/${Date.now()}.jpg`;
        const { error: uploadError } = await supabase.storage.from('product-images').upload(storagePath, photoFile, {
          upsert: true,
          contentType: photoFile.type || 'image/jpeg',
        });

        if (uploadError) {
          setServerMessage({ type: 'error', text: `${t('photoUploadError')}: ${uploadError.message}` });
          return;
        }

        const {
          data: { publicUrl },
        } = supabase.storage.from('product-images').getPublicUrl(storagePath);

        const photoResult = await updateProductPhotoAction({
          productId: result.id,
          photoUrl: publicUrl,
        });

        if (!photoResult.ok) {
          setServerMessage({ type: 'error', text: photoResult.error ?? t('photoSaveError') });
          return;
        }
      }

      setServerMessage({ type: 'success', text: t('saveSuccess') });

      if (mode === 'create') {
        router.replace(`/products/${result.id}/edit`);
      } else {
        router.refresh();
      }
    });
  };

  const onArchive = () => {
    if (!product?.id) {
      return;
    }

    if (!window.confirm(t('archiveConfirm'))) {
      return;
    }

    startArchiving(async () => {
      const result = await archiveProduct({ productId: product.id });
      if (!result.ok) {
        setServerMessage({ type: 'error', text: result.error ?? t('archiveError') });
        return;
      }

      router.push('/products');
      router.refresh();
    });
  };

  return (
    <div className="mx-auto max-w-6xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{mode === 'create' ? t('createTitle') : t('editTitle')}</h1>
          <p className="mt-1 text-sm text-slate-500">{mode === 'create' ? t('createSubtitle') : t('editSubtitle')}</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            onClick={() => router.push('/products')}
          >
            {t('back')}
          </button>
          {mode === 'edit' ? (
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-70"
              disabled={isArchiving}
              onClick={onArchive}
            >
              {isArchiving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Archive className="h-4 w-4" />}
              {t('archive')}
            </button>
          ) : null}
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Tabs defaultValue="basic" className="w-full">
          <TabsList className="h-auto w-full justify-start gap-1 bg-transparent p-0">
            <TabsTrigger value="basic">{t('tabs.basic')}</TabsTrigger>
            <TabsTrigger value="nutrition">{t('tabs.nutrition')}</TabsTrigger>
            <TabsTrigger value="pricing">{t('tabs.pricing')}</TabsTrigger>
          </TabsList>

          <TabsContent value="basic" className="space-y-5 pt-4">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-700">{t('name')}</label>
                <input
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-[#1565C0] focus:bg-white"
                  {...register('name')}
                />
                {errors.name ? <p className="mt-1 text-xs text-red-600">{t('required')}</p> : null}
              </div>

              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-700">{t('sku')}</label>
                <input
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-mono outline-none focus:border-[#1565C0] focus:bg-white"
                  placeholder={t('skuPlaceholder')}
                  {...register('sku')}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-700">{t('category')}</label>
                <div className="flex items-center gap-2">
                  <select
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#1565C0]"
                    {...register('categoryId')}
                  >
                    <option value="">{t('categoryNone')}</option>
                    {categoryOptions
                      .slice()
                      .sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0))
                      .map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                  </select>

                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    onClick={() => setShowNewCategory((current) => !current)}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    {t('addCategory')}
                  </button>
                </div>

                {showNewCategory ? (
                  <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_auto]">
                    <input
                      value={newCategoryName}
                      onChange={(event) => setNewCategoryName(event.target.value)}
                      placeholder={t('newCategoryName')}
                      className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-[#1565C0] focus:bg-white"
                    />
                    <input
                      type="color"
                      value={newCategoryColor}
                      onChange={(event) => setNewCategoryColor(event.target.value)}
                      className="h-10 w-full rounded-lg border border-slate-200 bg-white p-1 sm:w-16"
                    />
                    <button
                      type="button"
                      className="rounded-lg bg-[#0D2B4E] px-3 py-2 text-sm font-semibold text-white hover:bg-[#0A2240] disabled:opacity-70"
                      disabled={isCreatingCategory}
                      onClick={createCategory}
                    >
                      {isCreatingCategory ? <Loader2 className="h-4 w-4 animate-spin" /> : t('createCategory')}
                    </button>
                  </div>
                ) : null}
              </div>

              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-700">{t('basePrice')}</label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-500">$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-7 pr-3 text-sm outline-none focus:border-[#1565C0] focus:bg-white"
                    {...register('basePrice')}
                  />
                </div>
                {errors.basePrice ? <p className="mt-1 text-xs text-red-600">{t('priceInvalid')}</p> : null}
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-700">{t('description')}</label>
              <textarea
                rows={4}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-[#1565C0] focus:bg-white"
                {...register('description')}
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-700">{t('photo')}</label>
              <label
                className="block cursor-pointer rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-center text-sm text-slate-600 hover:bg-slate-100"
                onDragOver={(event) => event.preventDefault()}
                onDrop={onDropFile}
              >
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) {
                      setPhotoFromFile(file);
                    }
                  }}
                />
                <div className="flex flex-col items-center gap-2">
                  <UploadCloud className="h-5 w-5 text-slate-500" />
                  <p>{t('photoHint')}</p>
                </div>
              </label>

              {photoPreviewUrl ? (
                <div className="mt-3 h-40 w-40 overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photoPreviewUrl} alt={watch('name') || 'preview'} className="h-full w-full object-cover" />
                </div>
              ) : null}
            </div>
          </TabsContent>

          <TabsContent value="nutrition" className="space-y-5 pt-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-700">{t('servingSize')}</label>
                <input type="number" step="0.1" className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-[#1565C0]" {...register('servingSize')} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-700">{t('calories')}</label>
                <input type="number" step="1" className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-[#1565C0]" {...register('calories')} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-700">{t('totalFat')}</label>
                <input type="number" step="0.1" className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-[#1565C0]" {...register('totalFat')} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-700">{t('saturatedFat')}</label>
                <input type="number" step="0.1" className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-[#1565C0]" {...register('saturatedFat')} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-700">{t('sodium')}</label>
                <input type="number" step="1" className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-[#1565C0]" {...register('sodium')} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-700">{t('totalCarbs')}</label>
                <input type="number" step="0.1" className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-[#1565C0]" {...register('totalCarbs')} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-700">{t('fiber')}</label>
                <input type="number" step="0.1" className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-[#1565C0]" {...register('fiber')} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-700">{t('sugars')}</label>
                <input type="number" step="0.1" className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-[#1565C0]" {...register('sugars')} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-700">{t('protein')}</label>
                <input type="number" step="0.1" className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-[#1565C0]" {...register('protein')} />
              </div>
            </div>

            <div>
              <p className="mb-2 text-sm font-semibold text-slate-700">{t('allergens')}</p>
              <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                {allergenKeys.map((allergen) => {
                  const checked = selectedAllergens.includes(allergen);
                  return (
                    <label key={allergen} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(event) => {
                          const next = new Set(selectedAllergens);
                          if (event.target.checked) {
                            next.add(allergen);
                          } else {
                            next.delete(allergen);
                          }
                          setValue('allergens', Array.from(next), { shouldDirty: true });
                        }}
                      />
                      <span>{t(`allergenLabels.${allergen}`)}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="pricing" className="space-y-3 pt-4">
            <p className="text-sm text-slate-600">{t('pricingHint')}</p>
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">{t('pricingMachine')}</th>
                    <th className="px-4 py-3">{t('pricingOverride')}</th>
                  </tr>
                </thead>
                <tbody>
                  {machinePriceFields.map((field, index) => {
                    const machine = machines.find((item) => item.id === field.machineId);
                    return (
                      <tr key={field.id} className="border-t border-slate-100">
                        <td className="px-4 py-3 font-medium text-slate-800">{machine?.name ?? field.machineId}</td>
                        <td className="px-4 py-3">
                          <input type="hidden" {...register(`machinePrices.${index}.machineId`)} />
                          <div className="relative max-w-[220px]">
                            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-500">$</span>
                            <input
                              type="number"
                              step="0.01"
                              min="0.01"
                              placeholder={basePrice ? Number(basePrice).toFixed(2) : ''}
                              className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-7 pr-3 text-sm outline-none focus:border-[#1565C0] focus:bg-white"
                              {...register(`machinePrices.${index}.price`)}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </TabsContent>
        </Tabs>

        {serverMessage ? (
          <div
            className={`rounded-lg border p-3 text-sm ${
              serverMessage.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-700'
            }`}
          >
            {serverMessage.text}
          </div>
        ) : null}

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 pt-4">
          <button
            type="submit"
            disabled={isSubmitting || isSaving}
            className="inline-flex items-center gap-2 rounded-lg bg-[#0D2B4E] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0A2240] disabled:opacity-70"
          >
            {isSubmitting || isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {t('save')}
          </button>
        </div>
      </form>
    </div>
  );
}
