'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { bootstrapConsumerProfileAction } from '@/app/actions/consumer';
import { createBrowserClient } from '@/lib/supabase-browser';

function normalizePhone(value: string) {
  return value.replace(/[^\d+]/g, '');
}

export default function ConsumerLoginClient({ slug, operatorId }: { slug: string; operatorId: string }) {
  const t = useTranslations('consumer.login');
  const router = useRouter();
  const searchParams = useSearchParams();

  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'request' | 'verify'>('request');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const returnUrl = searchParams.get('returnUrl') || `/${slug}/profile`;

  const requestOtp = () => {
    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone || normalizedPhone.length < 8) {
      setErrorMessage(t('invalidPhone'));
      return;
    }

    setErrorMessage(null);
    setStatusMessage(null);

    startTransition(async () => {
      const supabase = createBrowserClient();
      const { error } = await supabase.auth.signInWithOtp({ phone: normalizedPhone });

      if (error) {
        setErrorMessage(error.message || t('otpRequestError'));
        return;
      }

      setPhone(normalizedPhone);
      setStep('verify');
      setStatusMessage(t('otpRequested'));
    });
  };

  const verifyOtp = () => {
    const token = otp.trim();
    if (token.length !== 6) return;

    setErrorMessage(null);
    setStatusMessage(null);

    startTransition(async () => {
      const supabase = createBrowserClient();
      const { error } = await supabase.auth.verifyOtp({
        phone,
        token,
        type: 'sms',
      });

      if (error) {
        setErrorMessage(error.message || t('otpVerifyError'));
        return;
      }

      const bootstrap = await bootstrapConsumerProfileAction({
        operatorId,
        phone,
      });

      if (!bootstrap.ok) {
        setErrorMessage(bootstrap.error || t('bootstrapError'));
        return;
      }

      router.replace(returnUrl.startsWith('/') ? returnUrl : `/${slug}/profile`);
      router.refresh();
    });
  };

  useEffect(() => {
    if (step === 'verify' && otp.trim().length === 6 && !isPending) {
      verifyOtp();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otp, step, isPending]);

  return (
    <div className="mx-auto w-full max-w-md space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-xl font-bold text-slate-900">{t('title')}</h2>
      <p className="text-sm text-slate-600">{step === 'request' ? t('subtitleRequest') : t('subtitleVerify')}</p>

      {statusMessage ? <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{statusMessage}</div> : null}
      {errorMessage ? <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{errorMessage}</div> : null}

      {step === 'request' ? (
        <div className="space-y-3">
          <label className="block text-sm font-semibold text-slate-700">
            {t('phoneLabel')}
            <input
              type="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="+1 555 123 4567"
              className="mt-1 h-12 w-full rounded-lg border border-slate-300 px-3 text-base"
            />
          </label>

          <button
            type="button"
            onClick={requestOtp}
            disabled={isPending}
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#0D2B4E] px-4 text-sm font-semibold text-white disabled:opacity-60"
          >
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {t('sendOtp')}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <label className="block text-sm font-semibold text-slate-700">
            {t('otpLabel')}
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              autoFocus
              value={otp}
              onChange={(event) => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="123456"
              className="mt-1 h-12 w-full rounded-lg border border-slate-300 px-3 text-center text-2xl tracking-[0.35em]"
            />
          </label>

          <button
            type="button"
            onClick={verifyOtp}
            disabled={isPending || otp.length !== 6}
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#0D2B4E] px-4 text-sm font-semibold text-white disabled:opacity-60"
          >
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {t('verifyOtp')}
          </button>

          <button type="button" onClick={() => setStep('request')} className="inline-flex h-11 items-center text-sm font-semibold text-[#0D2B4E]">
            {t('changePhone')}
          </button>
        </div>
      )}
    </div>
  );
}
