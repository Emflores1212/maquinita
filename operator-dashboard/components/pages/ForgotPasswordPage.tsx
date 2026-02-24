'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Mail, Loader2, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { requestPasswordResetAction } from '@/app/actions/auth';

export default function ForgotPasswordPage() {
  const t = useTranslations('auth.forgotPassword');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [isSent, setIsSent] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setError('');

    startTransition(async () => {
      const result = await requestPasswordResetAction({ email });
      if (!result.ok) {
        setError(result.error ?? 'No se pudo enviar el correo / Failed to send email');
        return;
      }
      setIsSent(true);
    });
  };

  return (
    <div className="flex min-h-screen flex-col justify-center bg-slate-50 px-4 py-8 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#0D2B4E] shadow-2xl shadow-[#0D2B4E]/30 sm:h-20 sm:w-20 sm:rounded-3xl">
            <span className="text-3xl font-extrabold tracking-tighter text-white sm:text-4xl">M.</span>
          </div>
        </div>
        <h2 className="mt-6 text-center text-3xl font-extrabold tracking-tight text-slate-900 sm:mt-8 sm:text-4xl">{t('title')}</h2>
      </div>

      <div className="mt-8 sm:mx-auto sm:mt-10 sm:w-full sm:max-w-md">
        <div className="relative overflow-hidden rounded-2xl border border-slate-100 bg-white px-6 py-8 shadow-2xl shadow-slate-200/50 sm:rounded-[2rem] sm:px-8 sm:py-10">
          <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-[#0D2B4E] via-[#1565C0] to-[#42A5F5]" />

          {isSent ? (
            <div className="py-4 text-center">
              <div className="mb-4 flex justify-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50">
                  <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                </div>
              </div>
              <h3 className="mb-2 text-lg font-bold text-slate-900">{t('success')}</h3>
              <p className="mb-6 text-sm leading-relaxed text-slate-500">
                We sent a password reset link to <span className="font-semibold text-slate-700">{email}</span>.
              </p>
              <Link
                href="/login"
                className="inline-flex items-center gap-2 text-sm font-semibold text-[#1565C0] transition-colors hover:text-[#0D47A1]"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to login
              </Link>
            </div>
          ) : (
            <form className="space-y-6" onSubmit={handleSubmit} noValidate>
              <div>
                <label htmlFor="reset-email" className="block text-sm font-semibold text-slate-700">
                  {t('email')}
                </label>
                <div className="relative mt-3">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
                    <Mail className="h-5 w-5 text-slate-400" />
                  </div>
                  <input
                    id="reset-email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="block w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-4 text-sm font-medium text-slate-900 outline-none transition-all placeholder:text-slate-400 focus:border-[#1565C0] focus:bg-white focus:ring-2 focus:ring-[#1565C0] sm:py-3.5"
                    placeholder="you@company.com"
                  />
                </div>
              </div>

              {error && (
                <div className="rounded-xl border border-red-100 bg-red-50 p-3.5 text-center text-sm font-semibold text-red-600">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={isPending}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-transparent bg-[#0D2B4E] px-4 py-3.5 text-[15px] font-bold text-white shadow-lg shadow-[#0D2B4E]/15 transition-all hover:bg-[#0A2240] focus:outline-none focus:ring-2 focus:ring-[#1565C0] focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70 sm:py-4"
              >
                {isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : t('submit')}
              </button>

              <div className="text-center">
                <Link
                  href="/login"
                  className="inline-flex items-center gap-2 text-sm font-medium text-[#1565C0] transition-colors hover:text-[#0D47A1]"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back to login
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
