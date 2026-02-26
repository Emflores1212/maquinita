import { createAdminClient } from '@/lib/supabase';
import { failure, resolveOperatorId, success } from '../../../_lib';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request, context: { params: { id: string } }) {
  const operatorId = resolveOperatorId(request);
  if (!operatorId) {
    return failure(401, 'UNAUTHORIZED', 'Missing x-operator-id header.');
  }

  const machineId = context.params.id;
  const adminDb = createAdminClient() as any;

  const { data: machineData } = await adminDb
    .from('machines')
    .select('id, name')
    .eq('operator_id', operatorId)
    .eq('id', machineId)
    .maybeSingle();

  if (!machineData?.id) {
    return failure(404, 'NOT_FOUND', 'Machine not found.');
  }

  const { data: itemsData, error: itemsError } = await adminDb
    .from('rfid_items')
    .select('epc, product_id, expiration_date, current_discount')
    .eq('operator_id', operatorId)
    .eq('machine_id', machineId)
    .eq('status', 'in_machine');

  if (itemsError) {
    return failure(500, 'QUERY_FAILED', itemsError.message);
  }

  const items = (itemsData as Array<{ epc: string; product_id: string | null; expiration_date: string | null; current_discount: number | null }> | null) ?? [];
  const productIds = Array.from(new Set(items.map((item) => item.product_id).filter((id): id is string => Boolean(id))));

  let productsById = new Map<string, { id: string; name: string; sku: string | null; photo_url: string | null; category_id: string | null }>();
  if (productIds.length > 0) {
    const { data: productsData } = await adminDb
      .from('products')
      .select('id, name, sku, photo_url, category_id')
      .eq('operator_id', operatorId)
      .in('id', productIds);

    productsById = new Map(
      (((productsData as Array<{ id: string; name: string; sku: string | null; photo_url: string | null; category_id: string | null }> | null) ?? []).map((product) => [
        product.id,
        product,
      ]))
    );
  }

  const now = Date.now();
  const expiringSoonMs = 72 * 60 * 60 * 1000;
  const rowsByProduct = new Map<
    string,
    {
      product_id: string;
      product_name: string;
      sku: string | null;
      photo_url: string | null;
      category_id: string | null;
      quantity: number;
      expiring_soon: number;
      discounted: number;
    }
  >();

  for (const item of items) {
    if (!item.product_id) continue;
    const product = productsById.get(item.product_id);
    const existing = rowsByProduct.get(item.product_id) ?? {
      product_id: item.product_id,
      product_name: product?.name ?? 'Unknown Product',
      sku: product?.sku ?? null,
      photo_url: product?.photo_url ?? null,
      category_id: product?.category_id ?? null,
      quantity: 0,
      expiring_soon: 0,
      discounted: 0,
    };

    existing.quantity += 1;

    if (item.current_discount && Number(item.current_discount) > 0) {
      existing.discounted += 1;
    }

    if (item.expiration_date) {
      const expiration = new Date(item.expiration_date).getTime();
      if (!Number.isNaN(expiration) && expiration >= now && expiration - now <= expiringSoonMs) {
        existing.expiring_soon += 1;
      }
    }

    rowsByProduct.set(item.product_id, existing);
  }

  const rows = Array.from(rowsByProduct.values()).sort((left, right) => left.product_name.localeCompare(right.product_name));

  return success(
    {
      machine: machineData,
      total_items: items.length,
      products: rows,
    },
    {
      page: 1,
      total: rows.length,
      limit: rows.length,
    }
  );
}
