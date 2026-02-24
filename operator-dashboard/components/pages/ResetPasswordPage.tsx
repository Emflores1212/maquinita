'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { updatePasswordAction } from '@/app/actions/auth';
import { createBrowserClient } from '@/lib/supabase-browser';

export default function ResetPasswordPage() {
  const t = useTranslations('auth.resetPassword');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isPending, startTransition] = useTransition();

  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    let mounted = true;

    const bootstrapRecoverySession = async () => {
      const supabase = createBrowserClient();
      const code = searchParams.get('code');

      if (code) {
        await supabase.auth.exchangeCodeForSession(code);
      }

      if (mounted) {
        setReady(true);
      }
    };

    void bootstrapRecoverySession();

    return () => {
      mounted = false;
    };
  }, [searchParams]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setError('');

    startTransition(async () => {
      const result = await updatePasswordAction({ password, confirmPassword });

      if (!result.ok) {
        setError(result.error ?? 'No se pudo actualizar la contrasena / Failed to update password');
        return;
      }

      router.replace('/dashboard');
      router.refresh();
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

          {!ready ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-[#1565C0]" />
            </div>
          ) : (
            <form className="space-y-6" onSubmit={handleSubmit} noValidate>
              <div>
                <label htmlFor="new-password" className="block text-sm font-semibold text-slate-700">
                  {t('newPassword')}
                </label>
                <div className="relative mt-2">
                  <input
                    id="new-password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="block w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-4 pr-12 text-sm font-medium text-slate-900 outline-none transition-all placeholder:text-slate-400 focus:border-[#1565C0] focus:bg-white focus:ring-2 focus:ring-[#1565C0] sm:py-3.5"
                    placeholder="••••••••"
                    minLength={8}
                    required
                  />
                  <button
                    type="button"
                    className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-slate-400 transition-colors hover:text-slate-600"
                    onClick={() => setShowPassword((value) => !value)}
                  >
                    {showPassword ? <EyeOff className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
                  </button>
                </div>
              </div>

              <div>
                <label htmlFor="confirm-password" className="block text-sm font-semibold text-slate-700">
                  {t('confirmPassword')}
                </label>
                <div className="relative mt-2">
                  <input
                    id="confirm-password"
                    type={showConfirm ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    className="block w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-4 pr-12 text-sm font-medium text-slate-900 outline-none transition-all placeholder:text-slate-400 focus:border-[#1565C0] focus:bg-white focus:ring-2 focus:ring-[#1565C0] sm:py-3.5"
                    placeholder="••••••••"
                    minLength={8}
                    required
                  />
                  <button
                    type="button"
                    className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-slate-400 transition-colors hover:text-slate-600"
                    onClick={() => setShowConfirm((value) => !value)}
                  >
                    {showConfirm ? <EyeOff className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
                  </button>
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
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
