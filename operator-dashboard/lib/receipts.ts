import 'server-only';

import type { TransactionReceiptProps } from '@/emails/TransactionReceipt';

export type ReceiptBrandingConfig = {
  logoUrl?: string | null;
  primaryColor?: string | null;
  footerText?: string | null;
  supportEmail?: string | null;
  supportPhone?: string | null;
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function currencyFormat(value: number, currency = 'usd') {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase(),
      minimumFractionDigits: 2,
    }).format(value);
  } catch {
    return `$${value.toFixed(2)}`;
  }
}

function dateTimeLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('en-US');
}

export function normalizeReceiptBranding(branding: unknown): ReceiptBrandingConfig {
  const value = (branding ?? {}) as Record<string, unknown>;
  return {
    logoUrl: typeof value.receiptLogoUrl === 'string' ? value.receiptLogoUrl : null,
    primaryColor: typeof value.receiptPrimaryColor === 'string' ? value.receiptPrimaryColor : '#0D2B4E',
    footerText: typeof value.receiptFooterText === 'string' ? value.receiptFooterText : null,
    supportEmail: typeof value.receiptSupportEmail === 'string' ? value.receiptSupportEmail : null,
    supportPhone: typeof value.receiptSupportPhone === 'string' ? value.receiptSupportPhone : null,
  };
}

export function renderTransactionReceiptHtml(props: TransactionReceiptProps) {
  const brandColor = props.branding?.primaryColor?.trim() || '#0D2B4E';
  const operatorName = escapeHtml(props.operatorName || 'Maquinita');
  const modeLabel = props.mode === 'refund' ? 'Refund Confirmation' : 'Transaction Receipt';
  const createdAt = escapeHtml(dateTimeLabel(props.createdAt));
  const machineLine = props.machineName
    ? `<p style="margin:0 0 4px;font-size:13px;"><strong>Machine:</strong> ${escapeHtml(props.machineName)}${
        props.machineAddress ? ` • ${escapeHtml(props.machineAddress)}` : ''
      }</p>`
    : '';
  const paymentLine = props.cardLast4
    ? `<p style="margin:0 0 4px;font-size:13px;"><strong>Payment:</strong> Card ending in ${escapeHtml(props.cardLast4)}</p>`
    : '';
  const logo = props.branding?.logoUrl
    ? `<img src="${escapeHtml(props.branding.logoUrl)}" alt="${operatorName}" style="width:42px;height:42px;border-radius:8px;object-fit:cover;background:#ffffff;" />`
    : '';
  const footerText = escapeHtml(props.branding?.footerText || 'Thank you for your purchase with Maquinita.');
  const supportLine =
    props.branding?.supportEmail || props.branding?.supportPhone
      ? `<p style="margin:6px 0 0;">Support: ${escapeHtml(props.branding?.supportEmail || '-')}${
          props.branding?.supportPhone ? ` • ${escapeHtml(props.branding.supportPhone)}` : ''
        }</p>`
      : '';

  const rows = props.items
    .map(
      (item) => `
      <tr>
        <td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;">${escapeHtml(item.name)}</td>
        <td style="padding:10px 12px;text-align:right;border-bottom:1px solid #f1f5f9;">${item.quantity}</td>
        <td style="padding:10px 12px;text-align:right;border-bottom:1px solid #f1f5f9;">${currencyFormat(item.unitPrice, props.currency)}</td>
        <td style="padding:10px 12px;text-align:right;border-bottom:1px solid #f1f5f9;">${currencyFormat(item.lineTotal, props.currency)}</td>
      </tr>`
    )
    .join('');

  const refundLine =
    props.mode === 'refund'
      ? `<p style="margin:0;display:flex;justify-content:space-between;"><span>Refunded</span><strong>-${currencyFormat(
          props.refundAmount || 0,
          props.currency
        )}</strong></p>`
      : '';

  return `<!doctype html>
<html lang="en">
  <body style="background-color:#f1f5f9;padding:24px;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
    <div style="max-width:680px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">
      <div style="background:${escapeHtml(brandColor)};color:#ffffff;padding:18px 20px;display:flex;align-items:center;gap:12px;">
        ${logo}
        <div>
          <p style="margin:0;font-size:20px;font-weight:800;">${operatorName}</p>
          <p style="margin:0;font-size:13px;opacity:0.95;">${modeLabel}</p>
        </div>
      </div>

      <div style="padding:18px 20px;">
        <p style="margin:0 0 4px;font-size:13px;"><strong>Transaction ID:</strong> ${escapeHtml(props.transactionId)}</p>
        <p style="margin:0 0 4px;font-size:13px;"><strong>Date:</strong> ${createdAt}</p>
        ${machineLine}
        ${paymentLine}

        <div style="margin-top:14px;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;">
          <table style="width:100%;border-collapse:collapse;font-size:13px;">
            <thead style="background-color:#f8fafc;">
              <tr>
                <th style="text-align:left;padding:10px 12px;border-bottom:1px solid #e2e8f0;">Item</th>
                <th style="text-align:right;padding:10px 12px;border-bottom:1px solid #e2e8f0;">Qty</th>
                <th style="text-align:right;padding:10px 12px;border-bottom:1px solid #e2e8f0;">Unit</th>
                <th style="text-align:right;padding:10px 12px;border-bottom:1px solid #e2e8f0;">Total</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>

        <div style="margin-top:14px;display:grid;gap:4px;font-size:13px;">
          <p style="margin:0;display:flex;justify-content:space-between;"><span>Subtotal</span><strong>${currencyFormat(
            props.subtotal,
            props.currency
          )}</strong></p>
          <p style="margin:0;display:flex;justify-content:space-between;"><span>Tax (${props.taxRatePercent.toFixed(
            2
          )}%)</span><strong>${currencyFormat(props.taxAmount, props.currency)}</strong></p>
          <p style="margin:0;display:flex;justify-content:space-between;"><span>Discount</span><strong>-${currencyFormat(
            props.discountAmount,
            props.currency
          )}</strong></p>
          ${refundLine}
          <p style="margin:6px 0 0;display:flex;justify-content:space-between;font-size:16px;">
            <span>Total</span>
            <strong style="color:${escapeHtml(brandColor)};">${currencyFormat(props.total, props.currency)}</strong>
          </p>
        </div>
      </div>

      <div style="border-top:1px solid #e2e8f0;padding:14px 20px;font-size:12px;color:#475569;">
        <p style="margin:0;">${footerText}</p>
        ${supportLine}
      </div>
    </div>
  </body>
</html>`;
}

export async function sendReceiptEmail(params: {
  to: string;
  subject: string;
  props: TransactionReceiptProps;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { ok: false as const, error: 'Missing RESEND_API_KEY' };
  }

  const from = process.env.RESEND_FROM_EMAIL || 'Maquinita <no-reply@maquinita.app>';
  const html = renderTransactionReceiptHtml(params.props);

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [params.to],
        subject: params.subject,
        html,
      }),
      cache: 'no-store',
    });

    if (!response.ok) {
      return { ok: false as const, error: `Resend request failed (${response.status})` };
    }

    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : 'Resend request failed' };
  }
}
