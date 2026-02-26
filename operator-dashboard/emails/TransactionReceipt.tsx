import * as React from 'react';

export type ReceiptLineItem = {
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  photoUrl?: string | null;
};

export type ReceiptBranding = {
  logoUrl?: string | null;
  primaryColor?: string | null;
  footerText?: string | null;
  supportEmail?: string | null;
  supportPhone?: string | null;
};

export type TransactionReceiptProps = {
  operatorName: string;
  transactionId: string;
  machineName?: string | null;
  machineAddress?: string | null;
  createdAt: string;
  subtotal: number;
  taxAmount: number;
  taxRatePercent: number;
  discountAmount: number;
  total: number;
  currency?: string;
  cardLast4?: string | null;
  items: ReceiptLineItem[];
  branding?: ReceiptBranding;
  mode?: 'receipt' | 'refund';
  refundAmount?: number;
};

function currencyFormat(value: number, currency = 'USD') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
    minimumFractionDigits: 2,
  }).format(value);
}

export default function TransactionReceipt({
  operatorName,
  transactionId,
  machineName,
  machineAddress,
  createdAt,
  subtotal,
  taxAmount,
  taxRatePercent,
  discountAmount,
  total,
  currency = 'usd',
  cardLast4,
  items,
  branding,
  mode = 'receipt',
  refundAmount = 0,
}: TransactionReceiptProps) {
  const brandColor = branding?.primaryColor?.trim() || '#0D2B4E';
  const created = new Date(createdAt);
  const createdLabel = Number.isNaN(created.getTime()) ? createdAt : created.toLocaleString('en-US');
  const receiptLabel = mode === 'refund' ? 'Refund Confirmation' : 'Transaction Receipt';

  return (
    <div style={{ backgroundColor: '#f1f5f9', padding: '24px', fontFamily: 'Arial, Helvetica, sans-serif', color: '#0f172a' }}>
      <div style={{ maxWidth: 680, margin: '0 auto', background: '#ffffff', borderRadius: 12, overflow: 'hidden', border: '1px solid #e2e8f0' }}>
        <div style={{ background: brandColor, color: '#ffffff', padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
          {branding?.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={branding.logoUrl} alt={operatorName} style={{ width: 42, height: 42, borderRadius: 8, objectFit: 'cover', background: '#ffffff' }} />
          ) : null}
          <div>
            <p style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>{operatorName}</p>
            <p style={{ margin: 0, fontSize: 13, opacity: 0.95 }}>{receiptLabel}</p>
          </div>
        </div>

        <div style={{ padding: '18px 20px' }}>
          <p style={{ margin: '0 0 4px', fontSize: 13 }}>
            <strong>Transaction ID:</strong> {transactionId}
          </p>
          <p style={{ margin: '0 0 4px', fontSize: 13 }}>
            <strong>Date:</strong> {createdLabel}
          </p>
          {machineName ? (
            <p style={{ margin: '0 0 4px', fontSize: 13 }}>
              <strong>Machine:</strong> {machineName}
              {machineAddress ? ` • ${machineAddress}` : ''}
            </p>
          ) : null}
          {cardLast4 ? (
            <p style={{ margin: '0 0 4px', fontSize: 13 }}>
              <strong>Payment:</strong> Card ending in {cardLast4}
            </p>
          ) : null}

          <div style={{ marginTop: 14, border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead style={{ backgroundColor: '#f8fafc' }}>
                <tr>
                  <th style={{ textAlign: 'left', padding: '10px 12px', borderBottom: '1px solid #e2e8f0' }}>Item</th>
                  <th style={{ textAlign: 'right', padding: '10px 12px', borderBottom: '1px solid #e2e8f0' }}>Qty</th>
                  <th style={{ textAlign: 'right', padding: '10px 12px', borderBottom: '1px solid #e2e8f0' }}>Unit</th>
                  <th style={{ textAlign: 'right', padding: '10px 12px', borderBottom: '1px solid #e2e8f0' }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => (
                  <tr key={`${item.name}-${index}`}>
                    <td style={{ padding: '10px 12px', borderBottom: '1px solid #f1f5f9' }}>{item.name}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', borderBottom: '1px solid #f1f5f9' }}>{item.quantity}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', borderBottom: '1px solid #f1f5f9' }}>
                      {currencyFormat(item.unitPrice, currency)}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', borderBottom: '1px solid #f1f5f9' }}>
                      {currencyFormat(item.lineTotal, currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: 14, display: 'grid', gap: 4, fontSize: 13 }}>
            <p style={{ margin: 0, display: 'flex', justifyContent: 'space-between' }}>
              <span>Subtotal</span>
              <strong>{currencyFormat(subtotal, currency)}</strong>
            </p>
            <p style={{ margin: 0, display: 'flex', justifyContent: 'space-between' }}>
              <span>Tax ({taxRatePercent.toFixed(2)}%)</span>
              <strong>{currencyFormat(taxAmount, currency)}</strong>
            </p>
            <p style={{ margin: 0, display: 'flex', justifyContent: 'space-between' }}>
              <span>Discount</span>
              <strong>-{currencyFormat(discountAmount, currency)}</strong>
            </p>
            {mode === 'refund' ? (
              <p style={{ margin: 0, display: 'flex', justifyContent: 'space-between' }}>
                <span>Refunded</span>
                <strong>-{currencyFormat(refundAmount, currency)}</strong>
              </p>
            ) : null}
            <p style={{ margin: '6px 0 0', display: 'flex', justifyContent: 'space-between', fontSize: 16 }}>
              <span>Total</span>
              <strong style={{ color: brandColor }}>{currencyFormat(total, currency)}</strong>
            </p>
          </div>
        </div>

        <div style={{ borderTop: '1px solid #e2e8f0', padding: '14px 20px', fontSize: 12, color: '#475569' }}>
          <p style={{ margin: 0 }}>{branding?.footerText || 'Thank you for your purchase with Maquinita.'}</p>
          {(branding?.supportEmail || branding?.supportPhone) && (
            <p style={{ margin: '6px 0 0' }}>
              Support: {branding?.supportEmail || '-'}
              {branding?.supportPhone ? ` • ${branding.supportPhone}` : ''}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
