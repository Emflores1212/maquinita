'use client';

import { useMemo, useState, useTransition, type FormEvent } from 'react';
import { Loader2, Upload } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { saveReceiptTemplateAction } from '@/app/actions/transactions';
import { createBrowserClient } from '@/lib/supabase-browser';

type ReceiptTemplateSettingsProps = {
  operatorId: string;
  operatorName: string;
  canEdit: boolean;
  initial: {
    logoUrl: string;
    primaryColor: string;
    footerText: string;
    supportEmail: string;
    supportPhone: string;
  };
};

type FeedbackState =
  | { type: 'success'; text: string }
  | { type: 'error'; text: string }
  | null;

function toSafeHex(value: string) {
  const normalized = value.trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(normalized)) return normalized.toUpperCase();
  return '#0D2B4E';
}

function sanitizeOptional(value: string) {
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

export default function ReceiptTemplateSettings({ operatorId, operatorName, canEdit, initial }: ReceiptTemplateSettingsProps) {
  const t = useTranslations('settingsPage.receipts');
  const [logoUrl, setLogoUrl] = useState(initial.logoUrl);
  const [primaryColor, setPrimaryColor] = useState(initial.primaryColor || '#0D2B4E');
  const [footerText, setFooterText] = useState(initial.footerText);
  const [supportEmail, setSupportEmail] = useState(initial.supportEmail);
  const [supportPhone, setSupportPhone] = useState(initial.supportPhone);
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [isPending, startTransition] = useTransition();
  const [isUploading, setIsUploading] = useState(false);

  const previewColor = useMemo(() => toSafeHex(primaryColor), [primaryColor]);

  const handleLogoUpload = async (file: File | null) => {
    if (!file || !canEdit) return;
    if (!file.type.startsWith('image/')) {
      setFeedback({ type: 'error', text: t('errors.invalidImage') });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setFeedback({ type: 'error', text: t('errors.logoTooLarge') });
      return;
    }

    setIsUploading(true);
    setFeedback(null);

    const ext = (file.name.split('.').pop() || 'jpg').replace(/[^a-zA-Z0-9]/g, '').toLowerCase() || 'jpg';
    const path = `${operatorId}/receipt-logo/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    try {
      const supabase = createBrowserClient();
      const { error: uploadError } = await supabase.storage.from('product-images').upload(path, file, {
        cacheControl: '3600',
        upsert: true,
      });

      if (uploadError) {
        setFeedback({ type: 'error', text: t('errors.uploadFailed') });
        return;
      }

      const { data } = supabase.storage.from('product-images').getPublicUrl(path);
      setLogoUrl(data.publicUrl);
      setFeedback({ type: 'success', text: t('uploadSuccess') });
    } catch {
      setFeedback({ type: 'error', text: t('errors.uploadFailed') });
    } finally {
      setIsUploading(false);
    }
  };

  const handleSave = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canEdit) return;

    setFeedback(null);

    startTransition(async () => {
      const result = await saveReceiptTemplateAction({
        logoUrl: sanitizeOptional(logoUrl),
        primaryColor: toSafeHex(primaryColor),
        footerText: sanitizeOptional(footerText),
        supportEmail: sanitizeOptional(supportEmail),
        supportPhone: sanitizeOptional(supportPhone),
      });

      if (!result.ok) {
        setFeedback({ type: 'error', text: result.error ?? t('errors.saveFailed') });
        return;
      }

      setFeedback({ type: 'success', text: t('saveSuccess') });
    });
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t('title')}</h1>
        <p className="mt-1 text-sm text-slate-600">{t('subtitle')}</p>
      </div>

      {!canEdit ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">{t('readOnly')}</div>
      ) : null}

      {feedback ? (
        <div
          className={`rounded-lg border px-4 py-3 text-sm font-semibold ${
            feedback.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'border-red-200 bg-red-50 text-red-700'
          }`}
        >
          {feedback.text}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <form onSubmit={handleSave} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <label className="block text-sm font-semibold text-slate-700">
            {t('logoUrl')}
            <input
              type="url"
              value={logoUrl}
              onChange={(event) => setLogoUrl(event.target.value)}
              placeholder="https://..."
              disabled={!canEdit}
              className="mt-1 h-11 w-full rounded-lg border border-slate-300 px-3 text-sm disabled:bg-slate-100"
            />
          </label>

          <label className="inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700">
            <Upload className="h-4 w-4" />
            {isUploading ? t('uploading') : t('uploadLogo')}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              disabled={!canEdit || isUploading}
              onChange={(event) => void handleLogoUpload(event.target.files?.[0] ?? null)}
            />
          </label>

          <label className="block text-sm font-semibold text-slate-700">
            {t('primaryColor')}
            <div className="mt-1 flex items-center gap-2">
              <input
                type="color"
                value={previewColor}
                disabled={!canEdit}
                onChange={(event) => setPrimaryColor(event.target.value)}
                className="h-11 w-14 cursor-pointer rounded border border-slate-300 p-1"
              />
              <input
                type="text"
                value={primaryColor}
                disabled={!canEdit}
                onChange={(event) => setPrimaryColor(event.target.value)}
                placeholder="#0D2B4E"
                className="h-11 flex-1 rounded-lg border border-slate-300 px-3 text-sm uppercase disabled:bg-slate-100"
              />
            </div>
          </label>

          <label className="block text-sm font-semibold text-slate-700">
            {t('footerText')}
            <textarea
              value={footerText}
              disabled={!canEdit}
              onChange={(event) => setFooterText(event.target.value)}
              rows={3}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
            />
          </label>

          <label className="block text-sm font-semibold text-slate-700">
            {t('supportEmail')}
            <input
              type="email"
              value={supportEmail}
              disabled={!canEdit}
              onChange={(event) => setSupportEmail(event.target.value)}
              placeholder="support@company.com"
              className="mt-1 h-11 w-full rounded-lg border border-slate-300 px-3 text-sm disabled:bg-slate-100"
            />
          </label>

          <label className="block text-sm font-semibold text-slate-700">
            {t('supportPhone')}
            <input
              type="text"
              value={supportPhone}
              disabled={!canEdit}
              onChange={(event) => setSupportPhone(event.target.value)}
              placeholder="+1 555 000 0000"
              className="mt-1 h-11 w-full rounded-lg border border-slate-300 px-3 text-sm disabled:bg-slate-100"
            />
          </label>

          <button
            type="submit"
            disabled={!canEdit || isPending}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#0D2B4E] px-4 text-sm font-semibold text-white disabled:opacity-60"
          >
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {t('save')}
          </button>
        </form>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-bold text-slate-900">{t('previewTitle')}</h2>
          <div className="mt-3 overflow-hidden rounded-xl border border-slate-200">
            <div className="flex items-center gap-3 px-4 py-3 text-white" style={{ backgroundColor: previewColor }}>
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoUrl} alt={operatorName} className="h-9 w-9 rounded-md bg-white object-cover" />
              ) : (
                <div className="flex h-9 w-9 items-center justify-center rounded-md bg-white/20 text-xs font-bold">{operatorName.slice(0, 2).toUpperCase()}</div>
              )}
              <div>
                <p className="text-sm font-bold">{operatorName}</p>
                <p className="text-xs opacity-90">{t('previewReceipt')}</p>
              </div>
            </div>
            <div className="space-y-2 p-4 text-sm text-slate-700">
              <p>{t('previewBody')}</p>
              <p className="rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs">
                {footerText || t('defaultFooter')}
                {(supportEmail || supportPhone) && (
                  <span className="mt-1 block">
                    {t('supportLine', {
                      email: supportEmail || '-',
                      phone: supportPhone || '-',
                    })}
                  </span>
                )}
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
