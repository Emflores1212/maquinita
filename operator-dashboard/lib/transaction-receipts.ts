import { sendReceiptEmail, normalizeReceiptBranding, type ReceiptBrandingConfig } from '@/lib/receipts';
import { calculateSubtotal, parseTransactionItems } from '@/lib/transactions';

type TransactionForReceipt = {
  id: string;
  operator_id: string;
  machine_id: string | null;
  amount: number | null;
  tax_amount: number | null;
  discount_amount: number | null;
  refund_amount: number | null;
  items: unknown;
  customer_email: string | null;
  card_last4: string | null;
  currency: string | null;
  created_at: string | null;
};

type MachineSnapshot = {
  name: string | null;
  address: string | null;
};

type OperatorSnapshot = {
  name: string;
  branding: ReceiptBrandingConfig;
};

export async function getReceiptSnapshots(adminDb: any, operatorId: string, machineId: string | null) {
  const [{ data: operatorData }, machineResult] = await Promise.all([
    adminDb.from('operators').select('name, branding').eq('id', operatorId).maybeSingle(),
    machineId ? adminDb.from('machines').select('name, address').eq('id', machineId).maybeSingle() : Promise.resolve({ data: null }),
  ]);

  const operator = (operatorData as { name?: string | null; branding?: unknown } | null) ?? null;
  const machine = (machineResult.data as MachineSnapshot | null) ?? null;

  const operatorSnapshot: OperatorSnapshot = {
    name: operator?.name || 'Maquinita',
    branding: normalizeReceiptBranding(operator?.branding ?? {}),
  };

  return {
    operator: operatorSnapshot,
    machine,
  };
}

export function buildReceiptPayload(params: {
  transaction: TransactionForReceipt;
  operator: OperatorSnapshot;
  machine: MachineSnapshot | null;
  mode: 'receipt' | 'refund';
  refundAmount?: number;
}) {
  const { transaction, operator, machine, mode } = params;
  const items = parseTransactionItems(transaction.items);
  const subtotalFromItems = calculateSubtotal(items);
  const taxAmount = Number(transaction.tax_amount ?? 0);
  const discountAmount = Number(transaction.discount_amount ?? 0);
  const total = Number(transaction.amount ?? subtotalFromItems + taxAmount - discountAmount);
  const subtotal = subtotalFromItems > 0 ? subtotalFromItems : Math.max(0, total + discountAmount - taxAmount);
  const taxRate = subtotal > 0 ? (taxAmount / subtotal) * 100 : 0;

  return {
    operatorName: operator.name,
    transactionId: transaction.id,
    machineName: machine?.name ?? null,
    machineAddress: machine?.address ?? null,
    createdAt: transaction.created_at ?? new Date().toISOString(),
    subtotal,
    taxAmount,
    taxRatePercent: taxRate,
    discountAmount,
    total,
    currency: transaction.currency ?? 'usd',
    cardLast4: transaction.card_last4,
    items,
    branding: operator.branding,
    mode,
    refundAmount: params.refundAmount ?? Number(transaction.refund_amount ?? 0),
  };
}

export async function sendTransactionEmail(params: {
  adminDb: any;
  transaction: TransactionForReceipt;
  mode: 'receipt' | 'refund';
  refundAmount?: number;
}) {
  if (!params.transaction.customer_email) {
    return { ok: false as const, error: 'Missing customer email' };
  }

  const snapshots = await getReceiptSnapshots(params.adminDb, params.transaction.operator_id, params.transaction.machine_id);
  const receiptPayload = buildReceiptPayload({
    transaction: params.transaction,
    operator: snapshots.operator,
    machine: snapshots.machine,
    mode: params.mode,
    refundAmount: params.refundAmount,
  });

  const subject =
    params.mode === 'refund'
      ? `Refund confirmation • ${snapshots.operator.name}`
      : `Receipt • ${snapshots.operator.name}`;

  return sendReceiptEmail({
    to: params.transaction.customer_email,
    subject,
    props: receiptPayload,
  });
}
